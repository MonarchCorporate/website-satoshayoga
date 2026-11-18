// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(
      __env("SUPABASE_URL")!,
      __env("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const nowIso = new Date().toISOString();
    const r1 = await admin
      .from("video_course_access")
      .update({ status: "expired" })
      .eq("status", "grace")
      .lt("grace_until", nowIso)
      .select("id");
    const r2 = await admin
      .from("video_course_access")
      .update({ status: "expired" })
      .eq("status", "cancelled")
      .not("current_period_end", "is", null)
      .lt("current_period_end", nowIso)
      .select("id");
    return json({ ok: true, grace_expired: r1.data?.length ?? 0, cancelled_expired: r2.data?.length ?? 0 });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
