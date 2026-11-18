// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { getPaypalAccessToken } from "../_shared/paypal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", ud.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const { data: cfg } = await admin
      .from("payment_settings")
      .select("mode, client_id, client_secret, webhook_id, is_active, updated_at")
      .eq("provider", "paypal")
      .maybeSingle();

    if (!cfg || !cfg.client_id || !cfg.client_secret) {
      return json({
        configured: false,
        connected: false,
        mode: cfg?.mode ?? "sandbox",
        is_active: false,
      });
    }

    let connected = false;
    let error_message: string | null = null;
    try {
      await getPaypalAccessToken({
        mode: cfg.mode as "sandbox" | "live",
        client_id: cfg.client_id,
        client_secret: cfg.client_secret,
        is_active: cfg.is_active,
      });
      connected = true;
    } catch (e) {
      error_message = (e as Error).message;
    }

    return json({
      configured: true,
      connected,
      mode: cfg.mode,
      is_active: cfg.is_active,
      has_webhook: !!cfg.webhook_id,
      updated_at: cfg.updated_at,
      error: error_message,
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
