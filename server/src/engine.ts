/*
 * PostgREST-compatible query engine on top of MySQL/MariaDB.
 * Implements the subset of features the Santosha app uses, including
 * resource embedding, filters, ordering, counting and row level security
 * (translated 1:1 from the original Postgres policies).
 */
import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import metaJson from "../schema/meta.json";
import { pool, q, tx } from "./db";
import { ColType, DbError, decodeValue, encodeFilterValue, encodeValue, mapMysqlError, nowMysql } from "./codec";
import type { DbRequest, DbResponse, Filter } from "../../shared/supabase-core";
import { parseInList } from "../../shared/supabase-core";
import { runHooks } from "./hooks";

// ----------------------------------------------------------------------------
// Metadata
// ----------------------------------------------------------------------------
type ColMeta = { type: ColType; nullable: boolean; default: null | { kind: string; value?: any } };
type Policy = { name: string; cmd: string; roles: string[]; using: string | null; check: string | null };
type Fk = { name: string; columns: string[]; refTable: string; refColumns: string[] };
export type TableMeta = {
  columns: Record<string, ColMeta>;
  pk: string[];
  unique: string[][];
  fks: Fk[];
  policies: Policy[];
};
type ViewMeta = { sql: string; columns: Record<string, ColType> };

export const meta = metaJson as unknown as {
  tables: Record<string, TableMeta>;
  views: Record<string, ViewMeta>;
  storagePolicies: Policy[];
};

// ----------------------------------------------------------------------------
// Request context
// ----------------------------------------------------------------------------
export type Ctx = {
  uid: string | null;
  email?: string | null;
  service: boolean;
  roles?: Set<string>;
  trainerId?: string | null;
  conn?: PoolConnection | null;
};

export const serviceCtx = (): Ctx => ({ uid: null, service: true });
export const anonCtx = (): Ctx => ({ uid: null, service: false });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadCtxRoles(ctx: Ctx) {
  if (ctx.roles) return;
  ctx.roles = new Set();
  ctx.trainerId = null;
  if (!ctx.uid) return;
  const c = ctx.conn ?? pool;
  const roles = await q<{ role: string }>(c, "SELECT role FROM user_roles WHERE user_id = ?", [ctx.uid]);
  roles.forEach((r) => ctx.roles!.add(r.role));
  const tr = await q<{ id: string }>(c, "SELECT id FROM trainers WHERE user_id = ? LIMIT 1", [ctx.uid]);
  ctx.trainerId = tr[0]?.id ?? null;
}

export function hasRole(ctx: Ctx, role: string) {
  return !!ctx.roles?.has(role);
}

function lit(v: string | null | undefined) {
  if (!v) return "NULL";
  if (!UUID_RE.test(v)) throw new DbError("invalid uuid in context", "22P02");
  return `'${v}'`;
}

function substitute(ctx: Ctx, expr: string): string {
  return expr
    .replace(/@uid/g, lit(ctx.uid))
    .replace(/@trainer_id/g, lit(ctx.trainerId ?? null))
    .replace(/@now/g, "UTC_TIMESTAMP(6)")
    .replace(/@role_(\w+)/g, (_m, r) => (hasRole(ctx, r) ? "1" : "0"));
}

function applicable(ctx: Ctx, policies: Policy[], cmd: string) {
  const role = ctx.uid ? "authenticated" : "anon";
  return policies.filter(
    (p) => (p.cmd === cmd || p.cmd === "ALL") && (p.roles.includes("public") || p.roles.includes(role)),
  );
}

/** WHERE fragment for rows visible/targetable for cmd (USING clause). */
export function usingSql(ctx: Ctx, policies: Policy[], cmd: string): string {
  if (ctx.service) return "1=1";
  const ps = applicable(ctx, policies, cmd).filter((p) => p.using);
  if (!ps.length) return "1=0";
  return "(" + ps.map((p) => `(${substitute(ctx, p.using!)})`).join(" OR ") + ")";
}

/** WHERE fragment new rows must satisfy (WITH CHECK, falling back to USING). */
export function checkSql(ctx: Ctx, policies: Policy[], cmd: string): string {
  if (ctx.service) return "1=1";
  const ps = applicable(ctx, policies, cmd);
  const exprs = ps.map((p) => p.check ?? (p.cmd === "ALL" || cmd === "UPDATE" ? p.using : null)).filter(Boolean) as string[];
  if (!exprs.length) return "1=0";
  return "(" + exprs.map((e) => `(${substitute(ctx, e)})`).join(" OR ") + ")";
}

