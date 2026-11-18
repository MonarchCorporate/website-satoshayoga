// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import {
  triggerCustomerEmail,
  formatDate,
  formatTime,
} from "../_shared/customer-email.ts";
import { resolveRequestUser } from "../_shared/guest-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-token",
};

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const guestHeader = req.headers.get("x-guest-token");
    if (!authHeader && !guestHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = __env("SUPABASE_URL")!;
    const anonKey = __env("SUPABASE_ANON_KEY")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const resolved = await resolveRequestUser(req, userClient);
    if (!resolved) return json({ error: "Unauthorized" }, 401);
    const user = { id: resolved.userId, email: resolved.email };

    const body = await req.json().catch(() => ({}));
    const course_id: string | undefined = body.course_id;
    const card_id: string | undefined = body.card_id;
    const rawSeats = Number(body.seats ?? 1);
    const seats = Math.max(1, Math.min(10, Number.isFinite(rawSeats) ? Math.floor(rawSeats) : 1));
    if (!course_id || !card_id) {
      return json({ error: "course_id und card_id erforderlich" }, 400);
    }

    // Validate card
    const { data: card } = await admin
      .from("class_cards")
      .select("*")
      .eq("id", card_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!card) return json({ error: "Karte nicht gefunden" }, 404);
    if (card.status === "cancelled") return json({ error: "Karte wurde storniert" }, 400);
    if (card.remaining_credits < seats)
      return json({ error: `Karte hat nur noch ${card.remaining_credits} Guthaben – ${seats} benötigt.` }, 400);
    if (card.expires_at && new Date(card.expires_at) < new Date())
      return json({ error: "Karte ist abgelaufen" }, 400);

    // Validate course
    const { data: course } = await admin
      .from("courses")
      .select("id, start_time, max_participants, price, is_cancelled, booking_opens_immediately, booking_opens_at, class_cards_allowed")
      .eq("id", course_id)
      .maybeSingle();

    if (!course) return json({ error: "Kurs nicht gefunden" }, 404);
    if (course.is_cancelled) return json({ error: "Kurs ist abgesagt" }, 400);
    if (new Date(course.start_time) < new Date())
      return json({ error: "Kurs liegt in der Vergangenheit" }, 400);
    if (course.class_cards_allowed === false) {
      return json({ error: "Für diesen Kurs sind Gruppenkarten (5er/10er) nicht zulässig." }, 400);
    }
    if (
      course.booking_opens_immediately === false &&
      course.booking_opens_at &&
      new Date(course.booking_opens_at) > new Date()
    ) {
      return json({ error: "Buchung für diesen Kurs ist noch nicht freigegeben." }, 400);
    }

    // Check capacity
    const { count } = await admin
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
      .eq("status", "confirmed");

    const confirmed = count ?? 0;
    if (confirmed + seats > course.max_participants) {
      const free = Math.max(0, course.max_participants - confirmed);
      return json({ error: `Nicht genug freie Plätze (${free} frei, ${seats} angefragt).` }, 400);
    }

    // Reactivate one existing cancelled booking (if any), then create the rest.
    const { data: existing } = await admin
      .from("bookings")
      .select("id, status")
      .eq("course_id", course_id)
      .eq("user_id", user.id)
      .eq("status", "cancelled")
      .limit(1)
      .maybeSingle();

    const createdBookings: any[] = [];
    const consumedCredits: number[] = [];

    const rollback = async () => {
      for (const b of createdBookings) {
        await admin.from("bookings").delete().eq("id", b.id);
      }
      for (const _ of consumedCredits) {
        await admin.rpc("refund_class_card_credit", { _card_id: card_id });
      }
    };

    for (let i = 0; i < seats; i++) {
      let bookingRow: any;
      if (i === 0 && existing) {
        const { data: upd, error: uErr } = await admin
          .from("bookings")
          .update({
            status: "confirmed",
            amount_paid: 0,
            paid_with_card: true,
            card_id,
            payment_method: null,
            payment_id: null,
            refunded: false,
          })
          .eq("id", existing.id)
          .select()
          .single();
        if (uErr || !upd) {
          await rollback();
          return json({ error: uErr?.message ?? "Buchung fehlgeschlagen" }, 500);
        }
        bookingRow = upd;
      } else {
        const { data: ins, error: bErr } = await admin
          .from("bookings")
          .insert({
            user_id: user.id,
            course_id,
            status: "confirmed",
            amount_paid: 0,
            paid_with_card: true,
            card_id,
          })
          .select()
          .single();
        if (bErr || !ins) {
          await rollback();
          return json({ error: bErr?.message ?? "Buchung fehlgeschlagen" }, 500);
        }
        bookingRow = ins;
      }
      createdBookings.push(bookingRow);

      const { data: newRemaining, error: cErr } = await admin.rpc(
        "consume_class_card_credit",
        { _card_id: card_id },
      );
      if (cErr || newRemaining === null || newRemaining === undefined) {
        await rollback();
        return json({ error: cErr?.message ?? "Karte konnte nicht abgebucht werden" }, 500);
      }
      consumedCredits.push(Number(newRemaining));
    }

    const finalRemaining = consumedCredits[consumedCredits.length - 1] ?? card.remaining_credits;

    // Get full course + instructor for email
    const { data: full } = await admin
      .from("courses")
      .select("title, start_time, end_time, location, instructor:trainers(first_name, last_name)")
      .eq("id", course_id)
      .maybeSingle();

    await triggerCustomerEmail(admin, {
      user_id: user.id,
      trigger_key: "booking_confirmation",
      idempotency_key: `booking-${createdBookings[0].id}`,
      data: {
        course_title: (full as any)?.title ?? "",
        course_date: formatDate((full as any)?.start_time),
        course_time: `${formatTime((full as any)?.start_time)} – ${formatTime((full as any)?.end_time)}`,
        course_location: (full as any)?.location ?? "",
        instructor_name: (full as any)?.instructor
          ? `${(full as any).instructor.first_name} ${(full as any).instructor.last_name}`
          : "",
        payment_method: `${card.card_type === "ten" ? "10er" : "5er"}-Karte${seats > 1 ? ` (${seats} Plätze)` : ""}`,
        amount_paid: "0,00 €",
      },
    });

    // Low credit warning (1 left)
    if (finalRemaining === 1) {
      await triggerCustomerEmail(admin, {
        user_id: user.id,
        trigger_key: "card_low_credits",
        idempotency_key: `low-${card_id}`,
        data: {
          card_type: card.card_type === "ten" ? "10er-Karte" : "5er-Karte",
          credits: "1",
        },
      });
    }

    return json({
      ok: true,
      booking_id: createdBookings[0].id,
      booking_ids: createdBookings.map((b) => b.id),
      seats,
      remaining_after: finalRemaining,
      card_id,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
