// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const { data: ud } = await userClient.auth.getUser();
    if (!ud?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: ud.user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const enabled = !!body.enabled;

    const { data: existing } = await admin
      .from("payment_settings")
      .select("id")
      .eq("provider", "dev_mode")
      .maybeSingle();

    if (existing) {
      await admin
        .from("payment_settings")
        .update({ is_active: enabled, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await admin.from("payment_settings").insert({
        provider: "dev_mode",
        mode: "sandbox",
        is_active: enabled,
      });
    }

    return json({ ok: true, enabled });
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