// ----------------------------------------------------------------------------
// Select parsing
// ----------------------------------------------------------------------------
type SelNode =
  | { kind: "star" }
  | { kind: "col"; name: string; alias: string }
  | { kind: "count"; alias: string }
  | { kind: "embed"; rel: string; alias: string; hint: string | null; inner: boolean; children: SelNode[] };

export function parseSelect(src: string | null | undefined): SelNode[] {
  const s = (src ?? "*").replace(/\s+/g, "");
  let i = 0;
  function parseList(): SelNode[] {
    const out: SelNode[] = [];
    while (i < s.length && s[i] !== ")") {
      out.push(parseItem());
      if (s[i] === ",") i++;
    }
    return out;
  }
  function ident() {
    const m = /^[A-Za-z0-9_!*.\->]+/.exec(s.slice(i));
    if (!m) throw new DbError(`failed to parse select parameter (${src})`, "PGRST100");
    i += m[0].length;
    return m[0];
  }
  function parseItem(): SelNode {
    let alias: string | null = null;
    let name = ident();
    if (s[i] === ":" && s[i + 1] !== ":") {
      alias = name;
      i++;
      name = ident();
    }
    // strip casts like col::text
    if (s.slice(i, i + 2) === "::") {
      i += 2;
      ident();
    }
    if (s[i] === "(") {
      i++;
      const children = parseList();
      if (s[i] !== ")") throw new DbError(`failed to parse select parameter (${src})`, "PGRST100");
      i++;
      const parts = name.split("!");
      const rel = parts[0];
      let hint: string | null = null;
      let inner = false;
      for (const p of parts.slice(1)) {
        if (p === "inner") inner = true;
        else if (p === "left") inner = false;
        else hint = p;
      }
      return { kind: "embed", rel, alias: alias ?? rel, hint, inner, children };
    }
    if (name === "*") return { kind: "star" };
    if (name === "count" ) return { kind: "count", alias: alias ?? "count" };
    return { kind: "col", name, alias: alias ?? name };
  }
  const list = parseList();
  return list.length ? list : [{ kind: "star" }];
}

// ----------------------------------------------------------------------------
// Sources (tables + views)
// ----------------------------------------------------------------------------
type Source = { name: string; from: string; columns: Record<string, ColType>; policies: Policy[] | null; table?: TableMeta };

function source(ctx: Ctx, name: string): Source {
  const t = meta.tables[name];
  if (t) {
    const cols: Record<string, ColType> = {};
    for (const [k, v] of Object.entries(t.columns)) cols[k] = v.type;
    return { name, from: `\`${name}\` AS \`${name}\``, columns: cols, policies: t.policies, table: t };
  }
  const v = meta.views[name];
  if (v) return { name, from: `(${substitute(ctx, v.sql)}) AS \`${name}\``, columns: v.columns, policies: null };
  throw new DbError(`relation "public.${name}" does not exist`, "42P01", 404);
}

function selectUsing(ctx: Ctx, src: Source) {
  return src.policies ? usingSql(ctx, src.policies, "SELECT") : "1=1";
}

function colRef(src: Source, col: string) {
  if (!(col in src.columns)) throw new DbError(`column ${src.name}.${col} does not exist`, "42703");
  return `\`${src.name}\`.\`${col}\``;
}

