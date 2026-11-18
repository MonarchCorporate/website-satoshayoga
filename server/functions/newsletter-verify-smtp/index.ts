// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import nodemailer from "nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = __env("SUPABASE_URL");
    const SUPABASE_ANON_KEY = __env("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = __env("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE) {
      return json(500, { error: "Server configuration error" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthorized" });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "Forbidden" });

    const body = await req.json().catch(() => ({}));
    const { data: stored } = await admin
      .from("newsletter_settings")
      .select("*")
      .maybeSingle();

    const cfg = {
      smtp_host: body.smtp_host ?? stored?.smtp_host,
      smtp_port: Number(body.smtp_port ?? stored?.smtp_port),
      smtp_user: body.smtp_user ?? stored?.smtp_user,
      smtp_pass: body.smtp_pass ?? stored?.smtp_pass,
      smtp_secure: body.smtp_secure ?? stored?.smtp_secure ?? "starttls",
    };

    const missing = [
      ["Host", cfg.smtp_host],
      ["Port", cfg.smtp_port],
      ["Benutzer", cfg.smtp_user],
      ["Passwort", cfg.smtp_pass],
    ]
      .filter(([, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      return json(400, {
        ok: false,
        step: "config",
        error: `Fehlende Pflichtfelder: ${missing.join(", ")}`,
      });
    }

    const secure = cfg.smtp_secure === "ssl";
    const port = cfg.smtp_port || (secure ? 465 : 587);
    const started = Date.now();
    let step: "connect" | "auth" = "connect";

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

      return json(200, {
        ok: true,
        host: cfg.smtp_host,
        port,
        secure: cfg.smtp_secure,
        latency_ms: Date.now() - started,
      });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("SMTP verify failed", { step, msg });
      return json(200, {
        ok: false,
        step,
        host: cfg.smtp_host,
        port,
        secure: cfg.smtp_secure,
        error: msg,
      });
    }
  } catch (e) {
    console.error("verify-smtp error", e);
    return json(500, { error: (e as Error).message });
  }
});
