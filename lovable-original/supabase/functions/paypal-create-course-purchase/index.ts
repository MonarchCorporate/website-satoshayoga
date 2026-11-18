import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";

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

async function ensurePaypalPlan(
  cfg: any, token: string, admin: any, course: any, interval: "MONTH" | "YEAR", price: number,
) {
  const planField = interval === "MONTH" ? "paypal_plan_monthly_id" : "paypal_plan_yearly_id";
  if (course[planField]) return course[planField];

  // Ensure product exists
  let productId = course.paypal_product_id;
  if (!productId) {
    const pr = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/catalogs/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: `Videokurs: ${course.title}`,
        type: "DIGITAL",
        category: "ONLINE_COURSES",
      }),
    });
    const pd = await pr.json();
    if (!pr.ok) throw new Error("PayPal Produkt: " + JSON.stringify(pd));
    productId = pd.id;
    await admin.from("video_courses").update({ paypal_product_id: productId }).eq("id", course.id);
  }

  // Create plan
  const plRes = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/billing/plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      product_id: productId,
      name: `${course.title} – ${interval === "MONTH" ? "Monatlich" : "Jährlich"}`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: interval, interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: price.toFixed(2), currency_code: "EUR" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CANCEL",
        payment_failure_threshold: 1,
      },
    }),
  });
  const pld = await plRes.json();
  if (!plRes.ok) throw new Error("PayPal Plan: " + JSON.stringify(pld));
  const planId = pld.id;
  await admin.from("video_courses").update({ [planField]: planId }).eq("id", course.id);
  return planId;
}