// ----------------------------------------------------------------------------
// Filters
// ----------------------------------------------------------------------------
function opSql(src: Source, col: string, op: string, val: unknown, params: unknown[]): string {
  // json path access like data->>key is not used by the app; reject unknown cols loudly
  const ref = colRef(src, col);
  const type = src.columns[col];
  const enc = (v: unknown) => encodeFilterValue(type, v);
  switch (op) {
    case "eq":
      if (val === null) return `${ref} IS NULL`;
      params.push(enc(val));
      return `${ref} = ?`;
    case "neq":
      if (val === null) return `${ref} IS NOT NULL`;
      params.push(enc(val));
      return `${ref} <> ?`;
    case "gt":
      params.push(enc(val));
      return `${ref} > ?`;
    case "gte":
      params.push(enc(val));
      return `${ref} >= ?`;
    case "lt":
      params.push(enc(val));
      return `${ref} < ?`;
    case "lte":
      params.push(enc(val));
      return `${ref} <= ?`;
    case "like":
      params.push(String(val).replace(/\*/g, "%"));
      return `${ref} LIKE ?`;
    case "ilike":
      params.push(String(val).replace(/\*/g, "%").toLowerCase());
      return `LOWER(${ref}) LIKE ?`;
    case "is": {
      const v = val === null || val === "null" ? null : val === true || val === "true" ? true : val === false || val === "false" ? false : val;
      if (v === null) return `${ref} IS NULL`;
      if (v === true) return `${ref} = 1`;
      if (v === false) return `${ref} = 0`;
      throw new DbError(`invalid value for is: ${val}`, "22P02");
    }
    case "in": {
      const arr = parseInList(val);
      if (!arr.length) return "1=0";
      const hasNull = arr.some((x) => x === null || x === "null");
      const vals = arr.filter((x) => !(x === null || x === "null"));
      const parts: string[] = [];
      if (vals.length) {
        parts.push(`${ref} IN (${vals.map(() => "?").join(",")})`);
        vals.forEach((x) => params.push(enc(x)));
      }
      if (hasNull) parts.push(`${ref} IS NULL`);
      return parts.length === 1 ? parts[0] : `(${parts.join(" OR ")})`;
    }
    case "cs": {
      // array contains
      const arr = Array.isArray(val) ? val : parseInList(String(val).replace(/^\{|\}$/g, "(").replace(/\($/, ")"));
      if (!arr.length) return "1=1";
      return "(" + arr.map((x) => { params.push(JSON.stringify(x)); return `JSON_CONTAINS(${ref}, ?)`; }).join(" AND ") + ")";
    }
    case "ov": {
      const arr = Array.isArray(val) ? val : parseInList(val);
      if (!arr.length) return "1=0";
      return "(" + arr.map((x) => { params.push(JSON.stringify(x)); return `JSON_CONTAINS(${ref}, ?)`; }).join(" OR ") + ")";
    }
    default:
      throw new DbError(`unsupported filter operator: ${op}`, "PGRST100");
  }
}

/** Parse PostgREST logic tree strings: "a.eq.1,b.is.null,and(c.gt.2,d.lt.3)" */
function orSql(src: Source, expr: string, params: unknown[], joiner = "OR"): string {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  let quote = false;
  for (const ch of expr) {
    if (ch === '"') quote = !quote;
    if (!quote) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        items.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur) items.push(cur);
  const parts = items.map((raw) => {
    const it = raw.trim();
    const m = /^(not\.)?(and|or)\((.*)\)$/.exec(it);
    if (m) {
      const inner = orSql(src, m[3], params, m[2].toUpperCase());
      return m[1] ? `NOT ${inner}` : inner;
    }
    const firstDot = it.indexOf(".");
    const col = it.slice(0, firstDot);
    let rest = it.slice(firstDot + 1);
    let neg = false;
    if (rest.startsWith("not.")) {
      neg = true;
      rest = rest.slice(4);
    }
    const dot = rest.indexOf(".");
    const op = rest.slice(0, dot);
    let val: unknown = rest.slice(dot + 1);
    if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (op === "in") val = parseInList(val);
    if (op === "eq" && val === "null") val = null;
    const s = opSql(src, col, op, val, params);
    return neg ? `NOT (${s})` : s;
  });
  return "(" + parts.join(` ${joiner} `) + ")";
}

function filtersSql(src: Source, filters: Filter[] | undefined, params: unknown[]): string[] {
  const out: string[] = [];
  for (const f of filters ?? []) {
    if (f.kind === "or") out.push(orSql(src, f.expr, params));
    else {
      if (f.col.includes(".")) throw new DbError("filters on embedded resources are not supported", "PGRST100");
      const s = opSql(src, f.col, f.op, f.val, params);
      out.push(f.neg ? `NOT (${s})` : s);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Relationships
// ----------------------------------------------------------------------------
type Rel =
  | { kind: "m2o"; fk: Fk; local: string; remote: string } // base.local -> rel.remote, object
  | { kind: "o2m"; fk: Fk; local: string; remote: string; unique: boolean }; // rel.remote -> base.local

function resolveRel(base: string, rel: string, hint: string | null): Rel {
  const bt = meta.tables[base];
  const rt = meta.tables[rel];
  if (!bt || !rt) throw new DbError(`Could not find a relationship between '${base}' and '${rel}'`, "PGRST200");
  const matchHint = (fk: Fk) => !hint || fk.name === hint || fk.columns.includes(hint);
  const m2o = bt.fks.filter((f) => f.refTable === rel && matchHint(f));
  const o2m = rt.fks.filter((f) => f.refTable === base && matchHint(f));
  if (m2o.length + o2m.length > 1 && !hint) {
    throw new DbError(`Could not embed because more than one relationship was found for '${base}' and '${rel}'`, "PGRST201", 300);
  }
  if (m2o.length) return { kind: "m2o", fk: m2o[0], local: m2o[0].columns[0], remote: m2o[0].refColumns[0] };
  if (o2m.length) {
    const col = o2m[0].columns[0];
    const unique = rt.unique.some((u) => u.length === 1 && u[0] === col) || (rt.pk.length === 1 && rt.pk[0] === col);
    return { kind: "o2m", fk: o2m[0], local: o2m[0].refColumns[0], remote: col, unique };
  }
  throw new DbError(`Could not find a relationship between '${base}' and '${rel}' in the schema cache`, "PGRST200", 400);
}

// ----------------------------------------------------------------------------
// Row helpers
// ----------------------------------------------------------------------------
function decodeRow(src: Source, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = k in src.columns ? decodeValue(src.columns[k], v) : v;
  return out;
}

async function embedInto(ctx: Ctx, conn: any, baseName: string, rows: Record<string, any>[], nodes: SelNode[]) {
  for (const n of nodes) {
    if (n.kind !== "embed") continue;
    const rel = resolveRel(baseName, n.rel, n.hint);
    const rsrc = source(ctx, n.rel);
    const key = rel.local;
    const values = [...new Set(rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined))];
    let related: Record<string, any>[] = [];
    if (values.length) {
      const params: unknown[] = [];
      const where = [selectUsing(ctx, rsrc), `${colRef(rsrc, rel.remote)} IN (${values.map(() => "?").join(",")})`];
      values.forEach((v) => params.push(encodeFilterValue(rsrc.columns[rel.remote], v)));
      const raw = await q(conn, `SELECT \`${n.rel}\`.* FROM ${rsrc.from} WHERE ${where.join(" AND ")}`, params);
      related = raw.map((r) => decodeRow(rsrc, r));
      await embedInto(ctx, conn, n.rel, related, n.children);
    }
    const project = (r: Record<string, any>) => projectRow(rsrc, r, n.children);
    if (rel.kind === "m2o" || (rel.kind === "o2m" && rel.unique)) {
      const map = new Map(related.map((r) => [r[rel.remote], r]));
      rows.forEach((r) => {
        const hit = map.get(r[key]);
        r[`__embed_${n.alias}`] = hit ? project(hit) : null;
      });
    } else {
      const groups = new Map<unknown, any[]>();
      related.forEach((r) => {
        const g = groups.get(r[rel.remote]) ?? [];
        g.push(r);
        groups.set(r[rel.remote], g);
      });
      rows.forEach((r) => {
        r[`__embed_${n.alias}`] = (groups.get(r[key]) ?? []).map(project);
      });
    }
  }
}

function projectRow(src: Source, row: Record<string, any>, nodes: SelNode[]) {
  const out: Record<string, unknown> = {};
  for (const n of nodes) {
    if (n.kind === "star") {
      for (const c of Object.keys(src.columns)) out[c] = row[c];
    } else if (n.kind === "col") {
      if (!(n.name in src.columns)) throw new DbError(`column ${src.name}.${n.name} does not exist`, "42703");
      out[n.alias] = row[n.name];
    } else if (n.kind === "embed") {
      out[n.alias] = row[`__embed_${n.alias}`];
    }
  }
  return out;
}

function innerSql(ctx: Ctx, base: Source, nodes: SelNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.kind !== "embed" || !n.inner) continue;
    const rel = resolveRel(base.name, n.rel, n.hint);
    const r = source(ctx, n.rel);
    out.push(
      `EXISTS (SELECT 1 FROM ${r.from} WHERE ${colRef(r, rel.remote)} = ${colRef(base, rel.local)} AND ${selectUsing(ctx, r)})`,
    );
  }
  return out;
}

function orderSql(src: Source, order: DbRequest["order"]) {
  if (!order?.length) return "";
  return (
    " ORDER BY " +
    order
      .map((o) => {
        const ref = colRef(src, o.col);
        const nullsFirst = o.nullsFirst ?? !o.asc; // Postgres default: NULLS LAST for ASC, FIRST for DESC
        return `(${ref} IS NULL) ${nullsFirst ? "DESC" : "ASC"}, ${ref} ${o.asc ? "ASC" : "DESC"}`;
      })
      .join(", ")
  );
}

// ----------------------------------------------------------------------------
// SELECT
// ----------------------------------------------------------------------------
async function doSelect(ctx: Ctx, req: DbRequest): Promise<DbResponse> {
  const conn = ctx.conn ?? pool;
  const src = source(ctx, req.table);
  const nodes = parseSelect(req.select);
  const params: unknown[] = [];
  const where = [selectUsing(ctx, src), ...filtersSql(src, req.filters, params), ...innerSql(ctx, src, nodes)];
  const whereSql = where.join(" AND ");
  let count: number | null = null;
  if (req.count) {
    const r = await q<{ c: number }>(conn, `SELECT COUNT(*) AS c FROM ${src.from} WHERE ${whereSql}`, params);
    count = Number(r[0].c);
  }
  if (req.head) return { data: null, error: null, count, status: 200 };
  let sql = `SELECT \`${src.name}\`.* FROM ${src.from} WHERE ${whereSql}${orderSql(src, req.order)}`;
  if (req.limit != null) sql += ` LIMIT ${Math.max(0, Math.trunc(req.limit))}`;
  if (req.offset != null) sql += `${req.limit == null ? " LIMIT 18446744073709551615" : ""} OFFSET ${Math.max(0, Math.trunc(req.offset))}`;
  const raw = await q(conn, sql, params);
  const rows = raw.map((r) => decodeRow(src, r));
  await embedInto(ctx, conn, src.name, rows, nodes);
  const data = rows.map((r) => projectRow(src, r, nodes));
  return finish(req, data, count);
}

function finish(req: DbRequest, data: any[], count: number | null, status = 200): DbResponse {
  if (req.single) {
    if (data.length === 1) return { data: data[0], error: null, count, status };
    if (data.length === 0 && req.single === "maybe") return { data: null, error: null, count, status };
    return {
      data: null,
      error: {
        message: "JSON object requested, multiple (or no) rows returned",
        code: "PGRST116",
        details: `The result contains ${data.length} rows`,
        hint: null,
      },
      count,
      status: 406,
    };
  }
  return { data, error: null, count, status };
}

// ----------------------------------------------------------------------------
// Writes
// ----------------------------------------------------------------------------
function tableOf(name: string): TableMeta {
  const t = meta.tables[name];
  if (!t) throw new DbError(`relation "public.${name}" does not exist (or is read-only)`, "42P01", 404);
  return t;
}

export async function nextSequence(conn: any, name: string): Promise<number> {
  await q(conn, "INSERT INTO app_sequences (name, value) VALUES (?, 1) ON DUPLICATE KEY UPDATE value = LAST_INSERT_ID(value + 1)", [name]);
  const r = await q<{ v: number }>(conn, "SELECT value AS v FROM app_sequences WHERE name = ?", [name]);
  return Number(r[0].v);
}

async function applyDefaults(conn: any, t: TableMeta, row: Record<string, unknown>, defaultToNull = true) {
  for (const [c, m] of Object.entries(t.columns)) {
    if (row[c] !== undefined) continue;
    if (!m.default) {
      if (defaultToNull && m.nullable) row[c] = null;
      continue;
    }
    if (m.default.kind === "uuid") row[c] = randomUUID();
    else if (m.default.kind === "now") row[c] = new Date().toISOString();
    else if (m.default.kind === "literal") row[c] = m.default.value;
    else if (m.default.kind === "sequence") row[c] = await nextSequence(conn, m.default.value);
  }
}

function encodeRow(t: TableMeta, tableName: string, row: Record<string, unknown>) {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(row)) {
    const m = t.columns[k];
    if (!m) throw new DbError(`Could not find the '${k}' column of '${tableName}' in the schema cache`, "PGRST204");
    if (v === undefined) continue;
    cols.push(`\`${k}\``);
    vals.push(encodeValue(m.type, v));
  }
  return { cols, vals };
}

