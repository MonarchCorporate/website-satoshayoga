// One-time data import from the Supabase export (encrypted bundle).
// The bundle is produced by scripts/make-bundle.mjs and contains data.json,
// auth.json and all storage files. It is AES-256-GCM encrypted with
// sha256(MIGRATION_KEY), so it can be transported/uploaded without exposing data.
import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import express from "express";
import { config } from "./config";
import { pool, q } from "./db";
import { encodeValue, toMysqlDatetime } from "./codec";
import { meta } from "./engine";

const OLD_ORIGINS = ["https://euhylkwgvabpfqqixjaq.supabase.co"];

function decryptBundle(buf: Buffer): Map<string, Buffer> {
  const key = createHash("sha256").update(config.migrationKey).digest();
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  const plain = zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(28)), d.final()]));
  const files = new Map<string, Buffer>();
  let o = 0;
  while (o < plain.length) {
    const nl = plain.readUInt32BE(o); o += 4;
    const name = plain.subarray(o, o + nl).toString("utf8"); o += nl;
    const dl = plain.readUInt32BE(o); o += 4;
    files.set(name, plain.subarray(o, o + dl)); o += dl;
  }
  return files;
}

function rewrite(v: any): any {
  if (typeof v === "string") {
    let s = v;
    for (const o of OLD_ORIGINS) if (s.includes(o)) s = s.split(o).join(config.siteUrl);
    return s;
  }
  if (Array.isArray(v)) return v.map(rewrite);
  if (v && typeof v === "object") {
    const out: any = {};
    for (const [k, x] of Object.entries(v)) out[k] = rewrite(x);
    return out;
  }
  return v;
}

async function insertBatch(conn: any, table: string, cols: string[], rows: unknown[][], ignore = false) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const ph = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    const [r] = await conn.query(`INSERT ${ignore ? "IGNORE " : ""}INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(",")}) VALUES ${ph}`, chunk.flat());
    inserted += Number(r?.affectedRows ?? 0);
  }
  return inserted;
}

/**
 * mode "replace": wipe everything and load the export (initial import / final sync).
 * mode "merge":   only add rows that do not exist yet (catch-up after the DNS switch);
 *                 existing rows on the new system are never modified.
 */
