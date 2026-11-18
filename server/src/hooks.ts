// Ports of the Postgres triggers of the original database.
import { q } from "./db";
import { DbError } from "./codec";
import type { Ctx } from "./engine";

type Row = Record<string, any>;
type Hook = (ctx: Ctx, row: Row, old: Row | null) => Promise<void> | void;
type Phase = "beforeInsert" | "afterInsert" | "beforeUpdate" | "afterUpdate" | "beforeDelete";

const hooks: Record<string, Partial<Record<Phase, Hook[]>>> = {};
function on(table: string, phase: Phase, fn: Hook) {
  const t = (hooks[table] ??= {});
  (t[phase] ??= []).push(fn);
}

export async function runHooks(phase: Phase, table: string, ctx: Ctx, row: Row, old: Row | null) {
  for (const fn of hooks[table]?.[phase] ?? []) await fn(ctx, row, old);
}

const isPriv = (ctx: Ctx) => !!ctx.uid && (ctx.roles?.has("admin") || ctx.roles?.has("staff"));

/** public.next_number(scope): yearly counter "2026-0001" */
export async function nextNumber(ctx: Ctx, scope: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const conn = ctx.conn!;
  await q(
    conn,
    "INSERT INTO number_sequences (scope, year, last_value) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE last_value = last_value + 1",
    [scope, year],
  );
  const r = await q<{ v: number }>(conn, "SELECT last_value AS v FROM number_sequences WHERE scope = ? AND year = ?", [scope, year]);
  return `${year}-${String(r[0].v).padStart(4, "0")}`;
}

// update_updated_at_column()
for (const t of [
  "courses", "bookings", "profiles", "products", "orders", "payment_settings", "email_templates",
  "company_settings", "newsletter_settings", "newsletter_campaigns", "newsletter_templates",
  "trainer_compensation_tiers", "trainer_payouts", "trainer_earnings", "vouchers", "video_courses",
  "video_lessons", "video_course_access", "video_lesson_progress", "email_settings", "email_send_log",
]) {
  on(t, "beforeUpdate", (_ctx, row) => {
    row.updated_at = new Date().toISOString();
  });
}

// assign_order_number()
on("orders", "beforeInsert", async (ctx, row) => {
  if (row.order_number == null) row.order_number = await nextNumber(ctx, "order");
});

// assign_payout_number()
on("trainer_payouts", "beforeInsert", async (ctx, row) => {
  if (row.payout_number == null) row.payout_number = await nextNumber(ctx, "trainer_payout");
});

// assign_course_no()
on("courses", "beforeInsert", async (ctx, row) => {
  if (row.course_no == null) {
    const conn = ctx.conn!;
    await q(conn, "INSERT INTO app_sequences (name, value) VALUES ('courses_course_no_seq', 1) ON DUPLICATE KEY UPDATE value = value + 1");
    const r = await q<{ v: number }>(conn, "SELECT value AS v FROM app_sequences WHERE name = 'courses_course_no_seq'");
    row.course_no = Number(r[0].v);
  }
});

// prevent_booking_sensitive_updates()
on("bookings", "beforeUpdate", (ctx, row, old) => {
  if (ctx.service || !ctx.uid) return;
  if (isPriv(ctx)) return;
  for (const k of ["user_id", "amount_paid", "status", "refunded", "voucher_id", "payment_id"]) {
    if (String(row[k] ?? "") !== String(old?.[k] ?? "")) {
      throw new DbError("Not allowed to modify protected booking fields", "P0001");
    }
  }
});

// prevent_direct_trainer_booking()
async function preventDirectTrainerBooking(ctx: Ctx, row: Row) {
  if (!row.course_id) return;
  const r = await q(ctx.conn!, "SELECT 1 FROM courses WHERE id = ? AND direct_trainer_booking = 1", [row.course_id]);
  if (r.length && !isPriv(ctx)) {
    throw new DbError("Dieser Kurs ist nur direkt bei der Trainerin/dem Trainer buchbar.", "P0001");
  }
}
on("bookings", "beforeInsert", preventDirectTrainerBooking);
on("cart_items", "beforeInsert", preventDirectTrainerBooking);

// bump_voucher_usage()
on("voucher_redemptions", "afterInsert", async (ctx, row) => {
  await q(ctx.conn!, "UPDATE vouchers SET times_used = times_used + 1 WHERE id = ?", [row.voucher_id]);
});

// Case-insensitive uniqueness of voucher codes (Postgres: UNIQUE INDEX ON lower(code))
async function uniqueVoucherCode(ctx: Ctx, row: Row, old: Row | null) {
  if (!row.code || (old && old.code === row.code)) return;
  const r = await q(ctx.conn!, "SELECT 1 FROM vouchers WHERE LOWER(code) = LOWER(?) AND id <> ?", [row.code, row.id ?? ""]);
  if (r.length) throw new DbError('duplicate key value violates unique constraint "vouchers_code_unique"', "23505", 409);
}
on("vouchers", "beforeInsert", uniqueVoucherCode);
on("vouchers", "beforeUpdate", uniqueVoucherCode);

// ---------------------------------------------------------------------------
// Waitlist (new feature, not part of the original Postgres triggers)
// ---------------------------------------------------------------------------
import { validateJoin, scheduleWaitlistCheck, markBooked } from "./waitlist";

on("waitlist_entries", "beforeInsert", validateJoin);

const HOLDS_SEAT = new Set(["confirmed", "pending_payment"]);
on("bookings", "afterInsert", async (ctx, row) => {
  if (HOLDS_SEAT.has(row.status)) await markBooked(ctx.conn!, row.course_id, row.user_id);
  scheduleWaitlistCheck(row.course_id);
});
on("bookings", "afterUpdate", async (ctx, row, old) => {
  if (row.status === old?.status && row.course_id === old?.course_id) return;
  if (HOLDS_SEAT.has(row.status)) await markBooked(ctx.conn!, row.course_id, row.user_id);
  scheduleWaitlistCheck(row.course_id);
  if (old?.course_id && old.course_id !== row.course_id) scheduleWaitlistCheck(old.course_id);
});
on("bookings", "beforeDelete", (_ctx, row) => {
  scheduleWaitlistCheck(row.course_id);
});
on("courses", "afterUpdate", (_ctx, row, old) => {
  if (Number(row.max_participants) !== Number(old?.max_participants) || row.is_cancelled !== old?.is_cancelled) {
    scheduleWaitlistCheck(row.id);
  }
});
