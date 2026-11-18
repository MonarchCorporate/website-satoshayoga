// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Verifiziert die eingegebenen SMTP-Daten (Handshake + optional Testmail).
import { createClient } from "../../src/supabase-server";
import nodemailer from "nodemailer";

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

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = __env("SUPABASE_URL")!;
    const ANON = __env("SUPABASE_ANON_KEY")!;
    const SERVICE = __env("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthorized" });

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    const body = await req.json().catch(() => ({}));
    const { data: stored } = await admin
      .from("email_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    const cfg = {
      smtp_host: body.smtp_host ?? stored?.smtp_host,
      smtp_port: Number(body.smtp_port ?? stored?.smtp_port ?? 587),
      smtp_user: body.smtp_user ?? stored?.smtp_user,
      smtp_pass: body.smtp_pass ?? stored?.smtp_pass,
      smtp_secure: body.smtp_secure ?? stored?.smtp_secure ?? "starttls",
      from_email: body.from_email ?? stored?.from_email,
      from_name: body.from_name ?? stored?.from_name,
    };

    const missing = [
      ["Host", cfg.smtp_host],
      ["Benutzer", cfg.smtp_user],
      ["Passwort", cfg.smtp_pass],
    ].filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) {
      return json(400, { ok: false, step: "config", error: `Fehlt: ${missing.join(", ")}` });
    }

    const secure = cfg.smtp_secure === "ssl";
    const port = cfg.smtp_port || (secure ? 465 : 587);
    const started = Date.now();
    let step: "connect" | "auth" | "send" = "connect";

    try {
      const transporter = nodemailer.createTransport({
        host: cfg.smtp_host,
        port,
        secure,
        auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
      });
      step = "auth";
      await transporter.verify();

      const testTo: string | undefined = body.test_to;
      if (testTo) {
        step = "send";
        const fromEmail = cfg.from_email || cfg.smtp_user;
        const fromField = cfg.from_name ? `${cfg.from_name} <${fromEmail}>` : fromEmail;
        await transporter.sendMail({
          from: fromField,
          to: testTo,
          subject: "Santosha Yoga – SMTP-Testmail",
          html: `<p>Diese Testmail bestätigt: dein SMTP-Zugang funktioniert.</p>
                 <p>Gesendet am ${new Date().toLocaleString("de-DE")}.</p>`,
        });
      }

      return json(200, {
        ok: true,
        host: cfg.smtp_host,
        port,
        secure: cfg.smtp_secure,
        latency_ms: Date.now() - started,
        test_sent: !!body.test_to,
      });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("email-settings-verify failed", { step, msg });
      return json(200, { ok: false, step, error: msg });
    }
  } catch (e) {
    console.error("email-settings-verify error", e);
    return json(500, { error: (e as Error).message });
  }
});
