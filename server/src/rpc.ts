// Ports of the Postgres functions callable via supabase.rpc(...)
import { pool, q, tx } from "./db";
import { DbError, decodeValue, fromMysqlDatetime } from "./codec";
import { Ctx, loadCtxRoles, hasRole } from "./engine";
import { nextNumber } from "./hooks";
import type { DbResponse } from "../../shared/supabase-core";

type Fn = (ctx: Ctx, args: Record<string, any>) => Promise<unknown>;

const isAdmin = (c: Ctx) => c.service || hasRole(c, "admin");
const isStaffish = (c: Ctx) => c.service || hasRole(c, "admin") || hasRole(c, "staff");

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function loadVoucher(code: string) {
  const r = await q<any>(pool, "SELECT * FROM vouchers WHERE LOWER(code) = LOWER(TRIM(?)) LIMIT 1", [code]);
  if (!r[0]) return null;
  const v = r[0];
  for (const k of ["applies_to", "product_ids", "course_type_ids", "class_card_types", "video_course_ids"]) {
    v[k] = (decodeValue("json", v[k]) as any[]) ?? [];
  }
  v.is_active = !!Number(v.is_active);
  v.is_single_use = !!Number(v.is_single_use);
  return v;
}

/** Common voucher eligibility checks of validate_voucher / validate_voucher_cart. */
async function voucherPrecheck(ctx: Ctx, code: string | null | undefined) {
  if (!code || !String(code).trim()) return { error: "Bitte gib einen Code ein." };
  const v = await loadVoucher(String(code));
  if (!v) return { error: "Code ungültig." };
  if (!v.is_active) return { error: "Code ist nicht aktiv." };
  const now = Date.now();
  if (v.valid_from && now < Date.parse(fromMysqlDatetime(v.valid_from)!)) return { error: "Code ist noch nicht gültig." };
  if (v.valid_until && now > Date.parse(fromMysqlDatetime(v.valid_until)!)) return { error: "Code ist abgelaufen." };
  const used = Number(v.times_used ?? 0);
  if (v.is_single_use && used >= 1) return { error: "Code wurde bereits eingelöst." };
  if (v.max_total_uses != null && used >= Number(v.max_total_uses)) return { error: "Code wurde bereits maximal oft eingelöst." };
  if (ctx.uid && v.max_uses_per_customer != null) {
    const r = await q<{ c: number }>(pool, "SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?", [v.id, ctx.uid]);
    if (Number(r[0].c) >= Number(v.max_uses_per_customer)) return { error: "Du hast diesen Code bereits maximal oft genutzt." };
  }
  return { v };
}

