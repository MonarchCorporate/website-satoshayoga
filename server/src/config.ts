import path from "node:path";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return v;
}

const siteUrl = env("PUBLIC_SITE_URL", "https://yoga-heide.de").replace(/\/$/, "");

export const config = {
  port: parseInt(env("PORT", "3000"), 10),
  siteUrl,
  db: {
    host: env("DB_HOST", "127.0.0.1"),
    port: parseInt(env("DB_PORT", "3306"), 10),
    user: env("DB_USER", "santosha"),
    password: env("DB_PASSWORD", ""),
    name: env("DB_NAME", "santosha"),
  },
  // Secret for signing session tokens (JWT). Must be set in production.
  jwtSecret: env("JWT_SECRET", ""),
  // Internal key standing in for the Supabase service role inside server functions.
  serviceKey: env("SERVICE_ROLE_KEY", ""),
  storageDir: env("STORAGE_DIR", path.resolve(process.cwd(), "..", "santosha-storage")),
  guestBookingSecret: env("GUEST_BOOKING_SECRET", ""),
  cronSecret: env("CRON_SECRET", ""),
  migrationKey: env("MIGRATION_KEY", ""),
  accessTokenTtl: 3600,
  refreshTokenTtlDays: 60,
};

export function assertProductionConfig() {
  const missing = ["JWT_SECRET", "SERVICE_ROLE_KEY", "DB_PASSWORD"].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[config] missing required environment variables: ${missing.join(", ")}`);
  }
  if (!config.jwtSecret) throw new Error("JWT_SECRET is required");
  if (!config.serviceKey) throw new Error("SERVICE_ROLE_KEY is required");
}
