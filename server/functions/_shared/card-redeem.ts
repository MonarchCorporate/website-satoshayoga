// Ported from supabase/functions (Deno) by scripts/port_functions.py
// Shared helpers for redeeming class-card assignments across the checkout flows.
//
// Usage flow inside an edge function:
//   1) validateCardAssignments(...)  — cheap read-only validation before touching money
//   2) redeemCardAssignments(...)    — atomic per-course: insert/upsert booking + consume credit
//   3) rollbackCardAssignments(...)  — undo previously-redeemed items when a later step fails
//
// Assumptions:
//   - `cart_item_id` in the assignments MUST match an entry in `cartItems` that has a `course_id`.
//   - Callers pass the same `cartItems` array used to build order positions so the caller can
//     exclude assigned items from the paid subtotal.

export interface CardAssignmentInput {
  cart_item_id: string;
  card_id: string;
}

export interface CartItemLike {
  id: string;
  course_id: string | null;
  courses?: {
    title: string;
    start_time: string;
    end_time?: string;
    location?: string | null;
    class_cards_allowed?: boolean;
    booking_opens_immediately?: boolean;
    booking_opens_at?: string | null;
    is_cancelled?: boolean;
    max_participants?: number;
    price?: number;
  } | null;
}

export interface ValidatedAssignment {
  cart_item_id: string;
  card_id: string;
  course_id: string;
  course_title: string;
}

export interface RedeemedBooking {
  booking_id: string;
  card_id: string;
  course_id: string;
  course_title: string;
  was_new: boolean;
  card_type: "five" | "ten";
}

interface ValidateResult {
  ok: boolean;
  error?: string;
  assignments?: ValidatedAssignment[];
}

interface RedeemResult {
  ok: boolean;
  error?: string;
  bookings?: RedeemedBooking[];
}

export async function validateCardAssignments(
  admin: any,
  userId: string,
  cartItems: CartItemLike[],
  assignments: CardAssignmentInput[] | null | undefined,
): Promise<ValidateResult> {
  if (!assignments || assignments.length === 0) return { ok: true, assignments: [] };

  // No duplicate cart_item_ids
  const seenItems = new Set<string>();
  for (const a of assignments) {
    if (seenItems.has(a.cart_item_id)) {
      return { ok: false, error: "Kartenzuweisung ist doppelt vergeben." };
    }
    seenItems.add(a.cart_item_id);
  }

  // Aggregate needed credits per card
  const perCard: Record<string, number> = {};
  for (const a of assignments) perCard[a.card_id] = (perCard[a.card_id] ?? 0) + 1;

  // Load all referenced cards in one go
  const { data: cards, error: cErr } = await admin
    .from("class_cards")
    .select("id, user_id, remaining_credits, expires_at, card_type, status")
    .in("id", Object.keys(perCard));
  if (cErr) return { ok: false, error: cErr.message };

  for (const [cardId, needed] of Object.entries(perCard)) {
    const c = (cards ?? []).find((x: any) => x.id === cardId);
    if (!c) return { ok: false, error: "Karte nicht gefunden." };
    if (c.status === "cancelled") return { ok: false, error: "Eine der gewählten Karten wurde storniert." };
    if (c.user_id !== userId) return { ok: false, error: "Karte gehört nicht zu diesem Konto." };
    if (c.remaining_credits < needed) {
      return {
        ok: false,
        error: `Auf der gewählten Karte sind nur noch ${c.remaining_credits} Credits – ${needed} werden benötigt.`,
      };
    }
    if (c.expires_at && new Date(c.expires_at) < new Date()) {
      return { ok: false, error: "Eine der gewählten Karten ist abgelaufen." };
    }
  }

  // Mehrere Plätze pro Kurs sind erlaubt – benötigte Plätze je Kurs vorab zählen.
  const seatsPerCourse: Record<string, number> = {};
  for (const a of assignments) {
    const it = cartItems.find((x) => x.id === a.cart_item_id);
    if (it?.course_id) seatsPerCourse[it.course_id] = (seatsPerCourse[it.course_id] ?? 0) + 1;
  }

  const validated: ValidatedAssignment[] = [];
  for (const a of assignments) {
    const item = cartItems.find((it) => it.id === a.cart_item_id);
    if (!item || !item.course_id || !item.courses) {
      return { ok: false, error: "Ein per Karte bezahlter Kurs wurde nicht gefunden." };
    }
    const c: any = item.courses;
    if (c.is_cancelled) return { ok: false, error: `"${c.title}" wurde abgesagt.` };
    if (c.class_cards_allowed === false) {
      return { ok: false, error: `Für "${c.title}" sind Karten nicht zulässig.` };
    }
    if (new Date(c.start_time) < new Date()) {
      return { ok: false, error: `"${c.title}" liegt in der Vergangenheit.` };
    }
    if (
      c.booking_opens_immediately === false &&
      c.booking_opens_at &&
      new Date(c.booking_opens_at) > new Date()
    ) {
      return { ok: false, error: `Buchung für "${c.title}" ist noch nicht freigegeben.` };
    }

    // Capacity – alle für diesen Kurs gewünschten Plätze berücksichtigen
    if (typeof c.max_participants === "number") {
      const { count } = await admin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("course_id", item.course_id)
        .eq("status", "confirmed");
      const needed = seatsPerCourse[item.course_id] ?? 1;
      if ((count ?? 0) + needed > c.max_participants) {
        return { ok: false, error: `"${c.title}" hat nicht genügend freie Plätze.` };
      }
    }


    validated.push({
      cart_item_id: a.cart_item_id,
      card_id: a.card_id,
      course_id: item.course_id,
      course_title: c.title,
    });
  }

  return { ok: true, assignments: validated };
}

