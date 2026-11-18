// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Edge function: invite-trainer
// Creates an auth user (or links existing), assigns the 'trainer' role,
// and links the trainer record. Sends the password-setup email over the
// project's own SMTP infrastructure (send-customer-email), because the
// built-in auth mailer is unreliable for this project.

import { createClient } from "../../src/supabase-server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InviteBody {
  trainer_id: string;
  email: string;
  redirect_to?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = __env("SUPABASE_URL")!;
    const SERVICE_ROLE = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = __env("SUPABASE_PUBLISHABLE_KEY") ??
      __env("SUPABASE_ANON_KEY")!;

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleRow } = await admin.from("user_roles")
      .select("role").eq("user_id", userResp.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return json({ error: "Forbidden" }, 403);
    }

    const body: InviteBody = await req.json();
    if (!body?.trainer_id || !body?.email) {
      return json({ error: "trainer_id and email required" }, 400);
    }

    const email = body.email.trim().toLowerCase();
    const redirectTo = body.redirect_to ?? "https://yoga-heide.de/reset-password?invite=1";

    // Load trainer for the greeting name
    const { data: trainer } = await admin
      .from("trainers")
      .select("id, first_name, last_name")
      .eq("id", body.trainer_id)
      .maybeSingle();
    if (!trainer) {
      return json({ error: "Trainer nicht gefunden." }, 404);
    }

    // 1) Find or create the auth user (without sending any auth email)
    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const randomPassword = crypto.randomUUID() + "Aa1!";
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          first_name: trainer.first_name ?? "",
          last_name: trainer.last_name ?? "",
        },
      });
      if (createErr) {
        return json({ error: createErr.message }, 400);
      }
      userId = created.user?.id ?? null;
    }

    if (!userId) {
      return json({ error: "Could not create or find user" }, 500);
    }

    // 2) Link trainer record
    await admin.from("trainers").update({ user_id: userId, email })
      .eq("id", body.trainer_id);

    // 3) Assign trainer role (idempotent)
    await admin.from("user_roles").upsert(
      { user_id: userId, role: "trainer" },
      { onConflict: "user_id,role" },
    );

    // 4) Generate a password-setup (recovery) link
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink failed", linkErr?.message);
      return json({ error: "Zugang wurde erstellt, aber der Login-Link konnte nicht erzeugt werden." }, 500);
    }

    // 5) Send the invite email via the project's own SMTP pipeline
    const { data: sendRes, error: invokeErr } = await admin.functions.invoke(
      "send-customer-email",
      {
        body: {
          trigger_key: "trainer_invite",
          recipient_email: email,
          data: {
            email,
            first_name: trainer.first_name ?? "",
            last_name: trainer.last_name ?? "",
            confirmation_url: linkData.properties.action_link,
            site_url: "https://yoga-heide.de",
          },
        },
      },
    );

    const res = sendRes as any;
    if (invokeErr || res?.error || res?.dispatch_error || res?.skipped || res?.dispatched !== true) {
      console.error(
        "trainer invite mail dispatch failed",
        invokeErr?.message ?? res?.dispatch_error ?? res?.reason ?? res?.error,
      );
      return json({
        error: "Zugang wurde erstellt, aber die E-Mail konnte nicht versendet werden. Bitte prüfe die E-Mail-Einstellungen.",
      }, 500);
    }

    await admin.from("trainers").update({ invited_at: new Date().toISOString() }).eq("id", body.trainer_id);

    return json({ ok: true, user_id: userId });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
