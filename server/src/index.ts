// Santosha Yoga – self-hosted server (Hostinger Node.js app).
// Serves the built React app and the API that replaces Supabase/Lovable Cloud.
import express, { type Request as ExReq, type Response as ExRes, type NextFunction } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, assertProductionConfig } from "./config";
import { execute, Ctx } from "./engine";
import { callRpc } from "./rpc";
import * as auth from "./auth";
import * as storage from "./storage";
import { invokeFunction, installFetchInterceptor } from "./functions-registry";
import { ensureSchema } from "./migrate";
import { importRouter, importFromFileIfPresent } from "./importer";
import { startCron, runJob } from "./cron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = process.env.DIST_DIR ?? path.resolve(__dirname, "..", "dist");

assertProductionConfig();
installFetchInterceptor();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);

function bearer(req: ExReq) {
  const h = req.headers.authorization ?? "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

function ctxFromReq(req: ExReq): Ctx {
  const c = auth.verifyAccessToken(bearer(req));
  return c ? { uid: c.sub, email: c.email ?? null, service: false } : { uid: null, service: false };
}

const wrap = (fn: (req: ExReq, res: ExRes) => Promise<unknown>) => (req: ExReq, res: ExRes, next: NextFunction) =>
  fn(req, res).catch(next);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/api/health", wrap(async (_req, res) => {
  const r = await execute({ uid: null, service: true }, { table: "course_types", op: "select", select: "id", limit: 1 });
  res.json({ ok: !r.error, db: r.error ? r.error.message : "ok", time: new Date().toISOString() });
}));

// ---------------------------------------------------------------------------
// Database API (used by the browser client)
// ---------------------------------------------------------------------------
app.post("/api/db", express.json({ limit: "10mb" }), wrap(async (req, res) => {
  const r = await execute(ctxFromReq(req), req.body);
  res.status(r.status >= 400 ? r.status : 200).json(r);
}));

app.post("/api/rpc/:fn", express.json({ limit: "5mb" }), wrap(async (req, res) => {
  const r = await callRpc(ctxFromReq(req), req.params.fn, req.body ?? {});
  res.status(r.status >= 400 ? r.status : 200).json(r);
}));

// ---------------------------------------------------------------------------
// Auth API (GoTrue compatible subset)
// ---------------------------------------------------------------------------
const authJson = express.json({ limit: "1mb" });
function authFail(res: ExRes, e: any) {
  if (e instanceof auth.AuthError) return res.status(e.status).json(e.toJSON());
  console.error("[auth]", e);
  return res.status(500).json({ message: "Internal error", status: 500, code: "unexpected_failure" });
}

app.post("/auth/v1/token", authJson, async (req, res) => {
  try {
    const grant = String(req.query.grant_type ?? req.body?.grant_type ?? "");
    if (grant === "password") return res.json(await auth.passwordGrant(String(req.body?.email ?? ""), String(req.body?.password ?? "")));
    if (grant === "refresh_token") return res.json(await auth.refreshGrant(String(req.body?.refresh_token ?? "")));
    throw new auth.AuthError("unsupported grant_type", 400, "validation_failed");
  } catch (e) {
    authFail(res, e);
  }
});