export async function redeemCardAssignments(
  admin: any,
  userId: string,
  validated: ValidatedAssignment[],
): Promise<RedeemResult> {
  const done: RedeemedBooking[] = [];

  // Mehrere Plätze im gleichen Kurs sind erlaubt: pro Zuweisung genau EIN
  // Buchungseintrag. Stornierte Einträge werden – jeder nur einmal – reaktiviert.
  const reusedIds = new Set<string>();

  for (const a of validated) {
    const { data: cancelledRows } = await admin
      .from("bookings")
      .select("id")
      .eq("course_id", a.course_id)
      .eq("user_id", userId)
      .eq("status", "cancelled");
    const existing = (cancelledRows ?? []).find((r: any) => !reusedIds.has(r.id));

    let bookingId: string;
    let wasNew = false;
    if (existing) {
      reusedIds.add(existing.id);
      const { data: upd, error: uErr } = await admin
        .from("bookings")
        .update({
          status: "confirmed",
          amount_paid: 0,
          paid_with_card: true,
          card_id: a.card_id,
          payment_method: null,
          payment_id: null,
          refunded: false,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (uErr || !upd) {
        await rollbackCardAssignments(admin, done);
        return { ok: false, error: uErr?.message ?? "Buchung fehlgeschlagen" };
      }
      bookingId = upd.id;
    } else {
      const { data: ins, error: bErr } = await admin
        .from("bookings")
        .insert({
          user_id: userId,
          course_id: a.course_id,
          status: "confirmed",
          amount_paid: 0,
          paid_with_card: true,
          card_id: a.card_id,
        })
        .select()
        .single();
      if (bErr || !ins) {
        await rollbackCardAssignments(admin, done);
        return { ok: false, error: bErr?.message ?? "Buchung fehlgeschlagen" };
      }
      bookingId = ins.id;
      wasNew = true;
    }

    // Consume credit atomically
    const { data: newRemaining, error: cErr } = await admin.rpc(
      "consume_class_card_credit",
      { _card_id: a.card_id },
    );
    if (cErr || newRemaining === null || newRemaining === undefined) {
      // rollback this booking
      await admin.from("bookings").delete().eq("id", bookingId);
      await rollbackCardAssignments(admin, done);
      return { ok: false, error: cErr?.message ?? "Karte konnte nicht abgebucht werden." };
    }

    // Look up card type for downstream notifications
    const { data: cardRow } = await admin
      .from("class_cards")
      .select("card_type")
      .eq("id", a.card_id)
      .maybeSingle();

    done.push({
      booking_id: bookingId,
      card_id: a.card_id,
      course_id: a.course_id,
      course_title: a.course_title,
      was_new: wasNew,
      card_type: (cardRow?.card_type as "five" | "ten") ?? "five",
    });
  }

  return { ok: true, bookings: done };
}

export async function rollbackCardAssignments(
  admin: any,
  bookings: RedeemedBooking[],
): Promise<void> {
  for (const b of bookings) {
    try {
      await admin.from("bookings").delete().eq("id", b.booking_id);
      await admin.rpc("refund_class_card_credit", { _card_id: b.card_id });
    } catch (_e) {
      // best-effort rollback
    }
  }
}
