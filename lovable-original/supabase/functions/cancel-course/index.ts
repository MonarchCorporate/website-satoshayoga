// Storniert einen Kurs durch Studio/Trainer:
// - setzt is_cancelled = true
// - storniert alle bestätigten Buchungen
// - bucht Karten-Kontingente zurück
// - veranlasst PayPal-Refund (best effort)
// - sendet course_cancelled E-Mail an alle betroffenen Kunden
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";
import { triggerCustomerEmail, formatDate, formatTime } from "../_shared/customer-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: ud } = await userClient.auth.getUser();
    if (!ud?.user) return json({ error: "Unauthorized" }, 401);
    const user = ud.user;

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");

    const body = await req.json().catch(() => ({}));
    const courseIds: string[] = body.course_ids ?? (body.course_id ? [body.course_id] : []);
    const reason: string = body.reason ?? "";
    if (!courseIds.length) return json({ error: "course_ids required" }, 400);

    const results: any[] = [];

    for (const courseId of courseIds) {
      const { data: course, error: ce } = await admin
        .from("courses")
        .select("id, title, start_time, end_time, location, instructor_id, is_cancelled")
        .eq("id", courseId)
        .maybeSingle();
      if (ce || !course) {
        results.push({ course_id: courseId, error: "Kurs nicht gefunden" });
        continue;
      }

      // Berechtigung: Admin oder Trainer dieses Kurses
      if (!isAdmin) {
        const { data: trainer } = await admin
          .from("trainers")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!trainer || trainer.id !== course.instructor_id) {
          results.push({ course_id: courseId, error: "Nicht berechtigt" });
          continue;
        }
      }

      // Kurs als abgesagt markieren
      await admin.from("courses").update({ is_cancelled: true }).eq("id", courseId);

      // Alle bestätigten Buchungen laden
      const { data: bookings } = await admin
        .from("bookings")
        .select("id, user_id, amount_paid, paid_with_card, card_id, payment_method, payment_id, status")
        .eq("course_id", courseId)
        .eq("status", "confirmed");

      const bookingResults: any[] = [];
      let paypalCfg: any = null;
      let paypalToken: string | null = null;

      for (const b of bookings ?? []) {
        let refundType: "none" | "card_credit" | "paypal" | "manual" = "none";
        let refundInfo = "";

        // Karten-Rückbuchung
        if (b.paid_with_card && b.card_id) {
          const { data: newRemaining, error: rErr } = await admin.rpc(
            "refund_class_card_credit",
            { _card_id: b.card_id },
          );
          if (!rErr && newRemaining !== null && newRemaining !== undefined) {
            refundType = "card_credit";
            refundInfo = "Deine Karte wurde um eine Stunde gutgeschrieben.";
          }
        } else if (b.payment_method === "paypal" && b.payment_id) {
          try {
            if (!paypalCfg) {
              paypalCfg = await loadPaypalConfig(admin);
              paypalToken = await getPaypalAccessToken(paypalCfg);
            }
            const ordRes = await fetch(
              `${paypalBaseUrl(paypalCfg.mode)}/v2/checkout/orders/${b.payment_id}`,
              { headers: { Authorization: `Bearer ${paypalToken}` } },
            );
            const ordJson = await ordRes.json();
            const captureId = ordJson?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
            if (captureId) {
              const refundRes = await fetch(
                `${paypalBaseUrl(paypalCfg.mode)}/v2/payments/captures/${captureId}/refund`,
                {
                  method: "POST",
                  headers: { Authorization: `Bearer ${paypalToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({
                    amount: { value: Number(b.amount_paid).toFixed(2), currency_code: "EUR" },
                    note_to_payer: "Kursabsage – Rückerstattung",
                  }),
                },
              );
              if (refundRes.ok) {
                refundType = "paypal";
                refundInfo = `Eine Rückerstattung wurde via PayPal veranlasst.`;
              } else {
                refundType = "manual";
                refundInfo = "Die Rückerstattung wird manuell bearbeitet.";
              }
            } else {
              refundType = "manual";
              refundInfo = "Die Rückerstattung wird manuell bearbeitet.";
            }
          } catch (_e) {
            refundType = "manual";
            refundInfo = "Die Rückerstattung wird manuell bearbeitet.";
          }
        } else if (Number(b.amount_paid) > 0) {
          refundType = "manual";
          refundInfo = "Die Rückerstattung wird manuell bearbeitet.";
        }

        await admin
          .from("bookings")
          .update({ status: "cancelled", refunded: refundType !== "none" })
          .eq("id", b.id);

        // E-Mail an Kunde
        try {
          await triggerCustomerEmail(admin, {
            user_id: b.user_id,
            trigger_key: "course_cancelled",
            idempotency_key: `course-cancel-${courseId}-${b.id}`,
            data: {
              course_title: course.title,
              course_date: formatDate(course.start_time),
              course_time: `${formatTime(course.start_time)} – ${formatTime(course.end_time)}`,
              course_location: course.location ?? "",
              cancellation_reason: reason,
              refund_info: refundInfo,
            },
          });
        } catch (_e) {
          // best effort
        }

        bookingResults.push({ booking_id: b.id, refund_type: refundType });
      }

      results.push({ course_id: courseId, bookings: bookingResults });
    }

    return json({ ok: true, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
