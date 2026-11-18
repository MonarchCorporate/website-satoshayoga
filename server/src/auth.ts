// Self-hosted replacement for Supabase Auth (GoTrue) – password logins with the
// existing bcrypt hashes, JWT access tokens, rotating refresh tokens, one-time
// links (recovery / magic link / signup / invite) and the admin API used by the
// server functions.
import { createHash, randomBytes, randomUUID, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { pool, q, tx } from "./db";
import { decodeValue, toMysqlDatetime, fromMysqlDatetime, nowMysql } from "./codec";
import { execute, serviceCtx } from "./engine";

export class AuthError extends Error {
  constructor(message: string, public status = 400, public code = "unexpected_failure") {
    super(message);
  }
  toJSON() {
    return { message: this.message, status: this.status, code: this.code, name: "AuthApiError" };
  }
}

type UserRow = {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  raw_user_meta_data: any;
  raw_app_meta_data: any;
  phone: string | null;
  banned_until: string | null;
  deleted_at: string | null;
  is_anonymous: number;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseJson(v: any) {
  return (decodeValue("json", v) as any) ?? {};
}

export function userJson(u: UserRow) {
  const ts = (v: string | null) => fromMysqlDatetime(v);
  const app = parseJson(u.raw_app_meta_data);
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email ?? "",
    email_confirmed_at: ts(u.email_confirmed_at),
    confirmed_at: ts(u.email_confirmed_at),
    phone: u.phone ?? "",
    last_sign_in_at: ts(u.last_sign_in_at),
    app_metadata: { provider: "email", providers: ["email"], ...app },
    user_metadata: parseJson(u.raw_user_meta_data),
    identities: [],
    created_at: ts(u.created_at),
    updated_at: ts(u.updated_at),
    banned_until: ts(u.banned_until),
    is_anonymous: !!u.is_anonymous,
  };
}

export async function getUserRow(id: string): Promise<UserRow | null> {
  const r = await q<UserRow>(pool, "SELECT * FROM auth_users WHERE id = ? AND deleted_at IS NULL", [id]);
  return r[0] ?? null;
}

export async function getUserRowByEmail(email: string): Promise<UserRow | null> {
  const r = await q<UserRow>(pool, "SELECT * FROM auth_users WHERE email = ? AND deleted_at IS NULL", [email.trim().toLowerCase()]);
  return r[0] ?? null;
}

// --------------------------------------------------------------------------
// Tokens
// --------------------------------------------------------------------------
export function signAccessToken(u: UserRow) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: u.id,
      email: u.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + config.accessTokenTtl,
      session_id: randomUUID(),
    },
    config.jwtSecret,
    { algorithm: "HS256" },
  );
}

export type TokenClaims = { sub: string; email?: string; role?: string; exp: number };

export function verifyAccessToken(token: string | null | undefined): TokenClaims | null {
  if (!token) return null;
  try {
    const c = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as TokenClaims;
    if (c.role === "service_role") return null;
    return c;
  } catch {
    return null;
  }
}

export async function createSession(u: UserRow) {
  const refresh = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + config.refreshTokenTtlDays * 86400000).toISOString();
  await q(pool, "INSERT INTO auth_refresh_tokens (token_hash, user_id, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, 0)", [
    sha256(refresh),
    u.id,
    nowMysql(),
    toMysqlDatetime(expires),
  ]);
  const access = signAccessToken(u);
  const expiresAt = Math.floor(Date.now() / 1000) + config.accessTokenTtl;
  return {
    access_token: access,
    token_type: "bearer",
    expires_in: config.accessTokenTtl,
    expires_at: expiresAt,
    refresh_token: refresh,
    user: userJson(u),
  };
}

function assertNotBanned(u: UserRow) {
  if (u.banned_until && new Date(fromMysqlDatetime(u.banned_until)!).getTime() > Date.now()) {
    throw new AuthError("User is banned", 400, "user_banned");
  }
}

// --------------------------------------------------------------------------
// Public endpoints
// --------------------------------------------------------------------------
export async function passwordGrant(email: string, password: string) {
  const u = email ? await getUserRowByEmail(email) : null;
  if (!u || !u.encrypted_password || !(await bcrypt.compare(password ?? "", u.encrypted_password))) {
    throw new AuthError("Invalid login credentials", 400, "invalid_credentials");
  }
  if (!u.email_confirmed_at) throw new AuthError("Email not confirmed", 400, "email_not_confirmed");
  assertNotBanned(u);
  await q(pool, "UPDATE auth_users SET last_sign_in_at = ? WHERE id = ?", [nowMysql(), u.id]);
  u.last_sign_in_at = nowMysql();
  return createSession(u);
}

