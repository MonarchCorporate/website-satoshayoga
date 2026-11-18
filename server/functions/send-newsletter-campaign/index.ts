// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { SMTPClient } from "../../src/denomailer-compat";
import { renderCampaign, extractLinks, type Block } from "../_shared/newsletter-render.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const randomToken = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: either admin user OR cron with service role
    const authHeader = req.headers.get("Authorization") ?? "";
    const admin = createClient(__env("SUPABASE_URL")!, __env("SUPABASE_SERVICE_ROLE_KEY")!);
    const isCron = authHeader.includes(__env("SUPABASE_SERVICE_ROLE_KEY") ?? "___");

    if (!isCron) {
      const supa = createClient(__env("SUPABASE_URL")!, __env("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: userData } = await supa.auth.getUser();
      if (!userData?.user) return json({ error: "Unauthorized" }, 401);
      const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ error: "Forbidden" }, 403);
    }

    const { campaign_id, test_email } = await req.json();
    if (!campaign_id) return json({ error: "Missing campaign_id" }, 400);

    const { data: campaign } = await admin.from("newsletter_campaigns").select("*").eq("id", campaign_id).maybeSingle();
    if (!campaign) return json({ error: "Campaign not found" }, 404);

    const { data: settings } = await admin.from("newsletter_settings").select("*").maybeSingle();
    if (!settings?.smtp_host || !settings?.smtp_user || !settings?.smtp_pass || !settings?.from_email) {
      return json({ error: "SMTP-Einstellungen unvollständig." }, 400);
    }

    const projectUrl = __env("SUPABASE_URL")!;
    const trackingBaseUrl = `${projectUrl}/functions/v1`;
    const blocks: Block[] = Array.isArray(campaign.content_json) ? campaign.content_json : [];

    // ====== TEST MODE ======
    if (test_email) {
      const html = renderCampaign(blocks, {
        trackingBaseUrl,
        campaignId: campaign_id,
        footerText: settings.footer_text ?? undefined,
        footerAddress: settings.footer_address ?? undefined,
        unsubscribeUrl: undefined,
      });
      const tls = settings.smtp_secure === "ssl";
      const client = new SMTPClient({
        connection: { hostname: settings.smtp_host, port: settings.smtp_port ?? (tls ? 465 : 587), tls, auth: { username: settings.smtp_user, password: settings.smtp_pass } },
      });
      await client.send({
        from: `${settings.from_name ?? "Newsletter"} <${settings.from_email}>`,
        to: test_email,
        replyTo: settings.reply_to ?? undefined,
        subject: `[TEST] ${campaign.subject}`,
        content: "auto",
        html,
      });
      await client.close();
      return json({ ok: true, mode: "test" });
    }

    // ====== REAL SEND ======
    if (campaign.status === "sent") return json({ error: "Campaign already sent" }, 400);

    await admin.from("newsletter_campaigns").update({ status: "sending" }).eq("id", campaign.id);

    // Build / refresh link map for campaign
    await admin.from("newsletter_links").delete().eq("campaign_id", campaign.id);
    const links = extractLinks(blocks);
    const linkMap: Record<string, string> = {};
    if (links.length) {
      const inserted = await admin.from("newsletter_links").insert(links.map((l) => ({ campaign_id: campaign.id, url: l.url, label: l.label }))).select("id, url");
      (inserted.data ?? []).forEach((row: any) => { linkMap[row.url] = row.id; });
    }

    // Resolve audience
    const filter = (campaign.audience_filter as any) ?? { type: "opt_in" };
    let audienceQuery = admin.from("profiles").select("user_id, email, first_name, last_name, newsletter_opt_in");
    audienceQuery = audienceQuery.eq("newsletter_opt_in", true);
    const { data: profiles } = await audienceQuery;

    const { data: suppressed } = await admin.from("newsletter_suppressions").select("email");
    const blocked = new Set((suppressed ?? []).map((s: any) => s.email.toLowerCase()));

    const audience = (profiles ?? []).filter((p: any) => p.email && !blocked.has(p.email.toLowerCase()));

    // Pre-create recipient rows (idempotent)
    if (audience.length) {
      const rows = audience.map((p: any) => ({ campaign_id: campaign.id, user_id: p.user_id, email: p.email, status: "pending" }));
      await admin.from("newsletter_recipients").upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
    }

    const { data: recipients } = await admin
      .from("newsletter_recipients")
      .select("id, email, status")
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");

    const tls = settings.smtp_secure === "ssl";
    const client = new SMTPClient({
      connection: { hostname: settings.smtp_host, port: settings.smtp_port ?? (tls ? 465 : 587), tls, auth: { username: settings.smtp_user, password: settings.smtp_pass } },
    });

    const ratePerMinute = settings.rate_per_minute ?? 60;
    const delayMs = Math.max(50, Math.floor(60000 / ratePerMinute));

    let sent = 0, failed = 0;
    for (const r of recipients ?? []) {
      try {
        // Ensure unsubscribe token
        const { data: existingTok } = await admin.from("newsletter_unsubscribe_tokens").select("token").eq("email", r.email).maybeSingle();
        let token = existingTok?.token;
        if (!token) {
          token = randomToken();
          await admin.from("newsletter_unsubscribe_tokens").insert({ email: r.email, token });
        }
        const unsubscribeUrl = `${(__env("PUBLIC_SITE_URL") ?? "https://santosha-yoga.de")}/newsletter/unsubscribe?token=${token}`;

        const html = renderCampaign(blocks, {
          trackingBaseUrl,
          campaignId: campaign.id,
          recipientId: r.id,
          unsubscribeUrl,
          footerText: settings.footer_text ?? undefined,
          footerAddress: settings.footer_address ?? undefined,
          linkMap,
        });

        const { data: logRow } = await admin.from("email_send_log").insert({
          trigger_key: "newsletter",
          recipient_email: r.email,
          subject: campaign.subject,
          body_html: html,
          status: "pending",
          source: "newsletter",
          metadata: { campaign_id: campaign.id, recipient_id: r.id },
        }).select("id").maybeSingle();

        try {
          await client.send({
            from: `${settings.from_name ?? "Newsletter"} <${settings.from_email}>`,
            to: r.email,
            replyTo: settings.reply_to ?? undefined,
            subject: campaign.subject,
            content: "auto",
            html,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${settings.reply_to ?? settings.from_email}?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });

          await admin.from("newsletter_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
          if (logRow?.id) {
            await admin.from("email_send_log").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", logRow.id);
          }
          sent++;
        } catch (err) {
          const msg = (err as Error).message ?? String(err);
          const isHardBounce = /5\d\d/.test(msg);
          await admin.from("newsletter_recipients").update({ status: isHardBounce ? "bounced" : "failed", error: msg }).eq("id", r.id);
          if (isHardBounce) {
            await admin.from("newsletter_bounces").insert({ email: r.email, bounce_type: "hard", reason: msg, campaign_id: campaign.id });
            await admin.from("newsletter_suppressions").upsert({ email: r.email, reason: "bounce" });
          }
          if (logRow?.id) {
            await admin.from("email_send_log").update({ status: isHardBounce ? "bounced" : "failed", error_message: msg }).eq("id", logRow.id);
          }
          failed++;
        }
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        await admin.from("newsletter_recipients").update({ status: "failed", error: msg }).eq("id", r.id);
        failed++;
      }
      await new Promise((res) => setTimeout(res, delayMs));
    }

    await client.close();

    await admin.from("newsletter_campaigns").update({
      status: "sent",
      sent_at: new Date().toISOString(),
    }).eq("id", campaign.id);

    return json({ ok: true, sent, failed, total: recipients?.length ?? 0 });
  } catch (e) {
    console.error("send-newsletter-campaign error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
