// Import vouchers from CSV (admin only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = {
  code: string;
  discount_percent: number;
  discount_amount_fixed: number | null;
  max_total_uses: number | null;
  times_used: number;
  scope: "five" | "ten" | "course";
};

type Result = {
  code: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const rows: Row[] = Array.isArray(body?.rows) ? body.rows : [];
    const conflict: "skip" | "update" = body?.conflict === "update" ? "update" : "skip";
    if (rows.length === 0) return json({ error: "no rows" }, 400);
    if (rows.length > 2000) return json({ error: "too many rows (max 2000)" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve card product IDs (kind='class_card', name contains 5/10)
    const { data: cardProducts } = await admin
      .from("products")
      .select("id, name")
      .eq("kind", "class_card");
    const fiveProduct = (cardProducts ?? []).find((p: any) => p.name.includes("5"));
    const tenProduct = (cardProducts ?? []).find((p: any) => p.name.includes("10"));

    const results: Result[] = [];

    for (const raw of rows) {
      const code = (raw.code || "").trim();
      if (!code) {
        results.push({ code: raw.code || "", status: "skipped", message: "kein Code" });
        continue;
      }
      const pct = Number(raw.discount_percent) || 0;
      const fixed = raw.discount_amount_fixed != null ? Number(raw.discount_amount_fixed) : null;
      if (pct <= 0 && !(fixed && fixed > 0)) {
        results.push({ code, status: "skipped", message: "kein Rabatt" });
        continue;
      }

      let applies_to: string[] = ["all"];
      let product_ids: string[] = [];
      let course_type_ids: string[] = [];

      if (raw.scope === "five") {
        applies_to = ["shop_products"];
        if (!fiveProduct) {
          results.push({ code, status: "error", message: "5er-Karten-Produkt nicht gefunden" });
          continue;
        }
        product_ids = [fiveProduct.id];
      } else if (raw.scope === "ten") {
        applies_to = ["shop_products"];
        if (!tenProduct) {
          results.push({ code, status: "error", message: "10er-Karten-Produkt nicht gefunden" });
          continue;
        }
        product_ids = [tenProduct.id];
      } else if (raw.scope === "course") {
        applies_to = ["courses"];
        // empty course_type_ids = all courses
      } else {
        results.push({ code, status: "skipped", message: "Dienstleistung unklar" });
        continue;
      }

      const payload: any = {
        code: code.toUpperCase(),
        description: "Importiert aus WordPress/Amelia",
        discount_percent: pct,
        discount_amount_fixed: fixed,
        applies_to,
        product_ids,
        course_type_ids,
        class_card_types: [],
        video_course_ids: [],
        max_total_uses: raw.max_total_uses ?? null,
        max_uses_per_customer: null,
        times_used: Number(raw.times_used) || 0,
        is_single_use: false,
        is_active: true,
      };

      try {
        const { data: existing } = await admin
          .from("vouchers")
          .select("id")
          .ilike("code", code)
          .maybeSingle();

        if (existing) {
          if (conflict === "skip") {
            results.push({ code, status: "skipped", message: "existiert bereits" });
            continue;
          }
          const { error: updErr } = await admin
            .from("vouchers")
            .update(payload)
            .eq("id", existing.id);
          if (updErr) throw updErr;
          results.push({ code, status: "updated" });
          continue;
        }

        const { error: insErr } = await admin.from("vouchers").insert(payload);
        if (insErr) throw insErr;
        results.push({ code, status: "created" });
      } catch (e) {
        results.push({ code, status: "error", message: String((e as Error).message || e) });
      }
    }

    const summary = results.reduce(
      (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
      {} as Record<string, number>,
    );
    return json({ summary, results });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
