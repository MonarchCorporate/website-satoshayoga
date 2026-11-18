// Free booking: apply a 100% (or full-cover) voucher to a single course and
// create the confirmed booking(s) without going through PayPal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveVoucher, recordRedemption } from "../_shared/voucher.ts";
import { resolveRequestUser } from "../_shared/guest-token.ts";
import {
  triggerCustomerEmail,
  formatDate,
  formatTime,
  formatMoney,
} from "../_shared/customer-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-token",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const resolved = await resolveRequestUser(req, userClient);
    if (!resolved) return json({ error: "Unauthorized" }, 401);
    const user = { id: resolved.userId, email: resolved.email };

    const body = await req.json().catch(() => ({}));
    const course_id: string | null = body.course_id ?? null;
    const voucher_code: string | null = body.voucher_code ?? null;
    const billing = body.billing ?? {};
    const rawSeats = Number(body.seats ?? 1);
    const seats = Math.max(1, Math.min(10, Number.isFinite(rawSeats) ? Math.floor(rawSeats) : 1));
    if (!course_id || !voucher_code) return json({ error: "course_id und voucher_code erforderlich" }, 400);

    const { data: course, error: cErr } = await admin
      .from("courses")
      .select("id, title, start_time, end_time, price, location, course_type_id, booking_opens_immediately, booking_opens_at, instructor:trainers(first_name, last_name)")
      .eq("id", course_id)
      .maybeSingle();
    if (cErr || !course) return json({ error: "Kurs nicht gefunden" }, 404);

    if (
      course.booking_opens_immediately === false &&
      course.booking_opens_at &&
      new Date(course.booking_opens_at) > new Date()
    ) {
      return json({
        error: `Dieser Kurs ist noch nicht buchbar (Buchung ab ${new Date(course.booking_opens_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}).`,
      }, 400);
    }


    const price = Number(course.price) || 0;
    // Voucher must cover ALL seats fully. Build cart with seats course lines.
    const cartLines = Array.from({ length: seats }, () => ({
      type: "course" as const, ref_id: course.course_type_id ?? null, amount: price,
    }));
    const res = await resolveVoucher(admin, user.id, voucher_code, cartLines);
    if (!res.ok) return json({ error: res.error }, 400);
    const totalPrice = price * seats;
    const discount = Math.min(res.voucher.discount_amount, totalPrice);
    if (discount < totalPrice) {
      return json({ error: "Gutschein deckt nicht den vollen Preis. Bitte via PayPal zahlen." }, 400);
    }

    // Capacity check
    const { data: courseCap } = await admin
      .from("courses")
      .select("max_participants")
      .eq("id", course_id)
      .maybeSingle();
    if (courseCap?.max_participants) {
      const { data: cnt } = await admin.rpc("get_course_participant_count", { course_uuid: course_id });
      const confirmed = Number(cnt ?? 0);
      if (confirmed + seats > courseCap.max_participants) {
        return json({ error: `Nicht genug freie Plätze (${Math.max(0, courseCap.max_participants - confirmed)} frei, ${seats} angefragt).` }, 400);
      }
    }

    const paymentId = `VOUCHER-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        status: "paid",
        subtotal: totalPrice.toFixed(2),
        tax_total: "0.00",
        total: "0.00",
        payment_method: "voucher",
        payment_id: paymentId,
        paid_at: new Date().toISOString(),
        voucher_id: res.voucher.voucher_id,
        voucher_code: res.voucher.code,
        discount_amount: discount.toFixed(2),
        billing_first_name: billing.first_name ?? null,
        billing_last_name: billing.last_name ?? null,
        billing_email: billing.email ?? user.email,
        billing_phone: billing.phone ?? null,
        billing_street: billing.street ?? null,
        billing_postal_code: billing.postal_code ?? null,
        billing_city: billing.city ?? null,
        billing_country: billing.country ?? "Deutschland",
      })
      .select()
      .single();
    if (oErr || !order) return json({ error: oErr?.message ?? "Order failed" }, 500);

    await admin.from("order_items").insert({
      order_id: order.id,
      product_id: null,
      course_id,
      item_type: "course_booking",
      name: course.title,
      description: `Kursbuchung (Gutschein)${seats > 1 ? ` – ${seats} Plätze` : ""}`,
      quantity: seats,
      unit_price: 0,
      tax_rate: 0,
      line_total: 0,
    });

    for (let i = 0; i < seats; i++) {
      const { error: bookingErr } = await admin.from("bookings").insert({
        user_id: user.id,
        course_id,
        status: "confirmed",
        amount_paid: 0,
        payment_method: "admin_grant",
        payment_id: paymentId,
        paid_with_card: false,
        voucher_id: res.voucher.voucher_id,
        voucher_code: res.voucher.code,
        discount_amount: (discount / seats).toFixed(2),
      });
      if (bookingErr) return json({ error: bookingErr.message }, 500);

      await recordRedemption(admin, {
        voucher_id: res.voucher.voucher_id,
        user_id: user.id,
        order_id: order.id,
        discount_amount: discount / seats,
      });
    }

    // Clear cart if any
    await admin.from("cart_items").delete().eq("user_id", user.id);

    // Emails (best effort)
    try {
      await triggerCustomerEmail(admin, {
        user_id: user.id,
        trigger_key: "booking_confirmation",
        idempotency_key: `booking-${order.id}-${course_id}`,
        data: {
          course_title: course.title,
          course_date: formatDate(course.start_time),
          course_time: `${formatTime(course.start_time)} – ${formatTime(course.end_time)}`,
          course_location: (course as any).location ?? "",
          instructor_name: (course as any).instructor
            ? `${(course as any).instructor.first_name} ${(course as any).instructor.last_name}`
            : "",
          payment_method: `Gutschein ${res.voucher.code}${seats > 1 ? ` (${seats} Plätze)` : ""}`,
          amount_paid: formatMoney(0),
        },
      });
      await triggerCustomerEmail(admin, {
        user_id: user.id,
        trigger_key: "order_confirmation",
        idempotency_key: `order-${order.id}`,
        data: {
          order_number: order.order_number ?? order.id,
          order_total: formatMoney(0),
          invoice_url: "#",
        },
      });
    } catch (e) {
      console.warn("[book-with-voucher] email failed", e);
    }

    return json({ ok: true, order_id: order.id, order_number: order.order_number, seats });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
