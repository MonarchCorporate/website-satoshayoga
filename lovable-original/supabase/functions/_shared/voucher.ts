// Shared helper for validating and applying vouchers in edge functions.
// Uses the admin (service-role) Supabase client to load and persist data.

export type CartLine = {
  type: "product" | "course" | "card";
  ref_id: string | null;
  amount: number;
};

export type VoucherResolution = {
  voucher_id: string;
  code: string;
  discount_percent: number;
  applicable_amount: number;
  discount_amount: number;
};

export async function resolveVoucher(
  admin: any,
  userId: string,
  code: string | null | undefined,
  cart: CartLine[],
): Promise<{ ok: true; voucher: VoucherResolution } | { ok: false; error: string }> {
  if (!code) return { ok: false, error: "no_code" };
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, error: "no_code" };

  const { data: voucher, error } = await admin
    .from("vouchers")
    .select("*")
    .ilike("code", trimmed)
    .maybeSingle();
  if (error || !voucher) return { ok: false, error: "Code ungültig." };
  if (!voucher.is_active) return { ok: false, error: "Code ist nicht aktiv." };

  const now = Date.now();
  if (voucher.valid_from && new Date(voucher.valid_from).getTime() > now)
    return { ok: false, error: "Code ist noch nicht gültig." };
  if (voucher.valid_until && new Date(voucher.valid_until).getTime() < now)
    return { ok: false, error: "Code ist abgelaufen." };
  if (voucher.is_single_use && voucher.times_used >= 1)
    return { ok: false, error: "Code wurde bereits eingelöst." };
  if (
    voucher.max_total_uses !== null &&
    voucher.times_used >= voucher.max_total_uses
  )
    return { ok: false, error: "Code wurde bereits maximal oft eingelöst." };

  if (voucher.max_uses_per_customer !== null) {
    const { count } = await admin
      .from("voucher_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("voucher_id", voucher.id)
      .eq("user_id", userId);
    if ((count ?? 0) >= voucher.max_uses_per_customer)
      return { ok: false, error: "Du hast diesen Code bereits maximal oft genutzt." };
  }

  const applies: string[] = voucher.applies_to ?? ["all"];
  let applicable = 0;
  for (const line of cart) {
    let match = false;
    if (applies.includes("all")) match = true;
    else if (line.type === "product" && applies.includes("shop_products")) {
      const list: string[] = voucher.product_ids ?? [];
      match = list.length === 0 || (line.ref_id != null && list.includes(line.ref_id));
    } else if (line.type === "course" && applies.includes("courses")) {
      const list: string[] = voucher.course_type_ids ?? [];
      match = list.length === 0 || (line.ref_id != null && list.includes(line.ref_id));
    } else if (line.type === "card" && applies.includes("class_cards")) {
      const list: string[] = voucher.class_card_types ?? [];
      match = list.length === 0 || (line.ref_id != null && list.includes(line.ref_id));
    }
    if (match) applicable += Number(line.amount) || 0;
  }

  if (applicable <= 0)
    return { ok: false, error: "Code gilt nicht für die Artikel in deinem Warenkorb." };

  const pct = Number(voucher.discount_percent);
  const fixed = voucher.discount_amount_fixed != null ? Number(voucher.discount_amount_fixed) : 0;
  const discount = fixed > 0
    ? Math.min(fixed, applicable)
    : Math.round(applicable * pct) / 100;

  return {
    ok: true,
    voucher: {
      voucher_id: voucher.id,
      code: voucher.code,
      discount_percent: pct,
      applicable_amount: applicable,
      discount_amount: discount,
    },
  };
}

export function buildCartFromPositions(
  positions: Array<{ item_type: string; product_id: string | null; course_id: string | null; course_type_id?: string | null; unit_price: number; name: string }>,
  courseTypeIdByCourseId: Map<string, string | null> = new Map(),
): CartLine[] {
  return positions.map((p) => {
    if (p.item_type === "course_booking")
      return {
        type: "course" as const,
        ref_id: p.course_type_id ?? (p.course_id ? courseTypeIdByCourseId.get(p.course_id) ?? null : null),
        amount: Number(p.unit_price),
      };
    if (p.item_type === "class_card") {
      const cardKey = p.product_id ?? (p.name.includes("10") ? "ten" : "five");
      return { type: "card" as const, ref_id: cardKey, amount: Number(p.unit_price) };
    }
    return { type: "product" as const, ref_id: p.product_id, amount: Number(p.unit_price) };
  });
}

export async function recordRedemption(
  admin: any,
  params: {
    voucher_id: string;
    user_id: string;
    order_id?: string | null;
    booking_id?: string | null;
    discount_amount: number;
  },
) {
  await admin.from("voucher_redemptions").insert({
    voucher_id: params.voucher_id,
    user_id: params.user_id,
    order_id: params.order_id ?? null,
    booking_id: params.booking_id ?? null,
    discount_amount: params.discount_amount,
  });
}
