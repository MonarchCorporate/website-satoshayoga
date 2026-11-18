import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, svc);
    const { payout_id } = await req.json();

    const { data: payout } = await admin
      .from("trainer_payouts").select("*, trainers!inner(user_id)").eq("id", payout_id).maybeSingle();
    if (!payout || !payout.pdf_path) return json({ error: "PDF nicht verfügbar" }, 404);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id);
    const isAdmin = roles?.some((r) => r.role === "admin");
    const isOwner = (payout as any).trainers?.user_id === userRes.user.id;
    if (!isAdmin && !isOwner) return json({ error: "Forbidden" }, 403);

    const { data: signed, error } = await admin.storage
      .from("trainer-payouts").createSignedUrl(payout.pdf_path, 3600);
    if (error) return json({ error: error.message }, 500);

    return json({ ok: true, signed_url: signed?.signedUrl });
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
