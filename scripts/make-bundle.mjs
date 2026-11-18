#!/usr/bin/env node
// Build the encrypted import bundle from the Supabase export directory.
//   MIGRATION_KEY=... node scripts/make-bundle.mjs <exportDir> <out.enc>
// exportDir must contain data.json, auth.json and storage/<bucket>/<path>.
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const [exportDir, out] = process.argv.slice(2);
const key = process.env.MIGRATION_KEY;
if (!exportDir || !out || !key) {
  console.error("usage: MIGRATION_KEY=... node scripts/make-bundle.mjs <exportDir> <out.enc>");
  process.exit(1);
}

const parts = [];
function add(name, data) {
  const n = Buffer.from(name, "utf8");
  const h = Buffer.alloc(4);
  h.writeUInt32BE(n.length);
  const l = Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  parts.push(h, n, l, data);
}
add("data.json", fs.readFileSync(path.join(exportDir, "data.json")));
add("auth.json", fs.readFileSync(path.join(exportDir, "auth.json")));
let files = 0;
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walk(full, r);
    else { add(`storage/${r}`, fs.readFileSync(full)); files++; }
  }
}
const storageDir = path.join(exportDir, "storage");
if (fs.existsSync(storageDir)) walk(storageDir, "");

const plain = zlib.gzipSync(Buffer.concat(parts), { level: 6 });
const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), iv);
const enc = Buffer.concat([c.update(plain), c.final()]);
fs.writeFileSync(out, Buffer.concat([iv, c.getAuthTag(), enc]), { mode: 0o600 });
console.log(`bundle written: ${out} (${files} storage files, ${(enc.length / 1048576).toFixed(1)} MB)`);
