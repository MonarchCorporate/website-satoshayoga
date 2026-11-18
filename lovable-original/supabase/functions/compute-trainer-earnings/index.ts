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
    const admin = createClient(url, svc);

    const body = await req.json().catch(() => ({}));
    const trainerId: string | undefined = body.trainer_id;

    // Find courses that ended in the past, are not cancelled, and have an instructor
    let q = admin
      .from("courses")
      .select("id, instructor_id, end_time, course_type_id")
      .eq("is_cancelled", false)
      .lt("end_time", new Date().toISOString())
      .not("instructor_id", "is", null);
    if (trainerId) q = q.eq("instructor_id", trainerId);
    const { data: courses, error } = await q;
    if (error) return json({ error: error.message }, 500);

    let created = 0;
    for (const c of courses ?? []) {
      // Skip if earnings row already exists for this trainer/course
      const { data: existing } = await admin
        .from("trainer_earnings")
        .select("id, status, participants_count, amount, tier_id")
        .eq("trainer_id", c.instructor_id)
        .eq("course_id", c.id)
        .maybeSingle();
      if (existing && existing.status !== "pending") continue;

      // Count confirmed bookings
      const { count } = await admin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("course_id", c.id)
        .eq("status", "confirmed");
      const participants = count ?? 0;

      // Find tier
      const { data: tier } = await admin
        .from("trainer_compensation_tiers")
        .select("id, amount, min_participants, max_participants")
        .eq("trainer_id", c.instructor_id)
        .eq("course_type_id", c.course_type_id)
        .lte("min_participants", participants)
        .gte("max_participants", participants)
        .order("amount", { ascending: false })
        .limit(1)
        .maybeSingle();
      const amount = tier?.amount ?? 0;
      const tierId = tier?.id ?? null;

      if (existing) {
        await admin.from("trainer_earnings").update({
          participants_count: participants,
          tier_id: tierId,
          amount,
        }).eq("id", existing.id);
      } else {
        await admin.from("trainer_earnings").insert({
          trainer_id: c.instructor_id,
          course_id: c.id,
          course_date: c.end_time,
          participants_count: participants,
          tier_id: tierId,
          amount,
          status: "pending",
        });
        created++;
      }
    }

    return json({ ok: true, created, scanned: courses?.length ?? 0 });
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
