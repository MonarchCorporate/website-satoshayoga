import mysql from "mysql2/promise";
import { config } from "./config";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  connectionLimit: 10,
  waitForConnections: true,
  timezone: "Z",
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  charset: "utf8mb4",
  multipleStatements: false,
});

pool.on("connection", (conn: any) => {
  conn.query("SET time_zone = '+00:00'");
});

export type Conn = mysql.PoolConnection | mysql.Pool;

export async function q<T = any>(conn: Conn, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await conn.query(sql, params);
  return rows as T[];
}

/** Run fn inside a transaction. Nested calls with an existing connection reuse it. */
export async function tx<T>(fn: (c: mysql.PoolConnection) => Promise<T>, existing?: mysql.PoolConnection | null): Promise<T> {
  if (existing) return fn(existing);
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    try {
      await c.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    c.release();
  }
}