export async function refreshGrant(refreshToken: string) {
  const h = sha256(refreshToken ?? "");
  return tx(async (c) => {
    const r = await q<any>(c, "SELECT * FROM auth_refresh_tokens WHERE token_hash = ? FOR UPDATE", [h]);
    const row = r[0];
    if (!row || row.revoked || new Date(fromMysqlDatetime(row.expires_at)!).getTime() < Date.now()) {
      throw new AuthError("Invalid Refresh Token: Refresh Token Not Found", 400, "refresh_token_not_found");
    }
    await q(c, "UPDATE auth_refresh_tokens SET revoked = 1 WHERE token_hash = ?", [h]);
    const u = await getUserRow(row.user_id);
    if (!u) throw new AuthError("User not found", 404, "user_not_found");
    assertNotBanned(u);
    return createSession(u);
  });
}

export async function logout(userId: string) {
  await q(pool, "UPDATE auth_refresh_tokens SET revoked = 1 WHERE user_id = ?", [userId]);
}

export async function updateUser(userId: string, attrs: { password?: string; email?: string; data?: Record<string, unknown> }) {
  const u = await getUserRow(userId);
  if (!u) throw new AuthError("User not found", 404, "user_not_found");
  if (attrs.password !== undefined) {
    if (String(attrs.password).length < 6) throw new AuthError("Password should be at least 6 characters.", 422, "weak_password");
    if (u.encrypted_password && (await bcrypt.compare(attrs.password, u.encrypted_password))) {
      throw new AuthError("New password should be different from the old password.", 422, "same_password");
    }
  }
  await adminUpdateUser(userId, { password: attrs.password, email: attrs.email, user_metadata: attrs.data });
  return userJson((await getUserRow(userId))!);
}

