// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Automatisches Reconcile für hängende PayPal-Bestellungen.
// - status=paid, wenn PayPal-Zahlung erfolgreich (COMPLETED, ggf. inkl. Capture)
// - status=cancelled, wenn PayPal-Order VOIDED/expired oder älter als CANCEL_AFTER_HOURS Stunden
// Wird über pg_cron alle 10 Minuten aufgerufen.

import { createClient } from "../../src/supabase-server";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";
import { fulfillPaypalOrder } from "../_shared/paypal-fulfill.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHECK_AFTER_MINUTES = 5;   // ignoriere ganz frische Orders
const CANCEL_AFTER_HOURS = 24;   // nach 24h ohne Erfolg → stornieren

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = __env("SUPABASE_URL")!;
  const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const summary: any[] = [];

  try {
    const cfg = await loadPaypalConfig(admin);
    const accessToken = await getPaypalAccessToken(cfg);
    const base = paypalBaseUrl(cfg.mode);

    const cutoff = new Date(Date.now() - CHECK_AFTER_MINUTES * 60 * 1000).toISOString();
    const cancelCutoff = new Date(Date.now() - CANCEL_AFTER_HOURS * 3600 * 1000).toISOString();

    const { data: pendings, error } = await admin
      .from("orders")
      .select("*")
      .eq("status", "pending")
      .eq("payment_method", "paypal")
      .not("payment_id", "is", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }

    for (const order of pendings ?? []) {
      const ppId = order.payment_id as string;
      try {
        // Hole PayPal-Order-Status
        const res = await fetch(`${base}/v2/checkout/orders/${ppId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) {
          // Order existiert bei PayPal nicht (mehr) → stornieren
          await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
          summary.push({ order_number: order.order_number, action: "cancelled_not_found_at_paypal" });
          continue;
        }
        if (!res.ok) {
          const txt = await res.text();
          summary.push({ order_number: order.order_number, error: `paypal_status_${res.status}`, details: txt.substring(0, 200) });
          continue;
        }
        const pp = await res.json();
        const status = pp.status as string; // CREATED | SAVED | APPROVED | VOIDED | COMPLETED | PAYER_ACTION_REQUIRED
        let capture = pp?.purchase_units?.[0]?.payments?.captures?.[0];

        if (status === "COMPLETED" && capture) {
          const r = await fulfillPaypalOrder(admin, supabaseUrl, serviceKey, order, ppId, capture);
          summary.push({ order_number: order.order_number, action: "fulfilled", ok: r.ok, reason: r.reason });
          continue;
        }

        if (status === "APPROVED") {
          // Payer hat zugestimmt aber Capture nie ausgeführt → nachholen
          const capRes = await fetch(`${base}/v2/checkout/orders/${ppId}/capture`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const capData = await capRes.json();
          if (capRes.ok && capData.status === "COMPLETED") {
            capture = capData?.purchase_units?.[0]?.payments?.captures?.[0];
            const r = await fulfillPaypalOrder(admin, supabaseUrl, serviceKey, order, ppId, capture);
            summary.push({ order_number: order.order_number, action: "captured_and_fulfilled", ok: r.ok, reason: r.reason });
          } else {
            summary.push({ order_number: order.order_number, action: "capture_failed", status: capData?.status, details: capData });
          }
          continue;
        }

        if (status === "VOIDED") {
          await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
          summary.push({ order_number: order.order_number, action: "cancelled_voided" });
          continue;
        }

        // Status CREATED / SAVED / PAYER_ACTION_REQUIRED → warten,
        // aber wenn > CANCEL_AFTER_HOURS: als storniert markieren.
        if (order.created_at < cancelCutoff) {
          await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
          summary.push({ order_number: order.order_number, action: "cancelled_stale", paypal_status: status });
        } else {
          summary.push({ order_number: order.order_number, action: "waiting", paypal_status: status });
        }
      } catch (e) {
        summary.push({ order_number: order.order_number, error: (e as Error).message });
      }
    }

    return json({ ok: true, checked: pendings?.length ?? 0, results: summary });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message, partial: summary }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
