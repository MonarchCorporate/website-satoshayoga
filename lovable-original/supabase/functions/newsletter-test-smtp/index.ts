import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { to } = await req.json();
    if (!to || typeof to !== "string") return new Response(JSON.stringify({ error: "Missing 'to'" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: settings } = await admin.from("newsletter_settings").select("*").maybeSingle();
    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_pass || !settings?.from_email) {
      return new Response(JSON.stringify({ error: "SMTP-Einstellungen unvollständig." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tls = settings.smtp_secure === "ssl";
    const client = new SMTPClient({
      connection: {
        hostname: settings.smtp_host,
        port: settings.smtp_port ?? (tls ? 465 : 587),
        tls,
        auth: { username: settings.smtp_user, password: settings.smtp_pass },
      },
    });

    await client.send({
      from: `${settings.from_name ?? "Newsletter"} <${settings.from_email}>`,
      to,
      replyTo: settings.reply_to ?? undefined,
      subject: "SMTP-Test – Santosha Yoga Newsletter",
      content: "auto",
      html: `<div style="font-family:Helvetica,Arial,sans-serif;padding:24px"><h2>SMTP-Test erfolgreich</h2><p>Wenn du diese Nachricht liest, ist deine SMTP-Konfiguration korrekt.</p></div>`,
    });
    await client.close();

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("SMTP test error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
