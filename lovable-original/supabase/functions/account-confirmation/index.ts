// Konto-Bestätigung über die eigene SMTP-Infrastruktur (info@yoga-heide.de).
// Aktionen:
//  - signup        (öffentlich) Konto anlegen + Bestätigungs-Mail senden
//  - resend        (öffentlich) Bestätigungs-Mail erneut senden (neutrale Antwort)
//  - admin_list    (Admin) unbestätigte Konten auflisten
//  - admin_resend  (Admin) Bestätigungs-Mail für user_id erneut senden
//  - admin_confirm (Admin) Konto manuell bestätigen
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SITE = "https://yoga-heide.de";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// deno-lint-ignore no-explicit-any
async function sendConfirmation(admin: any, email: string, firstName = "") {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE}/dashboard` },
  });
  if (error || !data?.properties?.action_link) {
    return { ok: false, error: error?.message ?? "link failed" };
  }
  const { data: res, error: invErr } = await admin.functions.invoke("send-customer-email", {
    body: {
      trigger_key: "auth_signup",
      recipient_email: email,
      data: {
        email,
        customer_first_name: firstName,
        confirmation_url: data.properties.action_link,
        token: data.properties.email_otp ?? "",
        site_url: SITE,
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  const r = res as any;
  if (invErr || r?.error || r?.dispatch_error || r?.skipped || r?.dispatched !== true) {
    return { ok: false, error: invErr?.message ?? r?.dispatch_error ?? r?.reason ?? r?.error ?? "send failed" };
  }
  return { ok: true };
}

// deno-lint-ignore no-explicit-any
async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    // deno-lint-ignore no-explicit-any
    const u = users.find((x: any) => (x.email ?? "").toLowerCase() === email);
    if (u) return u;
    if (users.length < 1000) return null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const URL_ = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "signup") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const first_name = String(body.first_name ?? "").trim().slice(0, 100);
      const last_name = String(body.last_name ?? "").trim().slice(0, 100);
      const newsletter_opt_in = body.newsletter_opt_in === true;
      if (!EMAIL_RE.test(email) || email.length > 255) return json(400, { error: "invalid_email" });
      if (password.length < 6 || password.length > 200) return json(400, { error: "weak_password" });

      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: { first_name, last_name, newsletter_opt_in },
      });
      if (error) {
        const m = (error.message ?? "").toLowerCase();
        if (m.includes("already") || m.includes("exists")) {
          const existing = await findUserByEmail(admin, email);
          if (existing && !existing.email_confirmed_at) {
            const r = await sendConfirmation(admin, email, first_name);
            return json(r.ok ? 200 : 500, r.ok ? { ok: true, resent: true } : { error: "send_failed" });
          }
          return json(409, { error: "already_registered" });
        }
        if (m.includes("password")) return json(400, { error: "weak_password" });
        return json(400, { error: error.message });
      }
      if (created?.user) {
        await admin.from("profiles").update({ newsletter_opt_in }).eq("user_id", created.user.id);
      }
      const r = await sendConfirmation(admin, email, first_name);
      if (!r.ok) {
        console.error("signup confirmation failed", r.error);
        return json(500, { error: "send_failed" });
      }
      return json(200, { ok: true });
    }

    if (action === "resend") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return json(400, { error: "invalid_email" });
      const u = await findUserByEmail(admin, email);
      if (!u || u.email_confirmed_at) return json(200, { ok: true });
      const r = await sendConfirmation(admin, email, u.user_metadata?.first_name ?? "");
      if (!r.ok) return json(500, { error: "send_failed" });
      return json(200, { ok: true });
    }

    // ---- Admin-Aktionen ----
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const { data: ures, error: uerr } = await admin.auth.getUser(authHeader.slice(7));
    if (uerr || !ures?.user) return json(401, { error: "Unauthorized" });
    const { data: roleRow } = await admin.from("user_roles").select("role")
      .eq("user_id", ures.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    if (action === "admin_list") {
      // deno-lint-ignore no-explicit-any
      const out: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const users = data?.users ?? [];
        for (const u of users) {
          if (!u.email_confirmed_at && u.email) {
            out.push({
              user_id: u.id,
              email: u.email,
              first_name: u.user_metadata?.first_name ?? null,
              last_name: u.user_metadata?.last_name ?? null,
              created_at: u.created_at,
              confirmation_sent_at: u.confirmation_sent_at ?? null,
            });
          }
        }
        if (users.length < 1000) break;
      }
      out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return json(200, { users: out });
    }

    const userId = String(body.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json(400, { error: "invalid user_id" });
    const { data: target } = await admin.auth.admin.getUserById(userId);
    if (!target?.user?.email) return json(404, { error: "not_found" });

    if (action === "admin_resend") {
      if (target.user.email_confirmed_at) return json(400, { error: "already_confirmed" });
      const r = await sendConfirmation(admin, target.user.email, target.user.user_metadata?.first_name ?? "");
      return json(r.ok ? 200 : 500, r.ok ? { ok: true } : { error: r.error });
    }
    if (action === "admin_confirm") {
      const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }
    return json(400, { error: "unknown action" });
  } catch (e) {
    console.error("account-confirmation error", e);
    return json(500, { error: (e as Error).message });
  }
});
