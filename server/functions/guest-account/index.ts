// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { signGuestToken } from "../_shared/guest-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normEmail(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const v = s.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  if (v.length > 255) return null;
  return v;
}

function nonEmpty(v: unknown, max = 120): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = normEmail(body.email);
    const first_name = nonEmpty(body.first_name, 80);
    const last_name = nonEmpty(body.last_name, 80);
    const phone = nonEmpty(body.phone, 40);
    const street = nonEmpty(body.street, 160);
    const postal_code = nonEmpty(body.postal_code, 20);
    const city = nonEmpty(body.city, 120);
    const country = nonEmpty(body.country, 80) ?? "Deutschland";
    const birthday = typeof body.birthday === "string" && body.birthday ? body.birthday : null;

    if (!email) return json({ error: "Bitte gib eine gültige E-Mail-Adresse ein." }, 400);
    if (!first_name || !last_name) return json({ error: "Bitte gib Vor- und Nachnamen ein." }, 400);
    if (!phone) return json({ error: "Bitte gib eine Telefonnummer ein." }, 400);
    if (!street || !postal_code || !city) {
      return json({ error: "Bitte gib deine vollständige Anschrift an." }, 400);
    }

    const supabaseUrl = __env("SUPABASE_URL")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Enumeration check — same generic message whether user was created or not,
    // but we DO need to block re-use of an existing account to avoid takeover.
    const { data: existing } = await admin
      .from("profiles")
      .select("user_id, is_guest")
      .eq("email", email)
      .maybeSingle();

    if (existing?.user_id && !existing.is_guest) {
      return json(
        { error: "Für diese E-Mail existiert bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück." },
        409,
      );
    }

    let userId: string | null = existing?.user_id ?? null;

    if (!userId) {
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name, last_name, is_guest: true },
      });
      if (cErr || !created.user) {
        // If already exists in auth but not in profiles for some reason, treat generically
        return json(
          { error: "Für diese E-Mail existiert bereits ein Konto. Bitte melde dich an oder setze dein Passwort zurück." },
          409,
        );
      }
      userId = created.user.id;
      // wait briefly for handle_new_user trigger
      await new Promise((r) => setTimeout(r, 400));
    }

    // Upsert / update profile with full address + guest flag
    await admin.from("profiles").update({
      first_name,
      last_name,
      email,
      phone,
      birthday,
      street,
      postal_code,
      city,
      country,
      is_guest: true,
    }).eq("user_id", userId);

    const token = await signGuestToken(userId, 60 * 60); // 1 hour
    return json({ ok: true, user_id: userId, guest_token: token });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
