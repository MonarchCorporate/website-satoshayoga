// Creates the MySQL schema on first start (all statements are CREATE TABLE IF NOT EXISTS).
import schemaSql from "../schema/schema.sql";
import { pool } from "./db";

export async function ensureSchema() {
  const statements = (schemaSql as unknown as string)
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const conn = await pool.getConnection();
  try {
    for (const s of statements) await conn.query(s);
  } finally {
    conn.release();
  }
  console.log(`[migrate] schema ensured (${statements.length} statements)`);
}