function pkWhere(t: TableMeta, tableName: string, row: Record<string, unknown>, params: unknown[]) {
  return t.pk
    .map((k) => {
      params.push(encodeValue(t.columns[k].type, row[k]));
      return `\`${tableName}\`.\`${k}\` = ?`;
    })
    .join(" AND ");
}

async function fetchRowByPk(conn: any, ctx: Ctx, tableName: string, row: Record<string, unknown>, extraWhere = "1=1") {
  const t = tableOf(tableName);
  const src = source(ctx, tableName);
  const params: unknown[] = [];
  const r = await q(conn, `SELECT \`${tableName}\`.* FROM ${src.from} WHERE ${pkWhere(t, tableName, row, params)} AND ${extraWhere}`, params);
  return r[0] ? decodeRow(src, r[0]) : null;
}

const rlsError = (table: string) =>
  new DbError(`new row violates row-level security policy for table "${table}"`, "42501", 403);

async function insertOne(conn: PoolConnection, ctx: Ctx, tableName: string, input: Record<string, unknown>, defaultToNull = true) {
  const t = tableOf(tableName);
  const row = { ...input };
  await applyDefaults(conn, t, row, defaultToNull);
  const hctx = { ...ctx, conn };
  await runHooks("beforeInsert", tableName, hctx, row, null);
  const { cols, vals } = encodeRow(t, tableName, row);
  await q(conn, `INSERT INTO \`${tableName}\` (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, vals);
  if (!ctx.service) {
    const ok = await fetchRowByPk(conn, ctx, tableName, row, checkSql(ctx, t.policies, "INSERT"));
    if (!ok) throw rlsError(tableName);
  }
  const stored = (await fetchRowByPk(conn, { ...ctx, service: true }, tableName, row))!;
  await runHooks("afterInsert", tableName, hctx, stored, null);
  return stored;
}

async function updateRow(conn: PoolConnection, ctx: Ctx, tableName: string, old: Record<string, unknown>, patch: Record<string, unknown>) {
  const t = tableOf(tableName);
  const next = { ...old, ...patch };
  const hctx = { ...ctx, conn };
  await runHooks("beforeUpdate", tableName, hctx, next, old);
  const changed: Record<string, unknown> = {};
  for (const k of Object.keys(next)) if (k in t.columns && (k in patch || next[k] !== old[k])) changed[k] = next[k];
  const { cols, vals } = encodeRow(t, tableName, changed);
  if (cols.length) {
    const params: unknown[] = [...vals];
    const where = pkWhere(t, tableName, old, params);
    await q(conn, `UPDATE \`${tableName}\` SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE ${where}`, params);
  }
  if (!ctx.service) {
    const ok = await fetchRowByPk(conn, ctx, tableName, next, checkSql(ctx, t.policies, "UPDATE"));
    if (!ok) throw rlsError(tableName);
  }
  const stored = (await fetchRowByPk(conn, { ...ctx, service: true }, tableName, next))!;
  await runHooks("afterUpdate", tableName, hctx, stored, old);
  return stored;
}

