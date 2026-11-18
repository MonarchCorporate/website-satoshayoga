/*
 * Minimal, self-hosted replacement for the parts of @supabase/supabase-js that
 * this application uses. The same query builder is used in the browser (HTTP
 * transport) and inside the Node server (in-process transport), so all existing
 * page code and the ported server functions keep their supabase-js style calls.
 */

export type PgError = { message: string; code?: string; details?: string | null; hint?: string | null };

export type Filter =
  | { kind: "f"; col: string; op: string; val: unknown; neg?: boolean }
  | { kind: "or"; expr: string };

export type DbRequest = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string | null; // null => no representation returned
  filters?: Filter[];
  order?: { col: string; asc: boolean; nullsFirst?: boolean }[];
  limit?: number | null;
  offset?: number | null;
  single?: "single" | "maybe" | null;
  count?: "exact" | "planned" | "estimated" | null;
  head?: boolean;
  values?: Record<string, unknown> | Record<string, unknown>[];
  onConflict?: string | null;
  ignoreDuplicates?: boolean;
  defaultToNull?: boolean;
};

export type DbResponse = {
  data: any;
  error: PgError | null;
  count?: number | null;
  status: number;
  statusText?: string;
};

export interface DbTransport {
  db(req: DbRequest): Promise<DbResponse>;
  rpc(fn: string, args: Record<string, unknown>, opts?: { head?: boolean; count?: string }): Promise<DbResponse>;
}

/** Parse the PostgREST "(a,b,c)" list syntax used by .filter()/.not() with "in". */
export function parseInList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const s = String(v).trim();
  const inner = s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s;
  if (!inner) return [];
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export class QueryBuilder<T = any> implements PromiseLike<DbResponse> {
  private req: DbRequest;
  private shouldThrow = false;

  constructor(private transport: DbTransport, table: string) {
    this.req = { table, op: "select", select: "*", filters: [], order: [] };
  }

  // ---- operations ----------------------------------------------------------
  select(columns = "*", opts: { count?: DbRequest["count"]; head?: boolean } = {}) {
    if (this.req.op === "select") {
      this.req.select = columns;
      if (opts.count) this.req.count = opts.count;
      if (opts.head) this.req.head = true;
    } else {
      // .insert(...).select() => return representation
      this.req.select = columns;
    }
    return this;
  }
  insert(values: any, opts: { count?: DbRequest["count"]; defaultToNull?: boolean } = {}) {
    this.req.op = "insert";
    this.req.values = values;
    this.req.select = null;
    if (opts.count) this.req.count = opts.count;
    if (opts.defaultToNull === false) this.req.defaultToNull = false;
    return this;
  }
  upsert(values: any, opts: { onConflict?: string; ignoreDuplicates?: boolean; count?: DbRequest["count"] } = {}) {
    this.req.op = "upsert";
    this.req.values = values;
    this.req.select = null;
    this.req.onConflict = opts.onConflict ?? null;
    this.req.ignoreDuplicates = !!opts.ignoreDuplicates;
    if (opts.count) this.req.count = opts.count;
    return this;
  }
  update(values: any, opts: { count?: DbRequest["count"] } = {}) {
    this.req.op = "update";
    this.req.values = values;
    this.req.select = null;
    if (opts.count) this.req.count = opts.count;
    return this;
  }
  delete(opts: { count?: DbRequest["count"] } = {}) {
    this.req.op = "delete";
    this.req.select = null;
    if (opts.count) this.req.count = opts.count;
    return this;
  }

  // ---- filters ---------------------------------------------------------------
  private f(col: string, op: string, val: unknown, neg = false) {
    this.req.filters!.push({ kind: "f", col, op, val, neg });
    return this;
  }
  eq(col: string, val: unknown) { return this.f(col, "eq", val); }
  neq(col: string, val: unknown) { return this.f(col, "neq", val); }
  gt(col: string, val: unknown) { return this.f(col, "gt", val); }
  gte(col: string, val: unknown) { return this.f(col, "gte", val); }
  lt(col: string, val: unknown) { return this.f(col, "lt", val); }
  lte(col: string, val: unknown) { return this.f(col, "lte", val); }
  like(col: string, val: string) { return this.f(col, "like", val); }
  ilike(col: string, val: string) { return this.f(col, "ilike", val); }
  is(col: string, val: unknown) { return this.f(col, "is", val); }
  in(col: string, vals: unknown[]) { return this.f(col, "in", vals); }
  contains(col: string, val: unknown) { return this.f(col, "cs", val); }
  containedBy(col: string, val: unknown) { return this.f(col, "cd", val); }
  overlaps(col: string, val: unknown) { return this.f(col, "ov", val); }
  match(obj: Record<string, unknown>) {
    for (const [k, v] of Object.entries(obj)) this.f(k, "eq", v);
    return this;
  }
  not(col: string, op: string, val: unknown) {
    return this.f(col, op, op === "in" ? parseInList(val) : val, true);
  }
  filter(col: string, op: string, val: unknown) {
    if (op.startsWith("not.")) return this.not(col, op.slice(4), val);
    return this.f(col, op, op === "in" ? parseInList(val) : val);
  }
  or(expr: string) {
    this.req.filters!.push({ kind: "or", expr });
    return this;
  }

  // ---- modifiers -------------------------------------------------------------
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.req.order!.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.req.limit = n;
    return this;
  }
  range(from: number, to: number) {
    this.req.offset = from;
    this.req.limit = to - from + 1;
    return this;
  }
  single() {
    this.req.single = "single";
    return this;
  }
  maybeSingle() {
    this.req.single = "maybe";
    return this;
  }
  abortSignal(_s: unknown) { return this; }
  returns<U>() { return this as unknown as QueryBuilder<U>; }
  throwOnError() {
    this.shouldThrow = true;
    return this;
  }

  then<R1 = DbResponse, R2 = never>(
    onfulfilled?: ((v: DbResponse) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const p = this.transport.db(this.req).then((res) => {
      if (this.shouldThrow && res.error) throw Object.assign(new Error(res.error.message), res.error);
      return res;
    });
    return p.then(onfulfilled as any, onrejected as any);
  }
}

export class RpcBuilder implements PromiseLike<DbResponse> {
  private single_: "single" | "maybe" | null = null;
  constructor(private transport: DbTransport, private fn: string, private args: Record<string, unknown>, private opts: any) {}
  single() { this.single_ = "single"; return this; }
  maybeSingle() { this.single_ = "maybe"; return this; }
  then<R1 = DbResponse, R2 = never>(
    onfulfilled?: ((v: DbResponse) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((e: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    const p = this.transport.rpc(this.fn, this.args ?? {}, this.opts).then((res) => {
      if (this.single_ && !res.error && Array.isArray(res.data)) {
        if (res.data.length === 1) return { ...res, data: res.data[0] };
        if (res.data.length === 0 && this.single_ === "maybe") return { ...res, data: null };
        return { ...res, data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
      }
      return res;
    });
    return p.then(onfulfilled as any, onrejected as any);
  }
}

/** Realtime is not used for anything essential (one admin list). Provide a harmless stub. */
export class ChannelStub {
  constructor(public topic: string) {}
  on(..._args: unknown[]) { return this; }
  subscribe(cb?: (status: string) => void) {
    if (cb) setTimeout(() => cb("SUBSCRIBED"), 0);
    return this;
  }
  unsubscribe() { return Promise.resolve("ok"); }
}
