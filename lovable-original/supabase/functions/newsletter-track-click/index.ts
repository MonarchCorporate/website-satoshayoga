import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const recipientId = url.searchParams.get("r");
  const linkId = url.searchParams.get("l");
  let target = "https://santosha-yoga.de";

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
