// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
// Guest booking token (HMAC-SHA256) — used for checkout-related edge functions
// so anonymous users can complete a booking against a freshly-created shadow account.

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getKey(): Promise<CryptoKey> {
  const secret = __env("GUEST_BOOKING_SECRET");
  if (!secret) throw new Error("GUEST_BOOKING_SECRET not configured");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signGuestToken(userId: string, ttlSeconds = 60 * 60): Promise<string> {
  const payload = { sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyGuestToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlDecode(sig),
      enc.encode(body),
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.sub !== "string") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective user id for a request.
 * Priority: standard Supabase auth > guest token in `x-guest-token` header.
 * Returns { userId, isGuest } or null if neither is valid.
 */
export async function resolveRequestUser(
  req: Request,
  userClient: { auth: { getUser: () => Promise<{ data: { user: { id: string; email?: string | null } | null } }> } },
): Promise<{ userId: string; email: string | null; isGuest: boolean } | null> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader !== "Bearer " && !authHeader.endsWith(" null")) {
    const { data } = await userClient.auth.getUser();
    if (data.user) return { userId: data.user.id, email: data.user.email ?? null, isGuest: false };
  }
  const guest = req.headers.get("x-guest-token");
  const uid = await verifyGuestToken(guest);
  if (uid) return { userId: uid, email: null, isGuest: true };
  return null;
}
