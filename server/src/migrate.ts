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
  await linkAdminVoucherRedemptions();
}

/**
 * Data fix: redemptions recorded by the backoffice before this was handled server-side
 * have no booking link. Link each one to the voucher booking of the same customer that
 * was created at (practically) the same moment. Idempotent.
 */
async function linkAdminVoucherRedemptions() {
  const [reds] = (await pool.query(
    "SELECT id, voucher_id, user_id, redeemed_at FROM voucher_redemptions WHERE booking_id IS NULL AND order_id IS NULL ORDER BY redeemed_at",
  )) as any;
  let linked = 0;
  for (const r of reds as any[]) {
    // nearest admin voucher booking of the same customer that has no redemption yet
    const [cand] = (await pool.query(
      `SELECT b.id FROM bookings b
        WHERE b.voucher_id = ? AND b.user_id = ? AND b.payment_method = 'admin_grant'
          AND ABS(TIMESTAMPDIFF(MICROSECOND, b.created_at, ?)) <= 120000000
          AND NOT EXISTS (SELECT 1 FROM voucher_redemptions x WHERE x.booking_id = b.id)
        ORDER BY ABS(TIMESTAMPDIFF(MICROSECOND, b.created_at, ?)) LIMIT 1`,
      [r.voucher_id, r.user_id, r.redeemed_at, r.redeemed_at],
    )) as any;
    if (!cand[0]) continue;
    await pool.query("UPDATE voucher_redemptions SET booking_id = ? WHERE id = ? AND booking_id IS NULL", [cand[0].id, r.id]);
    linked++;
  }
  if (linked) console.log(`[migrate] linked ${linked} voucher redemption(s) to their bookings`);
}
