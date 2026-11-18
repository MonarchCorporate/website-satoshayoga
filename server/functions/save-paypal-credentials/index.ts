// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

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

    const body = await req.json().catch(() => ({}));
    const mode = body.mode === "live" ? "live" : "sandbox";
    const client_id = (body.client_id ?? "").toString().trim();
    const client_secret = (body.client_secret ?? "").toString().trim();
    const webhook_id = body.webhook_id ? String(body.webhook_id).trim() : null;
    const is_active = !!body.is_active;

    if (!client_id || !client_secret) {
      return json({ error: "Client ID und Secret sind erforderlich" }, 400);
    }

    const { error } = await admin.from("payment_settings").upsert(
      {
        provider: "paypal",
        mode,
        client_id,
        client_secret,
        webhook_id,
        is_active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider" },
    );
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true });
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
