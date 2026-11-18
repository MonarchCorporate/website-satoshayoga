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

    const { period_start, period_end, note } = await req.json();
    if (!period_start || !period_end) return json({ error: "period_start/period_end required" }, 400);

    // Find trainer for this user
    const { data: trainer } = await admin
      .from("trainers").select("*").eq("user_id", userRes.user.id).maybeSingle();
    if (!trainer) return json({ error: "Kein Trainerprofil verknüpft" }, 403);

    // Make sure earnings are computed
    await fetch(`${url}/functions/v1/compute-trainer-earnings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${svc}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trainer_id: trainer.id }),
    });

    // Find pending earnings in the period
    const startIso = new Date(period_start + "T00:00:00").toISOString();
    const endIso = new Date(period_end + "T23:59:59").toISOString();

    const { data: earnings } = await admin
      .from("trainer_earnings")
      .select("id, amount")
      .eq("trainer_id", trainer.id)
      .eq("status", "pending")
      .gte("course_date", startIso)
      .lte("course_date", endIso);

    if (!earnings || earnings.length === 0) {
      return json({ error: "Keine offenen Verdienste in diesem Zeitraum." }, 400);
    }

    const subtotal = earnings.reduce((s, e) => s + Number(e.amount), 0);
    const vat_rate = trainer.is_small_business ? 0 : 19;
    const vat_amount = +(subtotal * (vat_rate / 100)).toFixed(2);
    const total = +(subtotal + vat_amount).toFixed(2);

    const snapshot = {
      first_name: trainer.first_name,
      last_name: trainer.last_name,
      email: trainer.email,
      street: trainer.street,
      postal_code: trainer.postal_code,
      city: trainer.city,
      country: trainer.country,
      tax_id: trainer.tax_id,
      tax_number: trainer.tax_number,
      iban: trainer.iban,
      bic: trainer.bic,
      bank_name: trainer.bank_name,
      is_small_business: trainer.is_small_business,
    };

    const { data: payout, error: pErr } = await admin
      .from("trainer_payouts")
      .insert({
        trainer_id: trainer.id,
        period_start, period_end,
        status: "requested",
        subtotal, vat_rate, vat_amount, total,
        trainer_snapshot: snapshot,
        note: note ?? null,
      })
      .select("*").single();
    if (pErr) return json({ error: pErr.message }, 500);

    await admin.from("trainer_earnings")
      .update({ status: "requested", payout_id: payout.id })
      .in("id", earnings.map((e) => e.id));

    return json({ ok: true, payout });
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
