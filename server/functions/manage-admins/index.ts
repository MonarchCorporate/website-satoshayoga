// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Edge function: manage-admins
// List, add, remove admin accounts. Admin-only.

import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = __env("SUPABASE_URL")!;
    const SERVICE_ROLE = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = __env("SUPABASE_PUBLISHABLE_KEY") ??
      __env("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp.user) return json({ error: "Unauthorized" }, 401);

    const callerId = userResp.user.id;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: roleRow } = await admin.from("user_roles")
      .select("role").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (action === "list") {
      const { data: roles, error: rErr } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (rErr) return json({ error: rErr.message }, 500);

      const ids = (roles ?? []).map((r) => r.user_id);
      if (ids.length === 0) return json({ admins: [] });

      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);

      // Get auth emails (more authoritative than profile.email)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const authMap = new Map(list?.users?.map((u) => [u.id, u.email]) ?? []);

      const admins = ids.map((id) => {
        const p = profiles?.find((pr) => pr.user_id === id);
        return {
          user_id: id,
          email: authMap.get(id) ?? p?.email ?? null,
          first_name: p?.first_name ?? null,
          last_name: p?.last_name ?? null,
          is_self: id === callerId,
        };
      });

      return json({ admins });
    }

    if (action === "add") {
      const email = (body?.email as string | undefined)?.trim().toLowerCase();
      const password = (body?.password as string | undefined) ?? "";
      const first_name = (body?.first_name as string | undefined)?.trim() || null;
      const last_name = (body?.last_name as string | undefined)?.trim() || null;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Gültige E-Mail erforderlich." }, 400);
      }
      if (!password || password.length < 8) {
        return json({ error: "Passwort muss mindestens 8 Zeichen haben." }, 400);
      }

      // Find existing user
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);

      let userId: string | null = existing?.id ?? null;
      let created = false;
      if (!userId) {
        const { data: cr, error: crErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { first_name: first_name ?? "", last_name: last_name ?? "" },
        });
        if (crErr) return json({ error: crErr.message }, 400);
        userId = cr.user?.id ?? null;
        created = true;
      } else {
        // Update password for existing user so admin login works immediately
        await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
      }
      if (!userId) return json({ error: "Konnte User nicht erstellen." }, 500);

      // Ensure profile name is set
      if (first_name || last_name) {
        await admin.from("profiles")
          .update({
            ...(first_name ? { first_name } : {}),
            ...(last_name ? { last_name } : {}),
          })
          .eq("user_id", userId);
      }

      // Already admin?
      const { data: existsRole } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (existsRole) return json({ ok: true, already: true, user_id: userId, created });

      const { error: insErr } = await admin
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (insErr) return json({ error: insErr.message }, 500);

      return json({ ok: true, created, user_id: userId });
    }


    if (action === "remove") {
      const targetId = body?.user_id as string | undefined;
      if (!targetId) return json({ error: "user_id erforderlich." }, 400);
      if (targetId === callerId) {
        return json({ error: "Du kannst dich nicht selbst entfernen." }, 400);
      }
      const { count } = await admin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        return json({ error: "Mindestens ein Admin muss bestehen bleiben." }, 400);
      }
      const { error: delErr } = await admin
        .from("user_roles")
        .delete()
        .eq("user_id", targetId)
        .eq("role", "admin");
      if (delErr) return json({ error: delErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
