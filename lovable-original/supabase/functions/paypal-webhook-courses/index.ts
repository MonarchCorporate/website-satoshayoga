import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const evt = await req.json();
    const type = evt?.event_type as string;
    const resource = evt?.resource ?? {};
    const subId = resource?.id ?? resource?.billing_agreement_id ?? null;
    if (!subId && !resource?.custom_id) return json({ ok: true });

    // Find access record by subscription id or custom_id
    let access: any = null;
    if (subId) {
      const { data } = await admin
        .from("video_course_access")
        .select("*, video_courses(grace_days)")
        .eq("paypal_subscription_id", subId)
        .maybeSingle();
      access = data;
    }
    if (!access && resource?.custom_id) {
      const parts = String(resource.custom_id).split(":");
      if (parts[0] === "videocourse") {
        const cid = parts[1], uid = parts[2];
        const { data } = await admin
          .from("video_course_access")
          .select("*, video_courses(grace_days)")
          .eq("user_id", uid).eq("course_id", cid).maybeSingle();
        access = data;
      }
    }
    if (!access) return json({ ok: true, note: "no access" });

    const graceDays = access.video_courses?.grace_days ?? 7;

    const updates: Record<string, any> = {};
    const paymentLog: any = {
      access_id: access.id, user_id: access.user_id, course_id: access.course_id,
      provider_event_id: evt?.id ?? null,
      currency: resource?.amount?.currency_code ?? "EUR",
      raw_payload: evt,
    };

    switch (type) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "PAYMENT.SALE.COMPLETED": {
        const nextBilling = resource?.billing_info?.next_billing_time
          ?? resource?.billing_agreement?.next_billing_time
          ?? null;
        updates.status = "active";
        updates.grace_until = null;
        updates.last_payment_at = new Date().toISOString();
        if (nextBilling) updates.current_period_end = nextBilling;
        paymentLog.event_type = "renewal";
        paymentLog.amount = Number(resource?.amount?.total ?? resource?.amount?.value ?? 0);
        break;
      }
      case "PAYMENT.SALE.DENIED":
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED": {
        updates.status = "grace";
        updates.grace_until = new Date(Date.now() + graceDays * 86400000).toISOString();
        paymentLog.event_type = "failed";
        paymentLog.amount = Number(resource?.amount?.total ?? resource?.amount?.value ?? 0);
        break;
      }
      case "BILLING.SUBSCRIPTION.CANCELLED": {
        updates.status = "cancelled";
        updates.cancelled_at = new Date().toISOString();
        paymentLog.event_type = "failed";
        break;
      }
      case "BILLING.SUBSCRIPTION.EXPIRED": {
        updates.status = "expired";
        break;
      }
      case "PAYMENT.SALE.REFUNDED": {
        paymentLog.event_type = "refund";
        paymentLog.amount = -Math.abs(Number(resource?.amount?.total ?? 0));
        break;
      }
      default:
        return json({ ok: true, ignored: type });
    }

    if (Object.keys(updates).length > 0) {
      await admin.from("video_course_access").update(updates).eq("id", access.id);
    }
    if (paymentLog.event_type) {
      await admin.from("video_course_payments").insert(paymentLog);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
