// Self-hosted replacement for the Supabase client. Same API surface as the parts
// of @supabase/supabase-js used by this app, backed by our own Node server.
// Import the client like this:
// import { supabase } from "@/integrations/supabase/client";
import { QueryBuilder, RpcBuilder, ChannelStub, type DbTransport, type DbRequest, type DbResponse } from "../../../shared/supabase-core";

type Session = {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: User;
};
type User = { id: string; email?: string; user_metadata: Record<string, any>; app_metadata: Record<string, any>; [k: string]: any };
type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "PASSWORD_RECOVERY";
type Listener = (event: AuthEvent, session: Session | null) => void;

const STORAGE_KEY = "santosha-auth-session";
const origin = typeof window !== "undefined" ? window.location.origin : "";

class AuthApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
    this.code = code;
  }
}

function readStored(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeStored(s: Session | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

class Auth {
  private session: Session | null = readStored();
  private listeners = new Set<Listener>();
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshing: Promise<Session | null> | null = null;
  private ready: Promise<void>;

  constructor() {
    this.ready = this.init();
  }

  private async init() {
    // Session from an email link (#access_token=...&type=recovery)
    if (typeof window !== "undefined" && window.location.hash.includes("access_token=")) {
      const p = new URLSearchParams(window.location.hash.slice(1));
      const access = p.get("access_token");
      const refresh = p.get("refresh_token");
      const type = p.get("type");
      if (access && refresh) {
        const user = await this.fetchUser(access);
        if (user) {
          this.setSession(
            {
              access_token: access,
              refresh_token: refresh,
              token_type: "bearer",
              expires_in: Number(p.get("expires_in") ?? 3600),
              expires_at: Number(p.get("expires_at") ?? Math.floor(Date.now() / 1000) + 3600),
              user,
            },
            type === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN",
          );
        }
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
    if (this.session && this.session.expires_at * 1000 < Date.now() + 60_000) {
      await this.refresh();
    } else {
      this.scheduleRefresh();
    }
  }

  private async fetchUser(token: string): Promise<User | null> {
    const r = await fetch(`${origin}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? r.json() : null;
  }

  private emit(event: AuthEvent) {
    for (const l of this.listeners) {
      try {
        l(event, this.session);
      } catch (e) {
        console.error(e);
      }
    }
  }

  private setSession(s: Session | null, event: AuthEvent) {
    this.session = s;
    writeStored(s);
    this.scheduleRefresh();
    this.emit(event);
  }

  private scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.session) return;
    const ms = Math.max(5_000, this.session.expires_at * 1000 - Date.now() - 120_000);
    this.refreshTimer = setTimeout(() => void this.refresh(), ms);
  }

  async refresh(): Promise<Session | null> {
    if (this.refreshing) return this.refreshing;
    const current = this.session;
    if (!current) return null;
    this.refreshing = (async () => {
      try {
        const r = await fetch(`${origin}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: current.refresh_token }),
        });
        if (r.ok) {
          const s = (await r.json()) as Session;
          this.setSession(s, "TOKEN_REFRESHED");
          return s;
        }
        if (r.status >= 400 && r.status < 500) this.setSession(null, "SIGNED_OUT");
        return null;
      } catch {
        return this.session;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Access token for API calls (refreshing it if it is about to expire). */
  async token(): Promise<string | null> {
    await this.ready;
    if (this.session && this.session.expires_at * 1000 < Date.now() + 30_000) await this.refresh();
    return this.session?.access_token ?? null;
  }

  // ---- supabase-js API ------------------------------------------------------
  onAuthStateChange(cb: Listener) {
    this.listeners.add(cb);
    this.ready.then(() => cb("INITIAL_SESSION", this.session));
    return { data: { subscription: { id: String(Math.random()), unsubscribe: () => this.listeners.delete(cb) } } };
  }

  async getSession() {
    await this.ready;
    if (this.session && this.session.expires_at * 1000 < Date.now() + 30_000) await this.refresh();
    return { data: { session: this.session }, error: null };
  }

  async getUser(jwt?: string) {
    const token = jwt ?? (await this.token());
    if (!token) return { data: { user: null }, error: new AuthApiError("Auth session missing!", 400, "session_not_found") };
    const user = await this.fetchUser(token);
    return user ? { data: { user }, error: null } : { data: { user: null }, error: new AuthApiError("invalid JWT", 401, "bad_jwt") };
  }

  async signInWithPassword(creds: { email: string; password: string }) {
    const r = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { data: { user: null, session: null }, error: new AuthApiError(body.message ?? "Login failed", r.status, body.code) };
    this.setSession(body, "SIGNED_IN");
    return { data: { user: body.user, session: body }, error: null };
  }

  async signUp(opts: { email: string; password: string; options?: { emailRedirectTo?: string; data?: Record<string, any> } }) {
    const r = await fetch(`${origin}/auth/v1/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: opts.email, password: opts.password, data: opts.options?.data ?? {} }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { data: { user: null, session: null }, error: new AuthApiError(body.message ?? "Signup failed", r.status, body.code) };
    if (body.access_token) {
      this.setSession(body, "SIGNED_IN");
      return { data: { user: body.user, session: body }, error: null };
    }
    return { data: { user: body.user, session: null }, error: null };
  }

  async updateUser(attrs: { password?: string; email?: string; data?: Record<string, any> }) {
    const token = await this.token();
    if (!token) return { data: { user: null }, error: new AuthApiError("Auth session missing!", 400, "session_not_found") };
    const r = await fetch(`${origin}/auth/v1/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(attrs),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return { data: { user: null }, error: new AuthApiError(body.message ?? "Update failed", r.status, body.code) };
    if (this.session) this.setSession({ ...this.session, user: body }, "USER_UPDATED");
    return { data: { user: body }, error: null };
  }

  async signOut(_opts?: unknown) {
    const token = this.session?.access_token;
    this.setSession(null, "SIGNED_OUT");
    if (token) await fetch(`${origin}/auth/v1/logout`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    return { error: null };
  }

  async setSessionFromTokens(access_token: string, refresh_token: string) {
    const user = await this.fetchUser(access_token);
    if (!user) return { data: { session: null }, error: new AuthApiError("invalid JWT", 401) };
    const s = { access_token, refresh_token, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
    this.setSession(s, "SIGNED_IN");
    return { data: { session: s, user }, error: null };
  }
}

const auth = new Auth();

async function authHeaders(): Promise<Record<string, string>> {
  const t = await auth.token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function postJson(url: string, body: unknown): Promise<DbResponse> {
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (j && typeof j === "object" && "error" in j) return j as DbResponse;
    return { data: null, error: { message: `HTTP ${r.status}`, code: String(r.status) }, status: r.status };
  } catch (e: any) {
    return { data: null, error: { message: e?.message ?? "Network error", code: "" }, status: 0 };
  }
}

const transport: DbTransport = {
  db: (req: DbRequest) => postJson(`${origin}/api/db`, req),
  rpc: (fn, args) => postJson(`${origin}/api/rpc/${encodeURIComponent(fn)}`, args),
};

class FunctionsHttpError extends Error {
  context: Response;
  constructor(res: Response) {
    super("Edge Function returned a non-2xx status code");
    this.name = "FunctionsHttpError";
    this.context = res;
  }
}

const functions = {
  async invoke(name: string, opts: { body?: any; headers?: Record<string, string>; method?: string } = {}) {
    try {
      const headers: Record<string, string> = { ...(await authHeaders()), ...(opts.headers ?? {}) };
      let body: BodyInit | undefined;
      if (opts.body !== undefined) {
        if (opts.body instanceof Blob || opts.body instanceof FormData || typeof opts.body === "string" || opts.body instanceof ArrayBuffer) {
          body = opts.body as BodyInit;
        } else {
          body = JSON.stringify(opts.body);
          headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
        }
      }
      const res = await fetch(`${origin}/functions/v1/${name}`, { method: opts.method ?? "POST", headers, body });
      const ct = res.headers.get("content-type") ?? "";
      const clone = res.clone();
      let data: any;
      if (ct.includes("application/json")) data = await res.json().catch(() => null);
      else if (ct.includes("application/pdf") || ct.includes("octet-stream")) data = await res.blob();
      else data = await res.text();
      if (!res.ok) return { data, error: new FunctionsHttpError(clone) };
      return { data, error: null };
    } catch (e: any) {
      return { data: null, error: Object.assign(new Error(e?.message ?? "Failed to send a request to the Edge Function"), { name: "FunctionsFetchError" }) };
    }
  },
};

function encPath(p: string) {
  return p.split("/").map(encodeURIComponent).join("/");
}

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: Blob | ArrayBuffer | string, opts: { upsert?: boolean; contentType?: string; cacheControl?: string } = {}) {
        const headers: Record<string, string> = { ...(await authHeaders()), "x-upsert": String(!!opts.upsert) };
        const ct = opts.contentType ?? (file instanceof Blob ? file.type : "") ?? "";
        if (ct) headers["Content-Type"] = ct;
        const r = await fetch(`${origin}/storage/v1/object/${bucket}/${encPath(path)}`, { method: "POST", headers, body: file as BodyInit });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) return { data: null, error: Object.assign(new Error(j.message ?? "Upload failed"), { statusCode: String(r.status) }) };
        return { data: { path: j.path ?? path, id: j.Id, fullPath: j.Key }, error: null };
      },
      async update(path: string, file: Blob | ArrayBuffer | string, opts: { contentType?: string } = {}) {
        return this.upload(path, file, { ...opts, upsert: true });
      },
      async download(path: string) {
        const r = await fetch(`${origin}/storage/v1/object/${bucket}/${encPath(path)}`, { headers: await authHeaders() });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          return { data: null, error: Object.assign(new Error(j.message ?? "Object not found"), { statusCode: String(r.status) }) };
        }
        return { data: await r.blob(), error: null };
      },
      async remove(paths: string[]) {
        const r = await fetch(`${origin}/storage/v1/object/${bucket}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ prefixes: paths }),
        });
        const j = await r.json().catch(() => null);
        return r.ok ? { data: j, error: null } : { data: null, error: new Error(j?.message ?? "Delete failed") };
      },
      async list(prefix = "", opts: { limit?: number; offset?: number } = {}) {
        const r = await fetch(`${origin}/storage/v1/object/list/${bucket}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ prefix, limit: opts.limit ?? 100, offset: opts.offset ?? 0 }),
        });
        const j = await r.json().catch(() => null);
        return r.ok ? { data: j, error: null } : { data: null, error: new Error(j?.message ?? "List failed") };
      },
      async createSignedUrl(path: string, expiresIn: number) {
        const r = await fetch(`${origin}/storage/v1/object/sign/${bucket}/${encPath(path)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ expiresIn }),
        });
        const j = await r.json().catch(() => ({}));
        return r.ok ? { data: { signedUrl: j.signedUrl }, error: null } : { data: null, error: new Error(j.message ?? "Sign failed") };
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `${origin}/storage/v1/object/public/${bucket}/${encPath(path)}` } };
      },
    };
  },
};

export const supabase = {
  from: (table: string) => new QueryBuilder(transport, table),
  rpc: (fn: string, args: Record<string, unknown> = {}, opts: any = {}) => new RpcBuilder(transport, fn, args, opts),
  auth,
  functions,
  storage,
  channel: (topic: string) => new ChannelStub(topic),
  removeChannel: async (_c: unknown) => "ok",
  removeAllChannels: async () => [],
};