export async function importBundle(buf: Buffer, mode: "replace" | "merge" = "replace", numberGap = 0) {
  const merge = mode === "merge";
  const files = decryptBundle(buf);
  const data = JSON.parse(files.get("data.json")!.toString("utf8"));
  const authData = JSON.parse(files.get("auth.json")!.toString("utf8"));
  const counts: Record<string, number> = {};
  const conn = await pool.getConnection();
  try {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    await conn.beginTransaction();
    const order: string[] = (meta as any).tableOrder;
    if (!merge) {
      for (const t of [...order].reverse()) await conn.query(`DELETE FROM \`${t}\``);
      for (const t of ["auth_refresh_tokens", "auth_one_time_tokens", "storage_objects", "auth_users", "app_sequences"]) await conn.query(`DELETE FROM \`${t}\``);
    }

    // auth.users
    const users = authData.users ?? [];
    counts.auth_users = await insertBatch(
      conn,
      "auth_users",
      ["id", "email", "encrypted_password", "email_confirmed_at", "created_at", "updated_at", "last_sign_in_at", "raw_user_meta_data", "raw_app_meta_data", "phone", "banned_until", "deleted_at", "is_anonymous"],
      users.map((u: any) => [
        u.id, u.email ? String(u.email).toLowerCase() : null, u.encrypted_password || null, toMysqlDatetime(u.email_confirmed_at),
        toMysqlDatetime(u.created_at), toMysqlDatetime(u.updated_at ?? u.created_at), toMysqlDatetime(u.last_sign_in_at),
        JSON.stringify(u.raw_user_meta_data ?? {}), JSON.stringify(u.raw_app_meta_data ?? {}), u.phone || null,
        toMysqlDatetime(u.banned_until), toMysqlDatetime(u.deleted_at), u.is_anonymous ? 1 : 0,
      ]),
      merge,
    );

    // public tables
    for (const t of order) {
      const rows: any[] = data[t] ?? [];
      const tm = meta.tables[t];
      const cols = Object.keys(tm.columns);
      counts[t] = await insertBatch(conn, t, cols, rows.map((r) => cols.map((c) => encodeValue(tm.columns[c].type, rewrite(r[c]) ?? null) ?? null)), merge);
      if (merge && counts[t] < rows.length) counts[`${t}__already_present_or_conflicting`] = rows.length - counts[t];
    }

    // course number sequence (Postgres: courses_course_no_seq)
    const maxNo = Math.max(0, ...(data.courses ?? []).map((c: any) => Number(c.course_no ?? 0)));
    await conn.query(
      "INSERT INTO app_sequences (name, value) VALUES ('courses_course_no_seq', ?) ON DUPLICATE KEY UPDATE value = GREATEST(value, VALUES(value))",
      [maxNo],
    );
    if (!merge && numberGap > 0) {
      // Leave a small gap in the yearly order/invoice counters so numbers issued by the old
      // system during the DNS switch can never collide with numbers issued here.
      await conn.query("UPDATE number_sequences SET last_value = last_value + ?", [Math.trunc(numberGap)]);
      counts.number_gap = Math.trunc(numberGap);
    }
    if (merge) {
      // Password changes made on the old system during the DNS switch: apply only when the
      // account here still has exactly the hash that was imported (never overwrite a newer change).
      let pw = 0;
      for (const o of authData.password_overrides ?? []) {
        const [r] = (await conn.query(
          "UPDATE auth_users SET encrypted_password = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ? AND encrypted_password = ?",
          [o.encrypted_password, o.id, o.expected_current],
        )) as any;
        pw += Number(r?.affectedRows ?? 0);
      }
      counts.password_overrides_applied = pw;
      // keep yearly counters ahead of anything created on either system
      for (const ns of data.number_sequences ?? []) {
        await conn.query("UPDATE number_sequences SET last_value = GREATEST(last_value, ?) WHERE scope = ? AND year = ?", [ns.last_value, ns.scope, ns.year]);
      }
    }

    // storage
    let stored = 0;
    const objects = authData.objects ?? [];
    const objRows: unknown[][] = [];
    for (const o of objects) {
      const f = files.get(`storage/${o.bucket_id}/${o.name}`);
      if (!f) continue;
      const dest = path.resolve(config.storageDir, o.bucket_id, o.name);
      if (!dest.startsWith(path.resolve(config.storageDir))) continue;
      if (merge && fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f);
      objRows.push([o.id, o.bucket_id, o.name, o.owner ?? null, JSON.stringify(o.metadata ?? {}), toMysqlDatetime(o.created_at), toMysqlDatetime(o.created_at)]);
      stored++;
    }
    await insertBatch(conn, "storage_objects", ["id", "bucket_id", "name", "owner", "metadata", "created_at", "updated_at"], objRows, merge);
    counts.storage_files = stored;

    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
    conn.release();
  }
  console.log("[import] done", counts);
  return counts;
}

function keyOk(given: unknown) {
  if (!config.migrationKey || typeof given !== "string") return false;
  const a = Buffer.from(createHash("sha256").update(given).digest("hex"));
  const b = Buffer.from(createHash("sha256").update(config.migrationKey).digest("hex"));
  return timingSafeEqual(a, b);
}

export const importRouter = express.Router();
importRouter.post("/import", express.raw({ type: () => true, limit: "200mb" }), async (req, res) => {
  if (!keyOk(req.headers["x-migration-key"])) return res.status(404).json({ error: "not found" });
  try {
    const mode = req.query.mode === "merge" ? "merge" : "replace";
    const gap = Number(req.query.gap ?? 0) || 0;
    res.json({ ok: true, mode, counts: await importBundle(req.body as Buffer, mode, gap) });
  } catch (e: any) {
    console.error("[import] failed", e);
    res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
});

/** Startup import: picks up santosha-import.enc next to the app (uploaded via file manager). */
export async function importFromFileIfPresent() {
  if (!config.migrationKey) return;
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "public_html"),
    // Hostinger: ~/domains/<domain>/public_html next to STORAGE_DIR
    path.resolve(config.storageDir, "..", "public_html"),
  ].map((d) => path.join(d, "santosha-import.enc"));
  // Remove result markers of earlier imports
  for (const f of candidates) fs.rmSync(f.replace(/\.enc$/, ".result.json"), { force: true });
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    console.log(`[import] found ${f}, importing…`);
    let result: Record<string, unknown>;
    try {
      result = { ok: true, counts: await importBundle(fs.readFileSync(f), "replace", Number(process.env.IMPORT_NUMBER_GAP ?? 20) || 0) };
    } catch (e: any) {
      result = { ok: false, error: e?.message ?? String(e) };
    } finally {
      fs.rmSync(f, { force: true });
    }
    // Non-sensitive marker (row counts only) so the import can be verified via the file manager.
    fs.writeFileSync(f.replace(/\.enc$/, ".result.json"), JSON.stringify({ ...result!, at: new Date().toISOString() }));
    return;
  }
}