async function ensureDiscountedPlan(
  cfg: any, token: string, admin: any, course: any,
  interval: "MONTH" | "YEAR", regularPrice: number,
  voucher: { id: string; percent: number },
) {
  // Lookup cached
  const { data: cached } = await admin
    .from("video_course_voucher_plans")
    .select("paypal_plan_id")
    .eq("course_id", course.id)
    .eq("voucher_id", voucher.id)
    .eq("interval_unit", interval)
    .eq("discount_percent", voucher.percent)
    .maybeSingle();
  if (cached?.paypal_plan_id) return cached.paypal_plan_id as string;

  // Ensure the standard plan/product exists first (creates product if missing)
  await ensurePaypalPlan(cfg, token, admin, course, interval, regularPrice);
  const { data: refreshed } = await admin
    .from("video_courses").select("paypal_product_id").eq("id", course.id).maybeSingle();
  const productId = refreshed?.paypal_product_id;
  if (!productId) throw new Error("Kein PayPal-Produkt für Kurs");

  const discounted = Math.max(0.01, Number((regularPrice * (1 - voucher.percent / 100)).toFixed(2)));

  const plRes = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/billing/plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      product_id: productId,
      name: `${course.title} – ${interval === "MONTH" ? "Monatlich" : "Jährlich"} (Gutschein ${voucher.percent}%)`.slice(0, 127),
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: interval, interval_count: 1 },
          tenure_type: "TRIAL",
          sequence: 1,
          total_cycles: 1,
          pricing_scheme: { fixed_price: { value: discounted.toFixed(2), currency_code: "EUR" } },
        },
        {
          frequency: { interval_unit: interval, interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 2,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: regularPrice.toFixed(2), currency_code: "EUR" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CANCEL",
        payment_failure_threshold: 1,
      },
    }),
  });
  const pld = await plRes.json();
  if (!plRes.ok) throw new Error("PayPal Rabatt-Plan: " + JSON.stringify(pld));
  const planId = pld.id as string;
  await admin.from("video_course_voucher_plans").insert({
    course_id: course.id,
    voucher_id: voucher.id,
    interval_unit: interval,
    discount_percent: voucher.percent,
    paypal_plan_id: planId,
  });
  return planId;
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

    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return json({ error: "Unauthorized" }, 401);
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const course_id: string = body.course_id;
    const mode: "one_time" | "monthly" | "yearly" = body.mode;
    const return_url: string = body.return_url;
    const cancel_url: string = body.cancel_url;
    const voucher_code: string | undefined = body.voucher_code;
    if (!course_id || !mode || !return_url || !cancel_url) {
      return json({ error: "course_id, mode, return_url, cancel_url required" }, 400);
    }

    const { data: course, error: ce } = await admin
      .from("video_courses")
      .select("*")
      .eq("id", course_id)
      .maybeSingle();
    if (ce || !course) return json({ error: "Kurs nicht gefunden" }, 404);
    if (!course.is_published) return json({ error: "Kurs nicht verfügbar" }, 400);

    const cfg = await loadPaypalConfig(admin);
    const token = await getPaypalAccessToken(cfg);

    // Resolve base price for the chosen mode
    let basePrice = 0;
    if (mode === "one_time") basePrice = Number(course.price_once ?? 0);
    else if (mode === "monthly") basePrice = Number(course.price_monthly ?? 0);
    else basePrice = Number(course.price_yearly ?? 0);

    // Validate voucher (server-side) if provided
    let voucherId: string | null = null;
    let voucherDiscount = 0;
    let voucherCodeUpper: string | null = null;
    if (voucher_code && basePrice > 0) {
      const { data: vRes, error: vErr } = await userClient.rpc("validate_voucher_cart", {
        _code: voucher_code,
        _cart: [{ type: "video_course", ref_id: course.id, amount: basePrice }],
      });
      if (vErr) return json({ error: "Gutschein konnte nicht geprüft werden" }, 400);
      const v: any = vRes;
      if (!v?.ok) return json({ error: v?.error || "Gutschein ungültig" }, 400);
      voucherId = v.voucher_id;
      voucherDiscount = Number(v.discount_amount ?? 0);
      voucherCodeUpper = String(v.code ?? voucher_code).toUpperCase();
    }

    if (mode === "one_time") {
      if (course.access_model !== "one_time" || !course.price_once || Number(course.price_once) <= 0) {
        return json({ error: "Kein Einmalpreis verfügbar" }, 400);
      }
      const finalPrice = Math.max(0, Number((basePrice - voucherDiscount).toFixed(2)));
      const ppRes = await fetch(`${paypalBaseUrl(cfg.mode)}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: "EUR", value: finalPrice.toFixed(2) },
            description: `Videokurs: ${course.title}`.slice(0, 127),
            custom_id: `videocourse:${course.id}:${user.id}${voucherId ? `:v=${voucherId}` : ""}`,
          }],
          application_context: {
            brand_name: "Santosha Yoga",
            user_action: "PAY_NOW",
            return_url,
            cancel_url,
          },
        }),
      });
      const pd = await ppRes.json();
      if (!ppRes.ok) return json({ error: "PayPal Order Fehler", details: pd }, 500);
      const approve = (pd.links ?? []).find((l: any) => l.rel === "approve");
      return json({
        kind: "order",
        paypal_order_id: pd.id,
        approve_url: approve?.href,
        voucher: voucherId ? { id: voucherId, code: voucherCodeUpper, discount_amount: voucherDiscount } : null,
      });
    }


    // Subscription
    if (course.access_model !== "subscription") {
      return json({ error: "Kurs unterstützt kein Abo" }, 400);
    }

    const interval = mode === "monthly" ? "MONTH" : "YEAR";
    const price = mode === "monthly" ? Number(course.price_monthly) : Number(course.price_yearly);
    if (!price || price <= 0) return json({ error: "Preis nicht konfiguriert" }, 400);

    // Re-fetch the voucher percent (validate_voucher_cart returned discount_percent we can use)
    let voucherPercent = 0;
    if (voucherId) {
      const { data: vrow } = await admin
        .from("vouchers").select("discount_percent").eq("id", voucherId).maybeSingle();
      voucherPercent = Number(vrow?.discount_percent ?? 0);
    }

    const planId = voucherId && voucherPercent > 0
      ? await ensureDiscountedPlan(cfg, token, admin, course, interval as any, price, { id: voucherId, percent: voucherPercent })
      : await ensurePaypalPlan(cfg, token, admin, course, interval as any, price);

    const subRes = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/billing/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: `videocourse:${course.id}:${user.id}:${mode}${voucherId ? `:v=${voucherId}` : ""}`,
        subscriber: { email_address: user.email },
        application_context: {
          brand_name: "Santosha Yoga",
          user_action: "SUBSCRIBE_NOW",
          return_url,
          cancel_url,
        },
      }),
    });
    const sd = await subRes.json();
    if (!subRes.ok) return json({ error: "PayPal Subscription Fehler", details: sd }, 500);
    const approve = (sd.links ?? []).find((l: any) => l.rel === "approve");
    return json({
      kind: "subscription",
      paypal_subscription_id: sd.id,
      approve_url: approve?.href,
      voucher: voucherId ? { id: voucherId, code: voucherCodeUpper, discount_amount: voucherDiscount } : null,
    });

  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
