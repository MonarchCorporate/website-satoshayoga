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
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const lesson_id: string = body.lesson_id;
    if (!lesson_id) return json({ error: "lesson_id required" }, 400);

    const { data: lesson, error: le } = await admin
      .from("video_lessons")
      .select("id, course_id, provider, video_id, is_free_preview, title")
      .eq("id", lesson_id)
      .maybeSingle();
    if (le || !lesson) return json({ error: "Lektion nicht gefunden" }, 404);

    // Check access
    let hasAccess = lesson.is_free_preview;
    if (!hasAccess) {
      const { data: chk } = await admin.rpc("has_active_video_access", {
        _user_id: user.id,
        _course_id: lesson.course_id,
      });
      hasAccess = !!chk;
    }
    // Admins always have access
    if (!hasAccess) {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      hasAccess = !!isAdmin;
    }
    if (!hasAccess) return json({ error: "Kein Zugriff auf diesen Kurs" }, 403);

    let embed_url = "";
    if (lesson.provider === "vimeo") {
      embed_url = `https://player.vimeo.com/video/${encodeURIComponent(lesson.video_id)}?dnt=1&pip=0&title=0&byline=0&portrait=0&badge=0`;
    } else {
      embed_url = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(lesson.video_id)}?rel=0&modestbranding=1&disablekb=1&playsinline=1`;
    }

    return json({
      provider: lesson.provider,
      embed_url,
      title: lesson.title,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