// --------------------------------------------------------------------------
// Admin API (used by server functions through the service client)
// --------------------------------------------------------------------------
export async function adminCreateUser(opts: {
  email: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}) {
  const email = String(opts.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new AuthError("Unable to validate email address: invalid format", 400, "email_address_invalid");
  if (await getUserRowByEmail(email)) {
    throw new AuthError("A user with this email address has already been registered", 422, "email_exists");
  }
  if (opts.password !== undefined && String(opts.password).length < 6) {
    throw new AuthError("Password should be at least 6 characters.", 422, "weak_password");
  }
  const id = randomUUID();
  const now = nowMysql();
  const hash = opts.password ? await bcrypt.hash(String(opts.password), 10) : null;
  const meta = opts.user_metadata ?? {};
  await q(
    pool,
    `INSERT INTO auth_users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data, is_anonymous)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [id, email, hash, opts.email_confirm ? now : null, now, now, JSON.stringify(meta), JSON.stringify({ provider: "email", providers: ["email"], ...(opts.app_metadata ?? {}) })],
  );
  // Ports of the auth.users triggers handle_new_user() and handle_new_user_role()
  const ctx = serviceCtx();
  const p = await execute(ctx, {
    table: "profiles",
    op: "insert",
    values: { user_id: id, first_name: String(meta.first_name ?? ""), last_name: String(meta.last_name ?? "") },
  });
  if (p.error) console.error("[auth] profile trigger failed", p.error);
  const r = await execute(ctx, { table: "user_roles", op: "insert", values: { user_id: id, role: "customer" } });
  if (r.error) console.error("[auth] role trigger failed", r.error);
  return userJson((await getUserRow(id))!);
}

export async function adminUpdateUser(
  id: string,
  attrs: {
    password?: string;
    email?: string;
    email_confirm?: boolean;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
    ban_duration?: string;
  },
) {
  const u = await getUserRow(id);
  if (!u) throw new AuthError("User not found", 404, "user_not_found");
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (attrs.password !== undefined && attrs.password !== null) {
    if (String(attrs.password).length < 6) throw new AuthError("Password should be at least 6 characters.", 422, "weak_password");
    sets.push("encrypted_password = ?");
    vals.push(await bcrypt.hash(String(attrs.password), 10));
  }
  if (attrs.email) {
    const email = attrs.email.trim().toLowerCase();
    const other = await getUserRowByEmail(email);
    if (other && other.id !== id) throw new AuthError("A user with this email address has already been registered", 422, "email_exists");
    sets.push("email = ?");
    vals.push(email);
  }
  if (attrs.email_confirm === true) {
    sets.push("email_confirmed_at = COALESCE(email_confirmed_at, ?)");
    vals.push(nowMysql());
  }
  if (attrs.user_metadata) {
    sets.push("raw_user_meta_data = ?");
    vals.push(JSON.stringify({ ...parseJson(u.raw_user_meta_data), ...attrs.user_metadata }));
  }
  if (attrs.app_metadata) {
    sets.push("raw_app_meta_data = ?");
    vals.push(JSON.stringify({ ...parseJson(u.raw_app_meta_data), ...attrs.app_metadata }));
  }
  if (attrs.ban_duration !== undefined) {
    if (attrs.ban_duration === "none") {
      sets.push("banned_until = NULL");
    } else {
      const m = /^(\d+)h$/.exec(attrs.ban_duration);
      const hours = m ? parseInt(m[1], 10) : 876000;
      sets.push("banned_until = ?");
      vals.push(toMysqlDatetime(new Date(Date.now() + hours * 3600000).toISOString()));
    }
  }
  sets.push("updated_at = ?");
  vals.push(nowMysql());
  await q(pool, `UPDATE auth_users SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
  return userJson((await getUserRow(id))!);
}

export async function adminListUsers(page = 1, perPage = 50) {
  const p = Math.max(1, page);
  const pp = Math.min(Math.max(1, perPage), 1000);
  const rows = await q<UserRow>(pool, "SELECT * FROM auth_users WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT ? OFFSET ?", [pp, (p - 1) * pp]);
  const total = await q<{ c: number }>(pool, "SELECT COUNT(*) AS c FROM auth_users WHERE deleted_at IS NULL");
  return { users: rows.map(userJson), aud: "authenticated", total: Number(total[0].c), nextPage: rows.length === pp ? p + 1 : null, lastPage: Math.ceil(Number(total[0].c) / pp) };
}

export async function adminDeleteUser(id: string) {
  await q(pool, "DELETE FROM auth_users WHERE id = ?", [id]);
}

/** generateLink: returns an action link pointing at our /auth/v1/verify endpoint. */
export async function adminGenerateLink(opts: {
  type: "signup" | "magiclink" | "recovery" | "invite" | "email_change_current" | "email_change_new";
  email: string;
  password?: string;
  options?: { redirectTo?: string; data?: Record<string, unknown> };
  redirectTo?: string;
}) {
  const email = String(opts.email ?? "").trim().toLowerCase();
  let u = await getUserRowByEmail(email);
  if (!u) {
    if (opts.type === "signup" || opts.type === "invite") {
      await adminCreateUser({ email, password: opts.password, email_confirm: false, user_metadata: opts.options?.data });
      u = await getUserRowByEmail(email);
    } else {
      throw new AuthError("User with this email not found", 404, "user_not_found");
    }
  }
  const token = randomBytes(24).toString("hex");
  const otp = String(randomInt(0, 1000000)).padStart(6, "0");
  const redirectTo = opts.options?.redirectTo ?? opts.redirectTo ?? config.siteUrl;
  const expires = new Date(Date.now() + 24 * 3600000).toISOString();
  for (const t of [token, `${email}:${otp}`]) {
    await q(
      pool,
      "INSERT INTO auth_one_time_tokens (token_hash, user_id, token_type, redirect_to, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      [sha256(t), u!.id, opts.type, redirectTo, nowMysql(), toMysqlDatetime(expires)],
    );
  }
  const verifyType = opts.type === "magiclink" ? "magiclink" : opts.type;
  const actionLink = `${config.siteUrl}/auth/v1/verify?token=${token}&type=${verifyType}&redirect_to=${encodeURIComponent(redirectTo)}`;
  return {
    properties: {
      action_link: actionLink,
      email_otp: otp,
      hashed_token: sha256(token),
      redirect_to: redirectTo,
      verification_type: verifyType,
    },
    user: userJson(u!),
  };
}

/** Consume a one-time token from an action link; returns redirect target with session fragment. */
export async function verifyLink(token: string, type: string, redirectTo?: string | null) {
  const h = sha256(token ?? "");
  const r = await q<any>(pool, "SELECT * FROM auth_one_time_tokens WHERE token_hash = ?", [h]);
  const row = r[0];
  const target = safeRedirect(redirectTo ?? row?.redirect_to ?? config.siteUrl);
  if (!row || row.used_at || new Date(fromMysqlDatetime(row.expires_at)!).getTime() < Date.now()) {
    return `${target}#error=access_denied&error_code=otp_expired&error_description=${encodeURIComponent("Email link is invalid or has expired")}`;
  }
  await q(pool, "UPDATE auth_one_time_tokens SET used_at = ? WHERE token_hash = ?", [nowMysql(), h]);
  await q(pool, "UPDATE auth_users SET email_confirmed_at = COALESCE(email_confirmed_at, ?), last_sign_in_at = ? WHERE id = ?", [nowMysql(), nowMysql(), row.user_id]);
  const u = (await getUserRow(row.user_id))!;
  const s = await createSession(u);
  const t = type === "recovery" ? "recovery" : type === "invite" ? "invite" : type === "signup" ? "signup" : "magiclink";
  const frag = new URLSearchParams({
    access_token: s.access_token,
    expires_at: String(s.expires_at),
    expires_in: String(s.expires_in),
    refresh_token: s.refresh_token,
    token_type: "bearer",
    type: t,
  });
  return `${target}#${frag.toString()}`;
}

function safeRedirect(url: string) {
  try {
    const u = new URL(url, config.siteUrl);
    const site = new URL(config.siteUrl);
    const allowed = [site.host, `www.${site.host.replace(/^www\./, "")}`, site.host.replace(/^www\./, ""), "localhost:3000", "localhost:8080"];
    if (!allowed.includes(u.host)) return config.siteUrl;
    return u.toString().replace(/#.*$/, "");
  } catch {
    return config.siteUrl;
  }
}
