// Conversion between the JSON values the app uses (PostgREST semantics) and MySQL values.

export type ColType =
  | "uuid" | "text" | "enum" | "timestamptz" | "int" | "numeric" | "bool"
  | "json" | "uuid[]" | "text[]" | "date" | "time";

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?)?\s*(Z|z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Parse a timestamp string (any ISO-ish format, optional offset) into a MySQL UTC DATETIME(6) string. */
export function toMysqlDatetime(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return dateToMysql(v, 0);
  const s = String(v).trim();
  if (s.toLowerCase() === "now()" || s.toLowerCase() === "now") return dateToMysql(new Date(), 0);
  const m = ISO_RE.exec(s);
  if (!m) {
    const d = new Date(s);
    if (isNaN(d.getTime())) throw new DbError(`invalid input syntax for type timestamp with time zone: "${s}"`, "22007");
    return dateToMysql(d, 0);
  }
  const [, y, mo, d, h = "00", mi = "00", sec = "00", frac = "", tz] = m;
  let offsetMin = 0;
  if (tz && tz.toUpperCase() !== "Z") {
    const sign = tz[0] === "-" ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    offsetMin = sign * (parseInt(digits.slice(0, 2), 10) * 60 + (digits.length > 2 ? parseInt(digits.slice(2, 4), 10) : 0));
  }
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec) - offsetMin * 60000;
  const micro = (frac.slice(1) + "000000").slice(0, 6);
  return dateToMysql(new Date(ms), 0, micro);
}

function pad(n: number, w = 2) {
  return String(n).padStart(w, "0");
}

function dateToMysql(d: Date, _o: number, micro?: string) {
  const us = micro ?? pad(d.getUTCMilliseconds(), 3) + "000";
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${us}`
  );
}

export function nowMysql() {
  return dateToMysql(new Date(), 0);
}

/** MySQL DATETIME string (UTC) -> PostgREST style "2026-05-02T06:58:55.554577+00:00" */
export function fromMysqlDatetime(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) v = dateToMysql(v, 0);
  let s = String(v);
  let [date, time = "00:00:00"] = s.split(" ");
  let [hms, frac = ""] = time.split(".");
  frac = frac.replace(/0+$/, "");
  return `${date}T${hms}${frac ? "." + frac : ""}+00:00`;
}

export class DbError extends Error {
  constructor(message: string, public code = "P0001", public status = 400, public details: string | null = null, public hint: string | null = null) {
    super(message);
  }
  toJSON() {
    return { message: this.message, code: this.code, details: this.details, hint: this.hint };
  }
}

export function encodeValue(type: ColType, v: unknown): unknown {
  if (v === undefined) return undefined;
  if (v === null) return null;
  switch (type) {
    case "uuid":
    case "text":
    case "enum":
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    case "timestamptz":
      return toMysqlDatetime(v);
    case "date": {
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      const dt = toMysqlDatetime(s);
      return dt ? dt.slice(0, 10) : null;
    }
    case "time":
      return String(v);
    case "int": {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new DbError(`invalid input syntax for type integer: "${v}"`, "22P02");
      return Math.trunc(n);
    }
    case "numeric": {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isFinite(n)) throw new DbError(`invalid input syntax for type numeric: "${v}"`, "22P02");
      return String(v);
    }
    case "bool":
      if (typeof v === "string") return v === "true" || v === "t" || v === "1" ? 1 : 0;
      return v ? 1 : 0;
    case "json":
      return JSON.stringify(v);
    case "uuid[]":
    case "text[]": {
      let arr = v;
      if (typeof v === "string") {
        const s = v.trim();
        arr = s.startsWith("{") ? s.slice(1, -1).split(",").filter(Boolean).map((x) => x.replace(/^"|"$/g, "")) : JSON.parse(s);
      }
      return JSON.stringify(arr);
    }
  }
}

export function decodeValue(type: ColType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "timestamptz":
      return fromMysqlDatetime(v);
    case "date":
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    case "time":
      return String(v);
    case "int":
      return Number(v);
    case "numeric":
      return Number(v);
    case "bool":
      return v === true || v === 1 || v === "1" || (Buffer.isBuffer(v) && v[0] === 1);
    case "json":
    case "uuid[]":
    case "text[]":
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      if (Buffer.isBuffer(v)) return JSON.parse(v.toString("utf8"));
      return v;
    default:
      return Buffer.isBuffer(v) ? v.toString("utf8") : v;
  }
}

/** Encode a filter value for comparison. */
export function encodeFilterValue(type: ColType | undefined, v: unknown): unknown {
  if (type === undefined) return v;
  if (type === "bool") {
    if (v === "true" || v === true) return 1;
    if (v === "false" || v === false) return 0;
  }
  if (type === "json" || type === "uuid[]" || type === "text[]") return typeof v === "string" ? v : JSON.stringify(v);
  return encodeValue(type, v);
}

export function mapMysqlError(e: any): DbError {
  if (e instanceof DbError) return e;
  const msg: string = e?.sqlMessage || e?.message || String(e);
  switch (e?.errno) {
    case 1062:
      return new DbError(`duplicate key value violates unique constraint: ${msg}`, "23505", 409);
    case 1451:
    case 1452:
      return new DbError(`violates foreign key constraint: ${msg}`, "23503", 409);
    case 1048:
    case 1364:
      return new DbError(`null value violates not-null constraint: ${msg}`, "23502", 400);
    case 1406:
      return new DbError(`value too long: ${msg}`, "22001", 400);
    case 1292:
    case 1366:
      return new DbError(`invalid input syntax: ${msg}`, "22P02", 400);
  }
  console.error("[db] unexpected error", e);
  return new DbError(msg, "XX000", 500);
}
