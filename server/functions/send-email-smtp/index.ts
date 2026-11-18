// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Zentrale SMTP-Send-Primitive: liest email_settings, sendet Mail via nodemailer.
// Wird von send-customer-email, auth-email-hook und optional vom Newsletter aufgerufen.
// Loggt jeden Sendevorgang in public.email_send_log.
import { createClient } from "../../src/supabase-server";
import nodemailer from "nodemailer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Einfache HTML->Text Konvertierung für den text/plain-Part.
const htmlToText = (html: string): string =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    __env("SUPABASE_URL")!,
    __env("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let logId: string | null = null;
  let recipient = "";
  let subj = "";
  let bodyHtmlStored = "";
  let triggerKey: string | null = null;
  let source = "transactional";
  let metadata: Record<string, unknown> = {};

  try {
    const {
      to,
      subject,
      html,
      text,
      reply_to,
      from_email: fromOverride,
      from_name: fromNameOverride,
      trigger_key,
      source: srcIn,
      metadata: metaIn,
      attachments: attachmentsIn,
    } = await req.json();

    if (!to || !subject || !html) {
      return json(400, { error: "to, subject, html required" });
    }

    recipient = to;
    subj = subject;
    bodyHtmlStored = html;
    triggerKey = trigger_key ?? null;
    source = srcIn ?? "transactional";
    metadata = metaIn ?? {};

    // Log-Eintrag anlegen (pending)
    const { data: logRow } = await admin
      .from("email_send_log")
      .insert({
        trigger_key: triggerKey,
        recipient_email: recipient,
        subject: subj,
        body_html: bodyHtmlStored,
        status: "pending",
        source,
        metadata,
      })
      .select("id")
      .maybeSingle();
    logId = logRow?.id ?? null;

    const { data: cfg, error: cfgErr } = await admin
      .from("email_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (cfgErr) throw cfgErr;
    if (!cfg) throw new Error("email_settings nicht konfiguriert");
    if (!cfg.is_active) throw new Error("E-Mail-Versand ist deaktiviert");

    const missing: string[] = [];
    if (!cfg.smtp_host) missing.push("SMTP-Host");
    if (!cfg.smtp_user) missing.push("SMTP-Benutzer");
    if (!cfg.smtp_pass) missing.push("SMTP-Passwort");
    const fromEmail = fromOverride || cfg.from_email;
    if (!fromEmail) missing.push("Absender-Adresse");
    if (missing.length) {
      throw new Error(`E-Mail-Einstellungen unvollständig: ${missing.join(", ")}`);
    }

    const secureMode = cfg.smtp_secure === "ssl";
    const port = cfg.smtp_port || (secureMode ? 465 : 587);

    const transporter = nodemailer.createTransport({
      host: cfg.smtp_host,
      port,
      secure: secureMode,
      auth: { user: cfg.smtp_user, pass: cfg.smtp_pass },
      requireTLS: cfg.smtp_secure === "starttls",
    });

    const fromName = fromNameOverride || cfg.from_name || "";
    const fromField = fromName
      ? { name: fromName, address: fromEmail }
      : fromEmail;
    const replyTo = reply_to || cfg.reply_to || undefined;

    const plainText = text && String(text).trim().length > 0
      ? String(text)
      : htmlToText(html);

    const attList = Array.isArray(attachmentsIn) ? attachmentsIn : [];
    const mailAttachments = attList
      .filter((a: any) => a && a.filename && a.content_base64)
      .map((a: any) => ({
        filename: String(a.filename),
        content: a.content_base64,
        encoding: "base64",
        contentType: a.content_type ?? "application/octet-stream",
      }));

    await transporter.sendMail({
      from: fromField as any,
      to,
      replyTo,
      subject,
      text: plainText,
      html,
      ...(mailAttachments.length > 0 ? { attachments: mailAttachments } : {}),
    });

    if (logId) {
      await admin
        .from("email_send_log")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", logId);
    }

    return json(200, { ok: true, log_id: logId });
  } catch (e) {
    const errMsg = (e as Error).message ?? String(e);
    console.error("send-email-smtp error", e);
    if (logId) {
      await admin
        .from("email_send_log")
        .update({ status: "failed", error_message: errMsg })
        .eq("id", logId);
    } else if (recipient) {
      await admin.from("email_send_log").insert({
        trigger_key: triggerKey,
        recipient_email: recipient,
        subject: subj,
        body_html: bodyHtmlStored,
        status: "failed",
        error_message: errMsg,
        source,
        metadata,
      });
    }
    return json(500, { error: errMsg });
  }
});
