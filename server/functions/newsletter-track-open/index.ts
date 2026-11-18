// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

export default (async (req) => {
  const url = new URL(req.url);
  const recipientId = url.searchParams.get("r");
  const respond = () => new Response(PIXEL, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache" } });
  if (!recipientId) return respond();

  try {
    const admin = createClient(__env("SUPABASE_URL")!, __env("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rec } = await admin.from("newsletter_recipients").select("id, opened_at, open_count").eq("id", recipientId).maybeSingle();
    if (rec) {
      await admin.from("newsletter_recipients").update({
        opened_at: rec.opened_at ?? new Date().toISOString(),
        open_count: (rec.open_count ?? 0) + 1,
      }).eq("id", rec.id);
    }
  } catch (e) {
    console.error("track-open error", e);
  }
  return respond();
});