app.post("/auth/v1/signup", authJson, async (req, res) => {
  // Same flow as the "account-confirmation" function: create an unconfirmed account
  // and send the confirmation email via the studio's own SMTP.
  try {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const data = req.body?.data ?? req.body?.options?.data ?? {};
    const r = await invokeFunction(
      "account-confirmation",
      new Request(`${config.siteUrl}/functions/v1/account-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "signup",
          email,
          password: req.body?.password,
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          newsletter_opt_in: data.newsletter_opt_in === true,
        }),
      }),
    );
    const body: any = await r.json().catch(() => ({}));
    if (body?.error === "already_registered") throw new auth.AuthError("User already registered", 422, "user_already_exists");
    if (body?.error === "weak_password") throw new auth.AuthError("Password should be at least 6 characters.", 422, "weak_password");
    if (body?.error === "invalid_email") throw new auth.AuthError("Unable to validate email address: invalid format", 400, "email_address_invalid");
    const u = await auth.getUserRowByEmail(email);
    if (!u) throw new auth.AuthError(body?.error ?? "Signup failed", 500, "unexpected_failure");
    if (u.email_confirmed_at) {
      const s = await auth.createSession(u);
      return res.json({ ...s, user: s.user });
    }
    return res.json({ user: auth.userJson(u), session: null });
  } catch (e) {
    authFail(res, e);
  }
});

app.get("/auth/v1/user", async (req, res) => {
  const c = auth.verifyAccessToken(bearer(req));
  if (!c) return res.status(401).json({ message: "invalid JWT", status: 401, code: "bad_jwt" });
  const u = await auth.getUserRow(c.sub);
  if (!u) return res.status(404).json({ message: "User not found", status: 404, code: "user_not_found" });
  res.json(auth.userJson(u));
});

app.put("/auth/v1/user", authJson, async (req, res) => {
  try {
    const c = auth.verifyAccessToken(bearer(req));
    if (!c) throw new auth.AuthError("invalid JWT", 401, "bad_jwt");
    res.json(await auth.updateUser(c.sub, req.body ?? {}));
  } catch (e) {
    authFail(res, e);
  }
});

app.post("/auth/v1/logout", async (req, res) => {
  const c = auth.verifyAccessToken(bearer(req));
  if (c) await auth.logout(c.sub);
  res.status(204).end();
});

app.get("/auth/v1/verify", async (req, res) => {
  try {
    const target = await auth.verifyLink(String(req.query.token ?? ""), String(req.query.type ?? ""), (req.query.redirect_to as string) ?? null);
    res.redirect(303, target);
  } catch (e) {
    console.error("[auth] verify", e);
    res.redirect(303, `${config.siteUrl}/#error=server_error`);
  }
});

// ---------------------------------------------------------------------------
// Storage API
// ---------------------------------------------------------------------------
function objectKey(req: ExReq) {
  return decodeURIComponent((req.params as any)[0] ?? "");
}
function storageFail(res: ExRes, e: any) {
  const code = e?.statusCode ?? 500;
  if (code === 500) console.error("[storage]", e);
  res.status(code).json({ statusCode: String(code), error: e?.message ?? "error", message: e?.message ?? "error" });
}

app.get("/storage/v1/object/public/:bucket/*", async (req, res) => {
  try {
    if (!storage.buckets[req.params.bucket]?.public) throw new storage.StorageError("Bucket not found", 404);
    const { file, mimetype } = await storage.download({ uid: null, service: true }, req.params.bucket, objectKey(req));
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(file);
  } catch (e) {
    storageFail(res, e);
  }
});

app.get("/storage/v1/object/sign/:bucket/*", async (req, res) => {
  try {
    const key = objectKey(req);
    if (!storage.verifySigned(req.params.bucket, key, String(req.query.token ?? ""))) throw new storage.StorageError("Invalid signature", 400);
    const { file, mimetype } = await storage.download({ uid: null, service: true }, req.params.bucket, key);
    res.setHeader("Content-Type", mimetype);
    if (req.query.download !== undefined) res.setHeader("Content-Disposition", `attachment; filename="${path.basename(key)}"`);
    res.sendFile(file);
  } catch (e) {
    storageFail(res, e);
  }
});

app.post("/storage/v1/object/sign/:bucket/*", authJson, async (req, res) => {
  try {
    const url = await storage.signedUrl(ctxFromReq(req), req.params.bucket, objectKey(req), Number(req.body?.expiresIn ?? 60));
    res.json({ signedURL: url, signedUrl: url });
  } catch (e) {
    storageFail(res, e);
  }
});

app.post("/storage/v1/object/list/:bucket", authJson, async (req, res) => {
  try {
    res.json(await storage.list(ctxFromReq(req), req.params.bucket, req.body?.prefix ?? "", req.body?.limit ?? 100, req.body?.offset ?? 0));
  } catch (e) {
    storageFail(res, e);
  }
});

app.get("/storage/v1/object/:bucket/*", async (req, res) => {
  try {
    const { file, mimetype } = await storage.download(ctxFromReq(req), req.params.bucket, objectKey(req));
    res.setHeader("Content-Type", mimetype);
    res.setHeader("Cache-Control", "private, no-store");
    res.sendFile(file);
  } catch (e) {
    storageFail(res, e);
  }
});

const rawUpload = express.raw({ type: () => true, limit: "60mb" });
for (const method of ["post", "put"] as const) {
  app[method]("/storage/v1/object/:bucket/*", rawUpload, async (req, res) => {
    try {
      const upsert = method === "put" || String(req.headers["x-upsert"] ?? "false") === "true";
      const r = await storage.upload(ctxFromReq(req), req.params.bucket, objectKey(req), req.body as Buffer, String(req.headers["content-type"] ?? ""), upsert);
      res.json({ Key: r.fullPath, Id: r.id, path: r.path });
    } catch (e) {
      storageFail(res, e);
    }
  });
}

app.delete("/storage/v1/object/:bucket", authJson, async (req, res) => {
  try {
    res.json(await storage.remove(ctxFromReq(req), req.params.bucket, req.body?.prefixes ?? []));
  } catch (e) {
    storageFail(res, e);
  }
});

// ---------------------------------------------------------------------------
// Server functions (ported Supabase edge functions)
// ---------------------------------------------------------------------------
// Functions that are only ever called server-side (with the internal service key).
// send-email-smtp would otherwise be an open relay for the studio's mailbox.
const INTERNAL_ONLY_FUNCTIONS = new Set(["send-email-smtp"]);

app.all("/functions/v1/:name", express.raw({ type: () => true, limit: "25mb" }), wrap(async (req, res) => {
  if (INTERNAL_ONLY_FUNCTIONS.has(req.params.name) && bearer(req) !== config.serviceKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }
  const url = `${config.siteUrl}${req.originalUrl}`;
  const hasBody = !["GET", "HEAD"].includes(req.method) && Buffer.isBuffer(req.body) && req.body.length > 0;
  const fr = new Request(url, { method: req.method, headers, body: hasBody ? req.body : undefined });
  const out = await invokeFunction(req.params.name, fr);
  res.status(out.status);
  out.headers.forEach((v, k) => {
    if (k.toLowerCase() !== "content-length") res.setHeader(k, v);
  });
  res.send(Buffer.from(await out.arrayBuffer()));
}));

// ---------------------------------------------------------------------------
// Cron + data import (protected by secrets)
// ---------------------------------------------------------------------------
app.post("/api/internal/cron/:job", wrap(async (req, res) => {
  if (!config.cronSecret || req.headers["x-cron-secret"] !== config.cronSecret) return res.status(401).json({ error: "unauthorized" });
  res.json(await runJob(req.params.job));
}));
app.use("/api/_migrate", importRouter);

// ---------------------------------------------------------------------------
// Static frontend + SPA fallback
// ---------------------------------------------------------------------------
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    maxAge: "1h",
    setHeaders(res, p) {
      if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
  const indexHtml = path.join(distDir, "index.html");
  app.get(/^\/(?!api\/|auth\/v1\/|storage\/v1\/|functions\/v1\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
}

app.use((err: any, _req: ExReq, res: ExRes, _next: NextFunction) => {
  if (err?.type === "entity.parse.failed" || err?.type === "entity.too.large") {
    if (!res.headersSent) res.status(err.status ?? 400).json({ message: "Invalid request body", code: err.type, status: err.status ?? 400 });
    return;
  }
  console.error("[server] unhandled", err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

async function main() {
  await ensureSchema();
  await importFromFileIfPresent().catch((e) => console.error("[import] startup import failed", e));
  app.listen(config.port, () => {
    console.log(`[server] Santosha Yoga listening on :${config.port} (site ${config.siteUrl})`);
  });
  startCron();
}

main().catch((e) => {
  console.error("[server] failed to start", e);
  process.exit(1);
});
