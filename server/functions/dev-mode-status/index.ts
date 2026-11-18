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
    const admin = createClient(
      __env("SUPABASE_URL")!,
      __env("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("payment_settings")
      .select("is_active")
      .eq("provider", "dev_mode")
      .maybeSingle();
    return json({ enabled: !!data?.is_active });
  } catch (e) {
    return json({ enabled: false, error: (e as Error).message });
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
