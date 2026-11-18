import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";
import { triggerCustomerEmail, formatDate, formatTime, formatMoney } from "../_shared/customer-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

    const body = await req.json().catch(() => ({}));
    const booking_id: string = body.booking_id;
    if (!booking_id) return json({ error: "booking_id required" }, 400);

    // Load booking + course; check admin override
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r: any) => r.role === "admin");

    const { data: booking, error: be } = await admin
      .from("bookings")
      .select("id, user_id, course_id, status, amount_paid, paid_with_card, card_id, payment_method, payment_id, voucher_id, voucher_code, courses(title, start_time, end_time, location)")
      .eq("id", booking_id)
      .maybeSingle();
    if (be || !booking) return json({ error: "Buchung nicht gefunden" }, 404);
    if (booking.user_id !== user.id && !isAdmin) {
      return json({ error: "Nicht berechtigt" }, 403);
    }
    if (booking.status === "cancelled") {
      return json({ error: "Buchung ist bereits storniert" }, 400);
    }

    const start = new Date((booking as any).courses.start_time);
    const hoursUntil = (start.getTime() - Date.now()) / (1000 * 60 * 60);
    const eligible = hoursUntil >= 24;

    // ATOMIC transition: only exactly one concurrent request can flip confirmed → cancelled.
    // If no row is returned, another request already cancelled it – abort without any refund.
    const { data: transitioned, error: txErr } = await admin
      .from("bookings")
      .update({ status: "cancelled", refunded: false })
      .eq("id", booking.id)
      .neq("status", "cancelled")
      .select("id")
      .maybeSingle();
    if (txErr) return json({ error: txErr.message }, 500);
    if (!transitioned) {
      return json({ error: "Buchung ist bereits storniert" }, 409);
    }

    let refundType: "none" | "card_credit" | "paypal" | "manual" | "voucher" = "none";
    let refundDetails: any = null;

    if (eligible) {
      // Card-paid → restore credit
      if (booking.paid_with_card && booking.card_id) {
        const { data: newRemaining, error: rErr } = await admin.rpc(
          "refund_class_card_credit",
          { _card_id: booking.card_id },
        );
        if (!rErr && newRemaining !== null && newRemaining !== undefined) {
          refundType = "card_credit";
          refundDetails = { card_id: booking.card_id, new_remaining: newRemaining };
        }
      }

      // Voucher-paid → refund the voucher usage (decrement times_used + drop redemption)
      // Handled in addition to any other refund so a partial voucher discount is also freed.
      if (booking.voucher_id) {
        try {
          // Remove redemption row(s) tied to this booking
          await admin
            .from("voucher_redemptions")
            .delete()
            .eq("voucher_id", booking.voucher_id)
            .eq("booking_id", booking.id);

          // Decrement times_used (never below 0)
          const { data: v } = await admin
            .from("vouchers")
            .select("times_used, code")
            .eq("id", booking.voucher_id)
            .maybeSingle();
          const current = Number(v?.times_used ?? 0);
          const next = Math.max(0, current - 1);
          await admin
            .from("vouchers")
            .update({ times_used: next })
            .eq("id", booking.voucher_id);

          if (refundType === "none") {
            refundType = "voucher";
            refundDetails = { voucher_id: booking.voucher_id, code: v?.code ?? booking.voucher_code, times_used: next };
          } else {
            refundDetails = { ...(refundDetails ?? {}), voucher_refunded: true, voucher_code: v?.code ?? booking.voucher_code };
          }
        } catch (_e) {
          // best-effort
        }
      }

      if (refundType === "none" && booking.payment_method === "paypal" && booking.payment_id) {
        // PayPal refund: find capture id from related order, then refund
        try {
          const cfg = await loadPaypalConfig(admin);
          const accessToken = await getPaypalAccessToken(cfg);
          const ordRes = await fetch(
            `${paypalBaseUrl(cfg.mode)}/v2/checkout/orders/${booking.payment_id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );
          const ordJson = await ordRes.json();
          const captureId = ordJson?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
          if (captureId) {
            const refundRes = await fetch(
              `${paypalBaseUrl(cfg.mode)}/v2/payments/captures/${captureId}/refund`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  amount: {
                    value: Number(booking.amount_paid).toFixed(2),
                    currency_code: "EUR",
                  },
                  note_to_payer: "Stornierung Yoga-Kurs",
                }),
              },
            );
            const refundJson = await refundRes.json();
            if (!refundRes.ok) {
              refundType = "manual";
              refundDetails = { error: refundJson, note: "PayPal-Refund fehlgeschlagen, manuelle Bearbeitung nötig" };
            } else {
              refundType = "paypal";
              refundDetails = { refund_id: refundJson.id, capture_id: captureId };
            }
          } else {
            refundType = "manual";
            refundDetails = { note: "Kein Capture gefunden, manuelle Erstattung nötig" };
          }
        } catch (e) {
          refundType = "manual";
          refundDetails = { error: (e as Error).message, note: "PayPal-Konfiguration fehlt – manuelle Bearbeitung" };
        }
      } else if (
        refundType === "none" &&
        (booking.payment_method === "simulated_paypal" || booking.payment_method === "simulated_card")
      ) {
        refundType = "manual";
        refundDetails = { note: "Test-Zahlung – Refund nur markiert" };
      } else if (refundType === "none" && Number(booking.amount_paid) > 0) {
        refundType = "manual";
        refundDetails = { note: "Manuelle Erstattung erforderlich" };
      }
    }

    // Flag refunded if we actually did something
    if (eligible && refundType !== "none") {
      await admin.from("bookings").update({ refunded: true }).eq("id", booking.id);
    }


    // Email customer
    try {
      const c = (booking as any).courses;
      await triggerCustomerEmail(admin, {
        user_id: booking.user_id,
        trigger_key: "booking_cancelled",
        idempotency_key: `cancel-${booking.id}`,
        data: {
          course_title: c?.title ?? "",
          course_date: formatDate(c?.start_time),
          course_time: `${formatTime(c?.start_time)} – ${formatTime(c?.end_time)}`,
          course_location: c?.location ?? "",
          refund_info:
            refundType === "card_credit"
              ? "Deine Karte wurde um eine Stunde gutgeschrieben."
              : refundType === "voucher"
              ? "Dein Gutschein wurde wieder freigegeben und kann erneut eingelöst werden."
              : refundType === "paypal"
              ? `Eine Rückerstattung von ${formatMoney(Number(booking.amount_paid))} wurde via PayPal veranlasst.`
              : refundType === "manual"
              ? "Die Rückerstattung wird manuell bearbeitet."
              : eligible
              ? "Für diese Buchung ist keine Rückerstattung nötig (kostenlose Buchung bzw. Admin-Zuweisung)."
              : "Da die Stornierung weniger als 24 Stunden vor Kursbeginn erfolgte, ist keine Rückerstattung möglich.",
        },
      });
    } catch (_e) {
      // best-effort
    }

    return json({
      ok: true,
      eligible,
      hours_until: Math.round(hoursUntil * 10) / 10,
      refund_type: refundType,
      refund_details: refundDetails,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
