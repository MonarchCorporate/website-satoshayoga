// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

export default (async (req) => {
  const url = new URL(req.url);
  const recipientId = url.searchParams.get("r");
  const linkId = url.searchParams.get("l");
  let target = "https://yoga-heide.de";

  try {
    const admin = createClient(__env("SUPABASE_URL")!, __env("SUPABASE_SERVICE_ROLE_KEY")!);
    if (linkId) {
      const { data: link } = await admin.from("newsletter_links").select("url").eq("id", linkId).maybeSingle();
      if (link?.url) target = link.url;
    }
    if (recipientId && linkId) {
      await admin.from("newsletter_clicks").insert({
        recipient_id: recipientId,
        link_id: linkId,
        ip: req.headers.get("x-forwarded-for") ?? null,
        user_agent: req.headers.get("user-agent") ?? null,
      });
      const { data: rec } = await admin.from("newsletter_recipients").select("click_count").eq("id", recipientId).maybeSingle();
      await admin.from("newsletter_recipients").update({
        last_clicked_at: new Date().toISOString(),
        click_count: (rec?.click_count ?? 0) + 1,
      }).eq("id", recipientId);
    }
  } catch (e) {
    console.error("track-click error", e);
  }
  return new Response(null, { status: 302, headers: { Location: target, "Cache-Control": "no-store" } });
});
