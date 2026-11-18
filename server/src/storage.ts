// File storage replacing Supabase Storage. Files live on the Hostinger disk
// (STORAGE_DIR/<bucket>/<path>), metadata in the storage_objects table, and the
// original storage RLS policies are evaluated against that table.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { pool, q } from "./db";
import { nowMysql } from "./codec";
import { Ctx, loadCtxRoles, meta, usingSql, checkSql } from "./engine";

export const buckets: Record<string, { public: boolean }> = {
  "product-images": { public: true },
  "course-images": { public: true },
  branding: { public: true },
  invoices: { public: false },
  "trainer-payouts": { public: false },
};

export class StorageError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

function safePath(bucket: string, name: string) {
  if (!buckets[bucket]) throw new StorageError("Bucket not found", 404);
  const clean = name.replace(/^\/+/, "");
  if (!clean || clean.split("/").some((p) => p === ".." || p === "")) throw new StorageError("Invalid key", 400);
  const full = path.resolve(config.storageDir, bucket, clean);
  if (!full.startsWith(path.resolve(config.storageDir, bucket) + path.sep)) throw new StorageError("Invalid key", 400);
  return { full, clean };
}

const policies = () => meta.storagePolicies;

async function allowed(ctx: Ctx, cmd: "SELECT" | "INSERT" | "UPDATE" | "DELETE", bucket: string, name: string, phase: "using" | "check") {
  if (ctx.service) return true;
  await loadCtxRoles(ctx);
  const cond = phase === "using" ? usingSql(ctx, policies(), cmd) : checkSql(ctx, policies(), cmd);
  // Evaluate the policy against a virtual row so INSERT checks work before the row exists.
  const r = await q(
    pool,
    `SELECT 1 FROM (SELECT ? AS bucket_id, ? AS name, ? AS owner) AS objects WHERE ${cond}`,
    [bucket, name, ctx.uid],
  );
  return r.length > 0;
}

export async function upload(ctx: Ctx, bucket: string, name: string, data: Buffer, contentType: string, upsert: boolean) {
  const { full, clean } = safePath(bucket, name);
  const existing = await q<any>(pool, "SELECT id FROM storage_objects WHERE bucket_id = ? AND name = ?", [bucket, clean]);
  if (existing.length && !upsert) throw new StorageError("The resource already exists", 409);
  const cmd = existing.length ? "UPDATE" : "INSERT";
  if (!(await allowed(ctx, cmd, bucket, clean, cmd === "INSERT" ? "check" : "using"))) {
    throw new StorageError("new row violates row-level security policy", 403);
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data);
  const metaJson = JSON.stringify({ size: data.length, mimetype: contentType || "application/octet-stream" });
  if (existing.length) {
    await q(pool, "UPDATE storage_objects SET metadata = ?, updated_at = ? WHERE id = ?", [metaJson, nowMysql(), existing[0].id]);
  } else {
    await q(pool, "INSERT INTO storage_objects (id, bucket_id, name, owner, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
      randomUUID(), bucket, clean, ctx.uid, metaJson, nowMysql(), nowMysql(),
    ]);
  }
  return { path: clean, fullPath: `${bucket}/${clean}`, id: clean };
}

export async function download(ctx: Ctx, bucket: string, name: string) {
  const { full, clean } = safePath(bucket, name);
  if (!buckets[bucket].public && !(await allowed(ctx, "SELECT", bucket, clean, "using"))) {
    throw new StorageError("Object not found", 404);
  }
  if (!fs.existsSync(full)) throw new StorageError("Object not found", 404);
  const r = await q<any>(pool, "SELECT metadata FROM storage_objects WHERE bucket_id = ? AND name = ?", [bucket, clean]);
  let mimetype = "application/octet-stream";
  try {
    const m = typeof r[0]?.metadata === "string" ? JSON.parse(r[0].metadata) : r[0]?.metadata;
    if (m?.mimetype) mimetype = m.mimetype;
  } catch { /* ignore */ }
  if (mimetype === "application/octet-stream") mimetype = guessMime(clean);
  return { file: full, mimetype };
}

export async function remove(ctx: Ctx, bucket: string, names: string[]) {
  const out: any[] = [];
  for (const n of names) {
    const { full, clean } = safePath(bucket, n);
    if (!(await allowed(ctx, "DELETE", bucket, clean, "using"))) continue;
    await q(pool, "DELETE FROM storage_objects WHERE bucket_id = ? AND name = ?", [bucket, clean]);
    try { fs.unlinkSync(full); } catch { /* ignore */ }
    out.push({ name: clean, bucket_id: bucket });
  }
  return out;
}

export async function list(ctx: Ctx, bucket: string, prefix: string, limit = 100, offset = 0) {
  const p = (prefix ?? "").replace(/^\/+|\/+$/g, "");
  const like = p ? `${p}/%` : "%";
  const rows = await q<any>(pool, "SELECT * FROM storage_objects WHERE bucket_id = ? AND name LIKE ? ORDER BY name LIMIT ? OFFSET ?", [bucket, like, limit, offset]);
  const out: any[] = [];
  for (const r of rows) {
    if (!buckets[bucket]?.public && !(await allowed(ctx, "SELECT", bucket, r.name, "using"))) continue;
    const rel = p ? r.name.slice(p.length + 1) : r.name;
    if (rel.includes("/")) continue;
    out.push({ name: rel, id: r.id, created_at: r.created_at, updated_at: r.updated_at, metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata });
  }
  return out;
}

export function publicUrl(bucket: string, name: string) {
  return `${config.siteUrl}/storage/v1/object/public/${bucket}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

// Signed URLs (HMAC, no DB state)
function sig(bucket: string, name: string, exp: number) {
  return createHmac("sha256", config.jwtSecret).update(`${bucket}/${name}:${exp}`).digest("hex");
}

export async function signedUrl(ctx: Ctx, bucket: string, name: string, expiresIn: number) {
  const { clean } = safePath(bucket, name);
  if (!buckets[bucket].public && !(await allowed(ctx, "SELECT", bucket, clean, "using"))) throw new StorageError("Object not found", 404);
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.trunc(expiresIn || 60));
  const enc = clean.split("/").map(encodeURIComponent).join("/");
  return `${config.siteUrl}/storage/v1/object/sign/${bucket}/${enc}?token=${exp}.${sig(bucket, clean, exp)}`;
}

export function verifySigned(bucket: string, name: string, token: string) {
  const [expS, s] = String(token ?? "").split(".");
  const exp = parseInt(expS, 10);
  if (!exp || exp < Date.now() / 1000 || !s) return false;
  const a = Buffer.from(sig(bucket, name, exp));
  const b = Buffer.from(s);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function guessMime(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return (
    {
      pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
      gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", mp4: "video/mp4", json: "application/json",
    } as Record<string, string>
  )[ext ?? ""] ?? "application/octet-stream";
}
