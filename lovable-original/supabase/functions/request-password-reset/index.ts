// Passwort-Reset über die eigene SMTP-Infrastruktur.
// Erzeugt per Admin-API einen Recovery-Link und versendet ihn mit dem
// auth_recovery Template über send-customer-email / send-email-smtp.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirect_to } = await req.json().catch(() => ({}));
    if (!email || typeof email !== "string") {
      return json(400, { error: "email required" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const redirectTo = typeof redirect_to === "string" && redirect_to
      ? redirect_to
      : "https://yoga-heide.de/reset-password";

    const { data, error } = await (admin as any).auth.admin.generateLink({
      type: "recovery",
      email: email.trim().toLowerCase(),
      options: { redirectTo },
    });

    // Kein Account vorhanden o.ä. → aus Datenschutzgründen neutrale Antwort.
    if (error || !data?.properties?.action_link) {
      console.warn("generateLink failed", error?.message);
      return json(200, { ok: true });
    }

    const { data: sendRes, error: invokeErr } = await admin.functions.invoke(
      "send-customer-email",
      {
        body: {
          trigger_key: "auth_recovery",
          recipient_email: email,
          data: {
            email,
            confirmation_url: data.properties.action_link,
            token: data.properties.email_otp ?? "",
            site_url: "https://yoga-heide.de",
          },
        },
      },
    );

    const res = sendRes as any;
    // Nur wenn die Mail wirklich rausgegangen ist, gilt der Versand als erfolgreich.
    if (invokeErr || res?.error || res?.dispatch_error || res?.skipped || res?.dispatched !== true) {
      console.error(
        "recovery mail dispatch failed",
        invokeErr?.message ?? res?.dispatch_error ?? res?.reason ?? res?.error,
      );
      return json(500, {
        error:
          "E-Mail konnte nicht versendet werden. Bitte kontaktiere uns unter info@yoga-heide.de.",
      });
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("request-password-reset error", e);
    return json(500, { error: (e as Error).message });
  }
});