const fns: Record<string, Fn> = {
  async has_role(_ctx, a) {
    const r = await q(pool, "SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?", [a._user_id, a._role]);
    return r.length > 0;
  },
  async current_trainer_id(ctx) {
    return ctx.trainerId ?? null;
  },
  async is_my_course(ctx, a) {
    if (!ctx.uid) return false;
    const r = await q(pool, "SELECT 1 FROM courses c JOIN trainers t ON t.id = c.instructor_id WHERE c.id = ? AND t.user_id = ?", [a._course_id, ctx.uid]);
    return r.length > 0;
  },
  async user_has_course_booking(_ctx, a) {
    const r = await q(pool, "SELECT 1 FROM bookings WHERE user_id = ? AND course_id = ?", [a._user_id, a._course_id]);
    return r.length > 0;
  },
  async get_course_participant_count(_ctx, a) {
    const r = await q<{ c: number }>(pool, "SELECT COUNT(*) AS c FROM bookings WHERE course_id = ? AND status = 'confirmed'", [a.course_uuid]);
    return Number(r[0].c);
  },
  async get_course_participant_counts(_ctx, a) {
    const ids: string[] = Array.isArray(a._course_ids) ? a._course_ids : [];
    if (!ids.length) return [];
    const rows = await q<{ course_id: string; c: number }>(
      pool,
      `SELECT course_id, COUNT(*) AS c FROM bookings WHERE status = 'confirmed' AND course_id IN (${ids.map(() => "?").join(",")}) GROUP BY course_id`,
      ids,
    );
    const m = new Map(rows.map((r) => [r.course_id, Number(r.c)]));
    return [...new Set(ids)].map((id) => ({ course_id: id, participants_count: m.get(id) ?? 0 }));
  },
  async has_active_video_access(_ctx, a) {
    const r = await q(
      pool,
      `SELECT 1 FROM video_course_access WHERE user_id = ? AND course_id = ? AND (
         status = 'active' OR (status = 'grace' AND grace_until IS NOT NULL AND grace_until > UTC_TIMESTAMP(6))
         OR (status = 'cancelled' AND current_period_end IS NOT NULL AND current_period_end > UTC_TIMESTAMP(6)))`,
      [a._user_id, a._course_id],
    );
    return r.length > 0;
  },
  async consume_class_card_credit(ctx, a) {
    if (!(isStaffish(ctx) || ctx.trainerId)) throw new DbError("Nicht berechtigt", "42501", 403);
    return tx(async (c) => {
      await q(
        c,
        "UPDATE class_cards SET remaining_credits = remaining_credits - 1 WHERE id = ? AND remaining_credits > 0 AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))",
        [a._card_id],
      );
      const [res] = (await c.query("SELECT ROW_COUNT() AS n")) as any;
      if (!Number(res[0].n)) return null;
      const r = await q<{ v: number }>(c, "SELECT remaining_credits AS v FROM class_cards WHERE id = ?", [a._card_id]);
      return r[0] ? Number(r[0].v) : null;
    }, ctx.conn ?? null);
  },
  async refund_class_card_credit(ctx, a) {
    if (!(isStaffish(ctx) || ctx.trainerId)) throw new DbError("Nicht berechtigt", "42501", 403);
    await q(ctx.conn ?? pool, "UPDATE class_cards SET remaining_credits = LEAST(total_credits, remaining_credits + 1) WHERE id = ?", [a._card_id]);
    const r = await q<{ v: number }>(ctx.conn ?? pool, "SELECT remaining_credits AS v FROM class_cards WHERE id = ?", [a._card_id]);
    return r[0] ? Number(r[0].v) : null;
  },
  async next_number(ctx, a) {
    if (!ctx.service) throw new DbError("Nicht berechtigt", "42501", 403);
    return tx((c) => nextNumber({ ...ctx, conn: c }, String(a._scope)), ctx.conn ?? null);
  },
  async set_my_onboarding_dismissed(ctx, a) {
    if (!ctx.uid) return null;
    await q(pool, "UPDATE trainers SET onboarding_dismissed = ? WHERE user_id = ?", [a._dismissed ? 1 : 0, ctx.uid]);
    return null;
  },
  async trainer_login_status(ctx) {
    if (!isAdmin(ctx)) throw new DbError("Nicht berechtigt", "P0001");
    const rows = await q<any>(pool, "SELECT t.id AS trainer_id, u.last_sign_in_at FROM trainers t JOIN auth_users u ON u.id = t.user_id");
    return rows.map((r) => ({ trainer_id: r.trainer_id, last_sign_in_at: fromMysqlDatetime(r.last_sign_in_at) }));
  },
  async mark_order_paid(ctx, a) {
    if (!isStaffish(ctx)) throw new DbError("Nicht berechtigt", "P0001");
    return tx(async (c) => {
      await q(c, "UPDATE orders SET status = 'paid', paid_at = COALESCE(paid_at, UTC_TIMESTAMP(6)), updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [a._order_id]);
      const upd = async (sql: string) => {
        const [r] = (await c.query(sql, [a._order_id])) as any;
        return Number(r.affectedRows ?? 0);
      };
      const cards = await upd("UPDATE class_cards SET status = 'active' WHERE order_id = ? AND status = 'pending_payment'");
      const bookings = await upd("UPDATE bookings SET status = 'confirmed', updated_at = UTC_TIMESTAMP(6) WHERE order_id = ? AND status = 'pending_payment'");
      const access = await upd("UPDATE video_course_access SET status = 'active', updated_at = UTC_TIMESTAMP(6) WHERE order_id = ? AND status = 'pending_payment'");
      return { ok: true, cards_activated: cards, bookings_confirmed: bookings, video_access_activated: access };
    }, ctx.conn ?? null);
  },
  async validate_voucher_cart(ctx, a) {
    const pre = await voucherPrecheck(ctx, a._code);
    if ("error" in pre) return { ok: false, error: pre.error };
    const v = pre.v;
    const cart = a._cart;
    if (!Array.isArray(cart)) return { ok: false, error: "Warenkorb leer." };
    let applicable = 0;
    for (const item of cart) {
      const itype = item?.type;
      const amount = Number(item?.amount ?? 0) || 0;
      const ref = item?.ref_id == null ? null : String(item.ref_id);
      let matches = false;
      if (v.applies_to.includes("all")) matches = true;
      else if (itype === "product" && v.applies_to.includes("shop_products")) matches = !v.product_ids.length || (!!ref && v.product_ids.includes(ref));
      else if (itype === "course" && v.applies_to.includes("courses")) matches = !v.course_type_ids.length || (!!ref && v.course_type_ids.includes(ref));
      else if (itype === "card" && v.applies_to.includes("class_cards")) matches = !v.class_card_types.length || (!!ref && v.class_card_types.includes(ref));
      else if (itype === "video_course" && v.applies_to.includes("video_courses")) matches = !v.video_course_ids.length || (!!ref && v.video_course_ids.includes(ref));
      if (matches) applicable += amount;
    }
    if (applicable <= 0) return { ok: false, error: "Code gilt nicht für die Artikel in deinem Warenkorb." };
    const fixed = v.discount_amount_fixed == null ? null : Number(v.discount_amount_fixed);
    const discount = fixed != null && fixed > 0 ? Math.min(fixed, applicable) : round2((applicable * Number(v.discount_percent)) / 100);
    return {
      ok: true,
      voucher_id: v.id,
      code: v.code,
      discount_percent: Number(v.discount_percent),
      discount_amount_fixed: fixed,
      applicable_amount: applicable,
      discount_amount: discount,
    };
  },
  async validate_voucher(ctx, a) {
    const pre = await voucherPrecheck(ctx, a._code);
    if ("error" in pre) return { ok: false, error: pre.error };
    const v = pre.v;
    const total = Number(a._cart_total ?? 0) || 0;
    const has = (xs: any) => Array.isArray(xs) && xs.length > 0;
    const inter = (xs: any[], ys: any[]) => xs.some((x) => ys.includes(String(x)));
    let applicable = 0;
    if (v.applies_to.includes("all")) applicable = total;
    else {
      if (v.applies_to.includes("shop_products") && has(a._product_ids) && (!v.product_ids.length || inter(a._product_ids, v.product_ids))) applicable += total;
      if (v.applies_to.includes("courses") && has(a._course_type_ids) && (!v.course_type_ids.length || inter(a._course_type_ids, v.course_type_ids))) applicable += total;
      if (v.applies_to.includes("class_cards") && has(a._card_types) && (!v.class_card_types.length || inter(a._card_types, v.class_card_types))) applicable += total;
    }
    if (applicable <= 0) return { ok: false, error: "Code gilt nicht für die Artikel in deinem Warenkorb." };
    const discount = round2((applicable * Number(v.discount_percent)) / 100);
    return { ok: true, voucher_id: v.id, code: v.code, discount_percent: Number(v.discount_percent), applicable_amount: applicable, discount_amount: discount };
  },
};

export async function callRpc(ctx: Ctx, name: string, args: Record<string, any>): Promise<DbResponse> {
  const fn = fns[name];
  if (!fn) {
    return { data: null, error: { message: `Could not find the function public.${name} in the schema cache`, code: "PGRST202" }, status: 404 };
  }
  try {
    await loadCtxRoles(ctx);
    const data = await fn(ctx, args ?? {});
    return { data: data === undefined ? null : data, error: null, status: 200 };
  } catch (e: any) {
    const err = e instanceof DbError ? e : new DbError(e?.message ?? String(e), "P0001", 400);
    return { data: null, error: err.toJSON(), status: err.status };
  }
}
