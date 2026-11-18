import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return json({ error: "Unauthorized" }, 401);
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const course_id: string = body.course_id;
    const kind: "order" | "subscription" = body.kind;
    const paypal_id: string = body.paypal_id;
    if (!course_id || !kind || !paypal_id) return json({ error: "Missing fields" }, 400);

    const { data: course } = await admin.from("video_courses").select("*").eq("id", course_id).maybeSingle();
    if (!course) return json({ error: "Kurs nicht gefunden" }, 404);

    const cfg = await loadPaypalConfig(admin);
    const token = await getPaypalAccessToken(cfg);

    if (kind === "order") {
      const r = await fetch(`${paypalBaseUrl(cfg.mode)}/v2/checkout/orders/${paypal_id}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const d = await r.json();
      if (!r.ok && d?.name !== "ORDER_ALREADY_CAPTURED") {
        return json({ error: "Capture fehlgeschlagen", details: d }, 500);
      }
      const amount = Number(d?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? course.price_once ?? 0);
      const customId: string = d?.purchase_units?.[0]?.custom_id ?? "";
      const voucherIdMatch = customId.match(/:v=([0-9a-f-]{36})/i);
      const voucherId = voucherIdMatch?.[1] ?? null;

      const { data: access, error: ae } = await admin
        .from("video_course_access")
        .upsert(
          {
            user_id: user.id,
            course_id,
            access_type: "one_time",
            status: "active",
            current_period_end: null,
            grace_until: null,
            paypal_order_id: paypal_id,
            last_payment_at: new Date().toISOString(),
          },
          { onConflict: "user_id,course_id" },
        )
        .select()
        .single();
      if (ae) return json({ error: ae.message }, 500);
      await admin.from("video_course_payments").insert({
        access_id: access.id, user_id: user.id, course_id,
        provider_event_id: paypal_id, amount, currency: "EUR",
        event_type: "initial", raw_payload: d,
      });
      if (voucherId) {
        // Best-effort voucher redemption; increments usage via trigger
        await admin.from("voucher_redemptions").insert({
          voucher_id: voucherId,
          user_id: user.id,
          discount_amount: Math.max(0, Number(course.price_once ?? 0) - amount),
        });
      }
      return json({ ok: true, access_id: access.id });
    }



    // Subscription
    const r = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/billing/subscriptions/${paypal_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    if (!r.ok) return json({ error: "Subscription Lookup fehlgeschlagen", details: d }, 500);
    if (d.status !== "ACTIVE" && d.status !== "APPROVAL_PENDING" && d.status !== "APPROVED") {
      return json({ error: `Status ${d.status}` }, 400);
    }
    const nextBilling = d?.billing_info?.next_billing_time ?? null;
    const lastPayment = d?.billing_info?.last_payment?.time ?? new Date().toISOString();
    const amount = Number(d?.billing_info?.last_payment?.amount?.value ?? 0);

    const { data: access, error: ae } = await admin
      .from("video_course_access")
      .upsert({
        user_id: user.id,
        course_id,
        access_type: "subscription",
        status: "active",
        current_period_end: nextBilling,
        grace_until: null,
        paypal_subscription_id: paypal_id,
        last_payment_at: lastPayment,
      }, { onConflict: "user_id,course_id" })
      .select()
      .single();
    if (ae) return json({ error: ae.message }, 500);
    if (amount > 0) {
      await admin.from("video_course_payments").insert({
        access_id: access.id, user_id: user.id, course_id,
        provider_event_id: paypal_id, amount, currency: "EUR",
        event_type: "initial", raw_payload: d,
      });
    }
    // Voucher redemption (subscription discount on first payment)
    const subCustom: string = d?.custom_id ?? "";
    const subVoucherMatch = subCustom.match(/:v=([0-9a-f-]{36})/i);
    const subVoucherId = subVoucherMatch?.[1] ?? null;
    if (subVoucherId) {
      const { data: regular } = await admin
        .from("video_courses")
        .select("price_monthly, price_yearly")
        .eq("id", course_id).maybeSingle();
      const interval = subCustom.includes(":monthly") ? "monthly" : "yearly";
      const regularPrice = interval === "monthly"
        ? Number(regular?.price_monthly ?? 0)
        : Number(regular?.price_yearly ?? 0);
      const discount = Math.max(0, regularPrice - amount);
      await admin.from("voucher_redemptions").insert({
        voucher_id: subVoucherId,
        user_id: user.id,
        discount_amount: discount,
      });
    }

    return json({ ok: true, access_id: access.id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