async function targetRows(conn: any, ctx: Ctx, tableName: string, cmd: string, filters: Filter[] | undefined, order?: DbRequest["order"], limit?: number | null) {
  const t = tableOf(tableName);
  const src = source(ctx, tableName);
  const params: unknown[] = [];
  const where = [usingSql(ctx, t.policies, cmd), ...filtersSql(src, filters, params)];
  let sql = `SELECT \`${tableName}\`.* FROM ${src.from} WHERE ${where.join(" AND ")}${orderSql(src, order)}`;
  if (limit != null) sql += ` LIMIT ${Math.trunc(limit)}`;
  sql += " FOR UPDATE";
  const raw = await q(conn, sql, params);
  return raw.map((r) => decodeRow(src, r));
}

async function representation(conn: any, ctx: Ctx, req: DbRequest, stored: Record<string, unknown>[]) {
  if (req.select === null || req.select === undefined) return null;
  const src = source(ctx, req.table);
  const nodes = parseSelect(req.select);
  // Returned rows must be visible to the caller (Postgres applies SELECT policies to RETURNING).
  let visible = stored;
  if (!ctx.service && stored.length) {
    const t = tableOf(req.table);
    const out: Record<string, unknown>[] = [];
    for (const r of stored) {
      const v = await fetchRowByPk(conn, ctx, req.table, r, usingSql(ctx, t.policies, "SELECT"));
      if (!v) throw rlsError(req.table);
      out.push(v);
    }
    visible = out;
  }
  const rows = visible.map((r) => ({ ...r }));
  await embedInto(ctx, conn, req.table, rows, nodes);
  return rows.map((r) => projectRow(src, r, nodes));
}

