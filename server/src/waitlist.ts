// Waitlist for fully booked courses.
//  - customers join via the normal data API (table waitlist_entries, own rows only)
//  - when a seat becomes free, everybody still "waiting" gets an e-mail with a booking link
//    and the entry becomes "notified"; first come, first served
//  - if the course is full again before they book, "notified" entries fall back to "waiting"
//    so they are informed the next time a seat frees up
//  - booking the course marks the entry "booked"
import { q } from "./db";
import { DbError } from "./codec";
import { config } from "./config";
import { createClient } from "./supabase-server";
import { triggerCustomerEmail, formatDate, formatTime } from "../functions/_shared/customer-email";
import { EMAIL_TRIGGERS } from "../../src/lib/email-triggers";
import type { Ctx } from "./engine";

const TRIGGER = "waitlist_spot_available";

/** Seats taken – same rule as the booking pages (get_course_participant_counts): confirmed bookings. */
export async function occupiedSeats(conn: any, courseId: string): Promise<number> {
  const r = await q<{ c: number }>(
    conn,
    "SELECT COUNT(*) AS c FROM bookings WHERE course_id = ? AND status = 'confirmed'",
    [courseId],
  );
  return Number(r[0].c);
}

/** beforeInsert validation for waitlist_entries (customers only; admins/service may insert freely). */
export async function validateJoin(ctx: Ctx, row: Record<string, any>) {
  row.status = "waiting";
  row.notified_at = null;
  if (ctx.service || ctx.roles?.has("admin")) return;
  const conn = ctx.conn!;
  const c = await q<any>(
    conn,
    "SELECT id, max_participants, is_cancelled, is_visible, start_time, direct_trainer_booking FROM courses WHERE id = ?",
    [row.course_id],
  );
  const course = c[0];
  if (!course || Number(course.is_cancelled) || !Number(course.is_visible)) throw new DbError("Kurs nicht gefunden.", "P0001", 404);
  if (Number(course.direct_trainer_booking)) throw new DbError("Dieser Kurs ist nur direkt bei der Trainerin/dem Trainer buchbar.", "P0001");
  const start = await q<{ past: number }>(conn, "SELECT ? <= UTC_TIMESTAMP(6) AS past", [course.start_time]);
  if (Number(start[0].past)) throw new DbError("Der Kurs hat bereits begonnen.", "P0001");
  const own = await q(conn, "SELECT 1 FROM bookings WHERE course_id = ? AND user_id = ? AND status IN ('confirmed','pending_payment')", [row.course_id, row.user_id]);
  if (own.length) throw new DbError("Du hast diesen Kurs bereits gebucht.", "P0001");
  if ((await occupiedSeats(conn, row.course_id)) < Number(course.max_participants)) {
    throw new DbError("In diesem Kurs sind noch Plätze frei – du kannst ihn direkt buchen.", "P0001");
  }
}

// ---------------------------------------------------------------------------
// Post-commit checks (debounced per course)
// ---------------------------------------------------------------------------
const pending = new Map<string, NodeJS.Timeout>();

export function scheduleWaitlistCheck(courseId: string | null | undefined, delayMs = 1500) {
  if (!courseId) return;
  const t = pending.get(courseId);
  if (t) clearTimeout(t);
  pending.set(
    courseId,
    setTimeout(() => {
      pending.delete(courseId);
      checkCourse(courseId).catch((e) => console.error("[waitlist] check failed", courseId, e));
    }, delayMs),
  );
}

function admin() {
  return createClient(config.siteUrl, config.serviceKey);
}

export async function checkCourse(courseId: string): Promise<{ notified: number; reset: number }> {
  const db = admin();
  const { data: course } = await db
    .from("courses")
    .select("id, title, start_time, end_time, max_participants, is_cancelled")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { notified: 0, reset: 0 };
  const c = course as any;
  if (c.is_cancelled || new Date(c.start_time).getTime() <= Date.now()) return { notified: 0, reset: 0 };

  const { pool } = await import("./db");
  const free = Number(c.max_participants) - (await occupiedSeats(pool, courseId));

  if (free <= 0) {
    // Full again: people we told about a free seat go back to waiting.
    const { data } = await db.from("waitlist_entries").update({ status: "waiting" }).eq("course_id", courseId).eq("status", "notified").select("id");
    return { notified: 0, reset: (data as any[] | null)?.length ?? 0 };
  }

  const { data: waiting } = await db
    .from("waitlist_entries")
    .select("id, user_id")
    .eq("course_id", courseId)
    .eq("status", "waiting")
    .order("created_at", { ascending: true });
  let notified = 0;
  for (const w of (waiting as any[]) ?? []) {
    // mark first so a crash never sends the same mail twice
    const { data: upd } = await db
      .from("waitlist_entries")
      .update({ status: "notified", notified_at: new Date().toISOString() })
      .eq("id", w.id)
      .eq("status", "waiting")
      .select("id");
    if (!(upd as any[] | null)?.length) continue;
    await triggerCustomerEmail(db as any, {
      user_id: w.user_id,
      trigger_key: TRIGGER,
      idempotency_key: `waitlist-${w.id}-${Date.now()}`,
      data: {
        course_title: c.title ?? "",
        course_date: formatDate(c.start_time),
        course_time: `${formatTime(c.start_time)} – ${formatTime(c.end_time)}`,
        booking_url: `${config.siteUrl}/?kurs=${courseId}#yogaplan`,
      },
    });
    notified++;
  }
  if (notified) console.log(`[waitlist] course ${courseId}: ${free} free seat(s), notified ${notified}`);
  return { notified, reset: 0 };
}

/** Safety net (cron): re-check every upcoming course that has somebody on the waitlist. */
export async function checkAllCourses() {
  const { pool } = await import("./db");
  const rows = await q<{ course_id: string }>(
    pool,
    `SELECT DISTINCT w.course_id FROM waitlist_entries w JOIN courses c ON c.id = w.course_id
     WHERE w.status IN ('waiting','notified') AND c.start_time > UTC_TIMESTAMP(6) AND c.is_cancelled = 0`,
  );
  let notified = 0;
  for (const r of rows) notified += (await checkCourse(r.course_id)).notified;
  return { courses: rows.length, notified };
}

/** Booking made by a waitlisted customer -> entry "booked". */
export async function markBooked(conn: any, courseId: string, userId: string) {
  await q(conn, "UPDATE waitlist_entries SET status = 'booked', updated_at = UTC_TIMESTAMP(6) WHERE course_id = ? AND user_id = ? AND status IN ('waiting','notified')", [courseId, userId]);
}

/** Make sure the e-mail template exists so the studio can edit it in the backoffice. */
export async function ensureWaitlistTemplate() {
  const def = EMAIL_TRIGGERS.find((t) => t.trigger_key === TRIGGER);
  if (!def) return;
  const db = admin();
  const { data } = await db.from("email_templates").select("id").eq("trigger_key", TRIGGER).maybeSingle();
  if (data) return;
  const { error } = await db.from("email_templates").insert({
    name: def.display_name,
    trigger_key: TRIGGER,
    subject: def.default_subject,
    body_html: def.default_body_html,
    is_active: true,
    description: def.description,
  });
  if (error) console.error("[waitlist] could not create e-mail template", error);
  else console.log("[waitlist] e-mail template created");
}
