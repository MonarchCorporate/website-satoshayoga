// Server-side drop-in for `createClient` from @supabase/supabase-js, used by the
// ported edge functions. Talks to the engine in-process.
import { QueryBuilder, RpcBuilder, ChannelStub, DbTransport } from "../../shared/supabase-core";
import { config } from "./config";
import { Ctx, execute } from "./engine";
import { callRpc } from "./rpc";
import * as auth from "./auth";
import * as storage from "./storage";
import { invokeFunction } from "./functions-registry";

function headerValue(h: any, name: string): string | null {
  if (!h) return null;
  if (typeof h.get === "function") return h.get(name);
  const k = Object.keys(h).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? h[k] : null;
}

function ctxFor(key: string, authHeader: string | null): Ctx {
  const bearer = authHeader?.replace(/^Bearer\s+/i, "") ?? null;
  if (key && key === config.serviceKey && (!bearer || bearer === config.serviceKey)) return { uid: null, service: true };
  if (bearer && bearer === config.serviceKey) return { uid: null, service: true };
  const claims = auth.verifyAccessToken(bearer);
  return claims ? { uid: claims.sub, email: claims.email ?? null, service: false } : { uid: null, service: false };
}

const ok = (data: any) => ({ data, error: null });
const fail = (e: any) => ({ data: null, error: e instanceof auth.AuthError ? Object.assign(new Error(e.message), e.toJSON()) : Object.assign(new Error(e?.message ?? String(e)), { status: 500 }) });

export function createClient(_url: string, key: string, opts: any = {}) {
  const authHeader = headerValue(opts?.global?.headers, "Authorization");
  const freshCtx = () => ctxFor(key, authHeader);

  const transport: DbTransport = {
    db: (req) => execute(freshCtx(), req),
    rpc: (fn, args) => callRpc(freshCtx(), fn, args),
  };

  const bucketApi = (bucket: string) => ({
    async upload(path: string, body: any, o: any = {}) {
      try {
        const buf = await toBuffer(body);
        const r = await storage.upload(freshCtx(), bucket, path, buf, o.contentType ?? storage.guessMime(path), !!o.upsert);
        return ok(r);
      } catch (e: any) {
        return { data: null, error: Object.assign(new Error(e.message), { statusCode: String(e.statusCode ?? 500) }) };
      }
    },
    async update(path: string, body: any, o: any = {}) {
      return this.upload(path, body, { ...o, upsert: true });
    },
    async download(path: string) {
      try {
        const { file, mimetype } = await storage.download(freshCtx(), bucket, path);
        const fs = await import("node:fs");
        return ok(new Blob([fs.readFileSync(file)], { type: mimetype }));
      } catch (e: any) {
        return { data: null, error: Object.assign(new Error(e.message), { statusCode: String(e.statusCode ?? 500) }) };
      }
    },
    async remove(paths: string[]) {
      try {
        return ok(await storage.remove(freshCtx(), bucket, paths));
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    async list(prefix = "", o: any = {}) {
      try {
        return ok(await storage.list(freshCtx(), bucket, prefix, o.limit ?? 100, o.offset ?? 0));
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    async createSignedUrl(path: string, expiresIn: number) {
      try {
        const url = await storage.signedUrl(freshCtx(), bucket, path, expiresIn);
        return ok({ signedUrl: url, signedURL: url });
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: storage.publicUrl(bucket, path) } };
    },
  });

  return {
    from: (table: string) => new QueryBuilder(transport, table),
    rpc: (fn: string, args: Record<string, unknown> = {}, o: any = {}) => new RpcBuilder(transport, fn, args, o),
    channel: (topic: string) => new ChannelStub(topic),
    removeChannel: async () => "ok",
    storage: { from: bucketApi },
    functions: {
      async invoke(name: string, o: any = {}) {
        const headers: Record<string, string> = { "Content-Type": "application/json", ...(o.headers ?? {}) };
        if (!headerValue(headers, "Authorization")) headers["Authorization"] = authHeader ?? `Bearer ${key}`;
        const body = o.body === undefined ? undefined : typeof o.body === "string" ? o.body : JSON.stringify(o.body);
        const res = await invokeFunction(name, new Request(`${config.siteUrl}/functions/v1/${name}`, { method: o.method ?? "POST", headers, body }));
        const ct = res.headers.get("content-type") ?? "";
        const data = ct.includes("application/json") ? await res.json().catch(() => null) : await res.text();
        if (!res.ok) return { data, error: Object.assign(new Error(`Edge Function returned a non-2xx status code`), { name: "FunctionsHttpError", context: res, status: res.status }) };
        return { data, error: null };
      },
    },
    auth: {
      async getUser(jwtArg?: string) {
        const token = jwtArg ?? authHeader?.replace(/^Bearer\s+/i, "") ?? null;
        const claims = auth.verifyAccessToken(token);
        if (!claims) return { data: { user: null }, error: Object.assign(new Error("invalid JWT"), { status: 401, code: "bad_jwt" }) };
        const u = await auth.getUserRow(claims.sub);
        if (!u) return { data: { user: null }, error: Object.assign(new Error("User not found"), { status: 404, code: "user_not_found" }) };
        return { data: { user: auth.userJson(u) }, error: null };
      },
      async getClaims(jwtArg?: string) {
        const token = jwtArg ?? authHeader?.replace(/^Bearer\s+/i, "") ?? null;
        const claims = auth.verifyAccessToken(token);
        return claims ? { data: { claims }, error: null } : { data: null, error: new Error("invalid JWT") };
      },
      async getSession() {
        return { data: { session: null }, error: null };
      },
      admin: {
        async createUser(o: any) {
          try { return ok({ user: await auth.adminCreateUser(o) }); } catch (e) { return fail(e); }
        },
        async getUserById(id: string) {
          const u = await auth.getUserRow(id);
          return u ? ok({ user: auth.userJson(u) }) : fail(new auth.AuthError("User not found", 404, "user_not_found"));
        },
        async listUsers(o: any = {}) {
          try { return ok(await auth.adminListUsers(o.page ?? 1, o.perPage ?? 50)); } catch (e) { return fail(e); }
        },
        async updateUserById(id: string, attrs: any) {
          try { return ok({ user: await auth.adminUpdateUser(id, attrs) }); } catch (e) { return fail(e); }
        },
        async deleteUser(id: string) {
          try { await auth.adminDeleteUser(id); return ok({}); } catch (e) { return fail(e); }
        },
        async generateLink(o: any) {
          try { return ok(await auth.adminGenerateLink(o)); } catch (e) { return fail(e); }
        },
        async inviteUserByEmail(email: string, o: any = {}) {
          try {
            const r = await auth.adminGenerateLink({ type: "invite", email, options: { redirectTo: o.redirectTo, data: o.data } });
            return ok({ user: r.user });
          } catch (e) { return fail(e); }
        },
      },
    },
  };
}

async function toBuffer(body: any): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(new Uint8Array(body));
  if (typeof Blob !== "undefined" && body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (typeof body === "string") return Buffer.from(body);
  throw new Error("unsupported upload body");
}
