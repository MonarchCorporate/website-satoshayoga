// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";
import { resolveRequestUser } from "../_shared/guest-token.ts";
import { fulfillPaypalOrder } from "../_shared/paypal-fulfill.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-token",
};

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
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
    const paypal_order_id: string = body.paypal_order_id;
    if (!paypal_order_id) return json({ error: "paypal_order_id required" }, 400);

    // Load local order, verify ownership
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("*")
      .eq("payment_id", paypal_order_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    if (order.status === "paid") {
      return json({ ok: true, already_paid: true, order_id: order.id, order_number: order.order_number });
    }

    // Capture
    const cfg = await loadPaypalConfig(admin);
    const accessToken = await getPaypalAccessToken(cfg);
    const capRes = await fetch(
      `${paypalBaseUrl(cfg.mode)}/v2/checkout/orders/${paypal_order_id}/capture`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const capData = await capRes.json();
    if (!capRes.ok) {
      return json({ error: "Capture failed", details: capData }, 500);
    }
    if (capData.status !== "COMPLETED") {
      return json({ error: "Payment not completed", status: capData.status }, 400);
    }

    const capture = capData?.purchase_units?.[0]?.payments?.captures?.[0];

    // Single source of truth for fulfillment (multi-seat safe + idempotent)
    const result = await fulfillPaypalOrder(
      admin,
      supabaseUrl,
      serviceKey,
      order,
      paypal_order_id,
      capture,
    );

    if (!result.ok) {
      return json({
        error: "Zahlungsbetrag stimmt nicht überein. Bitte kontaktiere den Support.",
        reason: result.reason,
      }, 400);
    }

    return json({
      ok: true,
      order_id: result.order_id,
      order_number: result.order_number,
    });
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
