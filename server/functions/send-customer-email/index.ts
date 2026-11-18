// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Sendet Kunden-E-Mails basierend auf den HTML-Templates aus der DB.
// Lädt Template per trigger_key, ersetzt {{platzhalter}}, übergibt an
// die generische send-transactional-email Function (Lovable Queue).
import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const escapeHtml = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderTemplate = (
  tpl: string,
  data: Record<string, unknown>,
): string => {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = data?.[key];
    if (v === undefined || v === null) return "";
    return escapeHtml(String(v));
  });
};

// Subject darf NICHT HTML-escaped werden (sonst wird "&" zu "&amp;" im
// Betreff des E-Mail-Clients). Nur Platzhalter roh einsetzen.
const renderSubject = (
  tpl: string,
  data: Record<string, unknown>,
): string => {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const v = data?.[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
};

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      trigger_key,
      recipient_email,
      data = {},
      idempotency_key,
    }: {
      trigger_key: string;
      recipient_email: string;
      data?: Record<string, unknown>;
      idempotency_key?: string;
    } = body;

    if (!trigger_key || !recipient_email) {
      return new Response(
        JSON.stringify({ error: "trigger_key and recipient_email required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = __env("SUPABASE_URL")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Template laden
    const { data: tpl, error: tplErr } = await admin
      .from("email_templates")
      .select("subject, body_html, is_active, trigger_key")
      .eq("trigger_key", trigger_key)
      .maybeSingle();

    if (tplErr) throw tplErr;
    if (!tpl) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: `no template for trigger ${trigger_key}`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!tpl.is_active) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "template disabled" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const mergedData = {
      site_name: "Santosha Yoga",
      ...data,
    };

    const subject = renderSubject(tpl.subject, mergedData);
    const html = renderTemplate(tpl.body_html, mergedData);

    // Versand über zentrale SMTP-Konfiguration (Admin → Einstellungen → E-Mail).
    let dispatched = false;
    let dispatchError: string | null = null;
    try {
      const { data: sendRes, error: invokeErr } = await admin.functions.invoke(
        "send-email-smtp",
        {
          body: {
            to: recipient_email,
            subject,
            html,
            trigger_key,
            source: "transactional",
            metadata: { ...(idempotency_key ? { idempotency_key } : {}) },
          },
        },
      );
      if (invokeErr) {
        dispatchError = invokeErr.message;
      } else if (sendRes?.error) {
        dispatchError = sendRes.error;
      } else {
        dispatched = true;
      }
    } catch (e) {
      dispatchError = (e as Error).message;
    }

    return new Response(
      JSON.stringify({
        success: true,
        dispatched,
        dispatch_error: dispatchError,
        subject,
        recipient: recipient_email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("send-customer-email error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
