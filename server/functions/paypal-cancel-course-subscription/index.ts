// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabaseUrl = __env("SUPABASE_URL")!;
    const anonKey = __env("SUPABASE_ANON_KEY")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: ud } = await userClient.auth.getUser();
    if (!ud?.user) return json({ error: "Unauthorized" }, 401);

    const { access_id } = await req.json().catch(() => ({}));
    if (!access_id) return json({ error: "access_id required" }, 400);

    const { data: access } = await admin
      .from("video_course_access")
      .select("*")
      .eq("id", access_id)
      .eq("user_id", ud.user.id)
      .maybeSingle();
    if (!access) return json({ error: "Zugang nicht gefunden" }, 404);
    if (access.access_type !== "subscription" || !access.paypal_subscription_id) {
      return json({ error: "Kein Abo" }, 400);
    }

    const cfg = await loadPaypalConfig(admin);
    const token = await getPaypalAccessToken(cfg);
    const r = await fetch(
      `${paypalBaseUrl(cfg.mode)}/v1/billing/subscriptions/${access.paypal_subscription_id}/cancel`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User requested cancellation" }),
      },
    );
    if (!r.ok && r.status !== 204) {
      const d = await r.text();
      return json({ error: "PayPal Kündigung fehlgeschlagen", details: d }, 500);
    }
    await admin.from("video_course_access").update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    }).eq("id", access_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
