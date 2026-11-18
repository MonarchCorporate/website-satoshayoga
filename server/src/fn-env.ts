// Environment for the ported edge functions (replacement for Deno.env.get).
import { config } from "./config";

export const ANON_KEY = "public-anon-key";

export function __env(name: string): string | undefined {
  switch (name) {
    case "SUPABASE_URL":
      return config.siteUrl;
    case "SUPABASE_SERVICE_ROLE_KEY":
      return config.serviceKey;
    case "SUPABASE_ANON_KEY":
    case "SUPABASE_PUBLISHABLE_KEY":
      return ANON_KEY;
    case "PUBLIC_SITE_URL":
      return config.siteUrl;
    case "GUEST_BOOKING_SECRET":
      return config.guestBookingSecret;
    default:
      return process.env[name];
  }
}
