// Ported from supabase/functions (Deno) by scripts/port_functions.py
// Shared PayPal helpers (imported via relative path by edge functions)

export interface PaypalConfig {
  mode: "sandbox" | "live";
  client_id: string;
  client_secret: string;
  is_active: boolean;
}

export function paypalBaseUrl(mode: string): string {
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export async function getPaypalAccessToken(cfg: PaypalConfig): Promise<string> {
  const auth = btoa(`${cfg.client_id}:${cfg.client_secret}`);
  const res = await fetch(`${paypalBaseUrl(cfg.mode)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PayPal OAuth failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

export async function loadPaypalConfig(admin: any): Promise<PaypalConfig> {
  const { data, error } = await admin
    .from("payment_settings")
    .select("mode, client_id, client_secret, is_active")
    .eq("provider", "paypal")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.client_id || !data.client_secret) {
    throw new Error(
      "PayPal ist nicht konfiguriert. Bitte Admin → Einstellungen.",
    );
  }
  if (!data.is_active) {
    throw new Error("PayPal-Integration ist deaktiviert.");
  }
  return data as PaypalConfig;
}
