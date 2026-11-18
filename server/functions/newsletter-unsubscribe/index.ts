// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(__env("SUPABASE_URL")!, __env("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    let token: string | null = null;
    if (req.method === "GET") {
      token = new URL(req.url).searchParams.get("token");
    } else {
      const body = await req.json().catch(() => ({}));
      token = body.token ?? null;
    }
    if (!token) return new Response(JSON.stringify({ error: "Missing token" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: row } = await admin.from("newsletter_unsubscribe_tokens").select("email").eq("token", token).maybeSingle();
    if (!row) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (req.method === "GET") {
      // Just return validity / current state
      const { data: sup } = await admin.from("newsletter_suppressions").select("email").eq("email", row.email).maybeSingle();
      return new Response(JSON.stringify({ email: row.email, alreadyUnsubscribed: !!sup }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // POST -> actually unsubscribe
    await admin.from("newsletter_suppressions").upsert({ email: row.email, reason: "unsubscribe" });
    await admin.from("profiles").update({ newsletter_opt_in: false }).eq("email", row.email);
    return new Response(JSON.stringify({ ok: true, email: row.email }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("unsubscribe error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