async function doWrite(ctx: Ctx, req: DbRequest): Promise<DbResponse> {
  const t = tableOf(req.table);
  return tx(async (conn) => {
    const c = { ...ctx, conn };
    let stored: Record<string, unknown>[] = [];
    if (req.op === "insert" || req.op === "upsert") {
      const values = Array.isArray(req.values) ? req.values : [req.values ?? {}];
      const conflict = req.op === "upsert" ? (req.onConflict ? req.onConflict.split(",").map((s) => s.trim()) : t.pk) : null;
      for (const v of values) {
        if (conflict && conflict.every((k) => v[k] !== undefined && v[k] !== null)) {
          const params: unknown[] = [];
          const where = conflict.map((k) => {
            params.push(encodeValue(t.columns[k].type, v[k]));
            return `\`${k}\` = ?`;
          });
          const existing = await q(conn, `SELECT * FROM \`${req.table}\` WHERE ${where.join(" AND ")} FOR UPDATE`, params);
          if (existing.length) {
            if (req.ignoreDuplicates) continue;
            const old = decodeRow(source(c, req.table), existing[0]);
            if (!ctx.service) {
              const allowed = await fetchRowByPk(conn, c, req.table, old, usingSql(c, t.policies, "UPDATE"));
              if (!allowed) throw rlsError(req.table);
            }
            stored.push(await updateRow(conn, c, req.table, old, v));
            continue;
          }
        }
        stored.push(await insertOne(conn, c, req.table, v, req.defaultToNull !== false));
      }
      const data = await representation(conn, c, req, stored);
      return finishWrite(req, data, stored.length, 201);
    }
    if (req.op === "update") {
      const rows = await targetRows(conn, c, req.table, "UPDATE", req.filters, req.order, req.limit);
      for (const old of rows) stored.push(await updateRow(conn, c, req.table, old, (req.values ?? {}) as Record<string, unknown>));
      const data = await representation(conn, c, req, stored);
      return finishWrite(req, data, stored.length, 200);
    }
    if (req.op === "delete") {
      const rows = await targetRows(conn, c, req.table, "DELETE", req.filters, req.order, req.limit);
      const data = await representation(conn, { ...c, service: true }, req, rows);
      for (const old of rows) {
        await runHooks("beforeDelete", req.table, c, old, old);
        const params: unknown[] = [];
        await q(conn, `DELETE FROM \`${req.table}\` WHERE ${pkWhere(t, req.table, old, params)}`, params);
      }
      return finishWrite(req, data, rows.length, 200);
    }
    throw new DbError(`unsupported operation ${req.op}`, "PGRST100");
  }, ctx.conn ?? null);
}

function finishWrite(req: DbRequest, data: any[] | null, n: number, status: number): DbResponse {
  const count = req.count ? n : null;
  if (data === null) return { data: null, error: null, count, status: status === 201 ? 201 : 204 };
  return finish(req, data, count, status);
}

// ----------------------------------------------------------------------------
// Public entry point
// ----------------------------------------------------------------------------
export async function execute(ctx: Ctx, req: DbRequest): Promise<DbResponse> {
  try {
    await loadCtxRoles(ctx);
    if (req.op === "select") return await doSelect(ctx, req);
    return await doWrite(ctx, req);
  } catch (e: any) {
    const err = mapMysqlError(e);
    return { data: null, error: err.toJSON(), count: null, status: err.status };
  }
}

/** Convenience helpers for server code. */
export function nowIso() {
  return new Date().toISOString();
}
export { nowMysql };
