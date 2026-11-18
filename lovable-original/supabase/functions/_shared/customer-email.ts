// Shared helper für Edge Functions, der eine Kunden-E-Mail auslöst.
// Lädt Empfänger-Profil, formatiert Werte und ruft send-customer-email auf.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Admin = ReturnType<typeof createClient>;

export async function triggerCustomerEmail(
  admin: Admin,
  args: {
    user_id: string;
    trigger_key: string;
    data?: Record<string, unknown>;
    idempotency_key?: string;
  },
) {
  try {
    // Empfänger ermitteln
    const { data: profile } = await admin
      .from("profiles")
      .select("email, first_name, last_name")
      .eq("user_id", args.user_id)
      .maybeSingle();

    let email = (profile as any)?.email as string | undefined;
    if (!email) {
      // Auth-User Fallback
      const { data: u } = await (admin as any).auth.admin.getUserById(
        args.user_id,
      );
      email = u?.user?.email;
    }
    if (!email) {
      console.warn("[email] no recipient for user", args.user_id);
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Öffentliche Website-URL ermitteln (für Links in Emails)
    let siteUrl = "https://yoga-heide.de";
    try {
      const { data: cs } = await admin
        .from("company_settings")
        .select("website")
        .eq("singleton", true)
        .maybeSingle();
      const w = (cs as any)?.website as string | undefined;
      if (w && /^https?:\/\//i.test(w)) {
        siteUrl = w.replace(/\/+$/, "");
      }
    } catch (_) { /* ignore */ }

    const data = {
      customer_first_name: (profile as any)?.first_name ?? "",
      customer_last_name: (profile as any)?.last_name ?? "",
      dashboard_url: `${siteUrl}/dashboard`,
      site_url: siteUrl,
      ...args.data,
    };

    await fetch(`${supabaseUrl}/functions/v1/send-customer-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        trigger_key: args.trigger_key,
        recipient_email: email,
        data,
        idempotency_key: args.idempotency_key,
      }),
    });
  } catch (e) {
    console.warn("[email] trigger failed", args.trigger_key, e);
  }
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

export function formatTime(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
}

export function formatMoney(n?: number | null): string {
  if (n === null || n === undefined) return "";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}
