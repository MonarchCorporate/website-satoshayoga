// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Marks the calling trainer as onboarded (first password set) and notifies the studio once.
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const URL = __env("SUPABASE_URL")!;
    const SR = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = __env("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const uc = createClient(URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: u } = await uc.auth.getUser();
    if (!u.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(URL, SR);
    const { data: t } = await admin.from("trainers")
      .select("id, first_name, last_name, email, onboarded_at").eq("user_id", u.user.id).maybeSingle();
    if (!t) return json({ ok: true, trainer: false });
    if (t.onboarded_at) return json({ ok: true, trainer: true, first: false });

    await admin.from("trainers").update({ onboarded_at: new Date().toISOString() }).eq("id", t.id);

    const { data: cs } = await admin.from("company_settings").select("email").limit(1).maybeSingle();
    const to = cs?.email || "info@yoga-heide.de";
    await admin.functions.invoke("send-customer-email", {
      body: {
        trigger_key: "trainer_onboarded",
        recipient_email: to,
        data: { first_name: t.first_name, last_name: t.last_name, email: t.email ?? u.user.email },
        idempotency_key: `trainer-onboarded-${t.id}`,
      },
    }).catch(() => {});

    return json({ ok: true, trainer: true, first: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
