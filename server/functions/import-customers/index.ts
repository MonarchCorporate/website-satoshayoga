// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Import customers from CSV (admin only). Creates auth users + updates profile fields.
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  birthday?: string | null; // ISO YYYY-MM-DD
  note?: string | null;
};

type Result = {
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
};

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = __env("SUPABASE_URL")!;
    const SERVICE_ROLE = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = __env("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    // Verify caller is admin
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

    const results: Result[] = [];

    for (const raw of rows) {
      const email = (raw.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) {
        results.push({ email: raw.email || "", status: "skipped", message: "keine gültige E-Mail" });
        continue;
      }

      const profileFields = {
        first_name: raw.first_name?.trim() || null,
        last_name: raw.last_name?.trim() || null,
        email,
        phone: raw.phone?.trim() || null,
        birthday: raw.birthday || null,
      };

      try {
        // Existing?
        const { data: existing } = await admin
          .from("profiles")
          .select("id, user_id")
          .eq("email", email)
          .maybeSingle();

        if (existing) {
          if (conflict === "skip") {
            results.push({ email, status: "skipped", message: "existiert bereits" });
            continue;
          }
          const { error: updErr } = await admin
            .from("profiles")
            .update(profileFields)
            .eq("id", existing.id);
          if (updErr) throw updErr;
          results.push({ email, status: "updated" });
          continue;
        }

        // Create auth user (email confirmed, random password). Trigger creates profile row.
        const password = crypto.randomUUID() + crypto.randomUUID();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: profileFields.first_name ?? "",
            last_name: profileFields.last_name ?? "",
          },
        });
        if (createErr || !created.user) {
          // Race: user may already exist in auth but not profile
          if (String(createErr?.message || "").toLowerCase().includes("already")) {
            results.push({ email, status: "skipped", message: "Auth-Account existiert bereits" });
            continue;
          }
          throw createErr ?? new Error("createUser failed");
        }

        // Update profile with additional fields (trigger already inserted the row)
        const { error: updErr } = await admin
          .from("profiles")
          .update(profileFields)
          .eq("user_id", created.user.id);
        if (updErr) throw updErr;

        results.push({ email, status: "created" });
      } catch (e) {
        results.push({ email, status: "error", message: String((e as Error).message || e) });
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
