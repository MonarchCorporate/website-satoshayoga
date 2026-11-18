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
