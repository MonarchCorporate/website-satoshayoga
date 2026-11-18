// Ported from supabase/functions (Deno) by scripts/port_functions.py
// Shared fulfillment logic for PayPal orders (used by capture-paypal-order and reconcile-paypal-orders)
import {
  triggerCustomerEmail,
  formatDate,
  formatTime,
  formatMoney,
} from "./customer-email.ts";
import { recordRedemption } from "./voucher.ts";
import { redeemCardAssignments } from "./card-redeem.ts";

export interface FulfillResult {
  ok: boolean;
  reason?: string;
  order_id?: string;
  order_number?: string;
}

/**
 * Verifies captured amount and runs full fulfillment for a paid PayPal order.
 * `capture` is the object from PayPal `purchase_units[0].payments.captures[0]`.
 */
export async function fulfillPaypalOrder(
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
  order: any,
  paypalOrderId: string,
  capture: any,
): Promise<FulfillResult> {
  const capturedAmount = Number(capture?.amount?.value ?? NaN);
  const capturedCurrency = capture?.amount?.currency_code;
  const expectedTotal = Number(order.total ?? NaN);

  if (
    !Number.isFinite(capturedAmount) ||
    !Number.isFinite(expectedTotal) ||
    Math.abs(capturedAmount - expectedTotal) > 0.01 ||
    capturedCurrency !== "EUR"
  ) {
    await admin.from("orders").update({ status: "payment_mismatch" }).eq("id", order.id);
    console.error("[fulfillPaypalOrder] amount/currency mismatch", {
      capturedAmount, capturedCurrency, expectedTotal, order_id: order.id,
    });
    return { ok: false, reason: "amount_mismatch" };
  }

  // Idempotency: if already paid, nothing to do
  if (order.status === "paid") {
    return { ok: true, order_id: order.id, order_number: order.order_number };
  }

  const userId = order.user_id;

  // Load items
  const { data: items } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  let also_book_course_id: string | null = null;
  let also_book_seats = 1;
  if (order.notes) {
    try {
      const parsed = JSON.parse(order.notes);
      also_book_course_id = parsed?.also_book_course_id ?? null;
      const rawSeats = Number(parsed?.also_book_seats ?? 1);
      also_book_seats = Math.max(1, Math.min(10, Number.isFinite(rawSeats) ? Math.floor(rawSeats) : 1));
    } catch (_e) {}
  }

  const cardAssignments = Array.isArray(order.card_assignments) ? order.card_assignments : [];
  // Nur Kurse ausschließen, deren Karteneinlösung wirklich geklappt hat –
  // sonst entstehen bezahlte Bestellungen ohne Buchung.
  const cardCoursesSet = new Set<string>();
  if (cardAssignments.length > 0) {
    const redeem = await redeemCardAssignments(admin, userId, cardAssignments as any);
    if (!redeem.ok) {
      console.error("[fulfillPaypalOrder] card redemption failed", redeem.error);
    } else {
      for (const a of cardAssignments) cardCoursesSet.add(a.course_id);
    }
  }

  // --- Kursbuchungen: pro Order-Position genau EIN Platz ---
  // Idempotent über die Anzahl bereits existierender Buchungen zu dieser Zahlung.
  const bookingItems = (items ?? []).filter(
    (p: any) => p.item_type === "course_booking" && p.course_id && !cardCoursesSet.has(p.course_id),
  );
  const seatsByCourse = new Map<string, any[]>();
  for (const p of bookingItems) {
    const arr = seatsByCourse.get(p.course_id) ?? [];
    arr.push(p);
    seatsByCourse.set(p.course_id, arr);
  }
  for (const [courseId, seatItems] of seatsByCourse) {
    // Idempotenz: bereits vorhandene Plätze zu DIESER Bestellung zählen –
    // erkannt über payment_id (PayPal-Order) ODER order_id (Nachbuchung/Reconcile).
    const { data: alreadyRows } = await admin
      .from("bookings")
      .select("id, payment_id, order_id")
      .eq("course_id", courseId)
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .or(`payment_id.eq.${paypalOrderId},order_id.eq.${order.id}`);
    const already = (alreadyRows ?? []).length;

    // Bestehende Zeilen ohne Verknüpfung nachziehen, damit spätere Läufe
    // nicht erneut denselben Platz anlegen.
    for (const row of alreadyRows ?? []) {
      if (!row.order_id || !row.payment_id) {
        await admin
          .from("bookings")
          .update({ order_id: order.id, payment_id: paypalOrderId })
          .eq("id", row.id);
      }
    }

    for (let i = already; i < seatItems.length; i++) {
      await admin.from("bookings").insert({
        user_id: userId,
        course_id: courseId,
        status: "confirmed" as const,
        amount_paid: seatItems[i].unit_price,
        payment_method: "paypal",
        payment_id: paypalOrderId,
        paid_with_card: false,
        card_id: null,
        refunded: false,
        order_id: order.id,
      });
    }
  }


  // Karten pro Position (mehrere gleiche Karten möglich)
  const cardCountsByCredits = new Map<number, number>();
  for (const p of items ?? []) {
    if (p.item_type === "class_card") {
      let credits = 5;
      let validityDays = 365;
      let cardType: "five" | "ten" = "five";
      if (p.product_id) {
        const { data: prod } = await admin
          .from("products")
          .select("card_credits, card_validity_days")
          .eq("id", p.product_id)
          .maybeSingle();
        if (prod?.card_credits) credits = prod.card_credits;
        if (prod?.card_validity_days) validityDays = prod.card_validity_days;
        cardType = credits >= 10 ? "ten" : "five";
      } else {
        cardType = p.name.includes("10") ? "ten" : "five";
        credits = cardType === "ten" ? 10 : 5;
      }
      // Idempotenz: nur so viele Karten anlegen, wie noch fehlen
      const wanted = (cardCountsByCredits.get(credits) ?? 0) + 1;
      cardCountsByCredits.set(credits, wanted);
      const { data: dupCards } = await admin
        .from("class_cards")
        .select("id")
        .eq("user_id", userId)
        .eq("payment_id", paypalOrderId)
        .eq("total_credits", credits);
      if ((dupCards ?? []).length >= wanted) continue;


      const expires = new Date();
      expires.setDate(expires.getDate() + validityDays);
      const { data: newCard } = await admin
        .from("class_cards")
        .insert({
          user_id: userId,
          card_type: cardType,
          total_credits: credits,
          remaining_credits: credits,
          amount_paid: p.unit_price,
          payment_method: "paypal",
          payment_id: paypalOrderId,
          order_id: order.id,
          expires_at: expires.toISOString(),

        })
        .select()
        .single();

      if (also_book_course_id && newCard) {
        // Reactivate one cancelled booking if any, then create the rest fresh
        const { data: cancelled } = await admin
          .from("bookings")
          .select("id")
          .eq("course_id", also_book_course_id)
          .eq("user_id", userId)
          .eq("status", "cancelled")
          .limit(1)
          .maybeSingle();
        for (let s = 0; s < also_book_seats; s++) {
          const payload = {
            user_id: userId,
            course_id: also_book_course_id,
            status: "confirmed" as const,
            amount_paid: 0,
            paid_with_card: true,
            card_id: newCard.id,
            refunded: false,
            payment_method: null,
            payment_id: null,
          };
          if (s === 0 && cancelled) {
            await admin.from("bookings").update(payload).eq("id", cancelled.id);
          } else {
            await admin.from("bookings").insert(payload);
          }
          await admin.rpc("consume_class_card_credit", { _card_id: newCard.id });
        }
      }
    } else if (p.item_type === "product" && p.product_id) {
      const { data: prod } = await admin
        .from("products")
        .select("stock")
        .eq("id", p.product_id)
        .maybeSingle();
      if (prod && prod.stock !== null) {
        await admin
          .from("products")
          .update({ stock: Math.max(0, prod.stock - 1) })
          .eq("id", p.product_id);
      }
    }
  }

  await admin
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", order.id);

  await admin.from("cart_items").delete().eq("user_id", userId);

  if (order.voucher_id) {
    await recordRedemption(admin, {
      voucher_id: order.voucher_id,
      user_id: userId,
      order_id: order.id,
      discount_amount: Number(order.discount_amount ?? 0),
    });
  }

  let invoice_pdf_url: string | undefined;
  try {
    const invRes = await fetch(`${supabaseUrl}/functions/v1/generate-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ order_id: order.id }),
    });
    const invJson = await invRes.json().catch(() => ({}));
    invoice_pdf_url = invJson.signed_url;
  } catch (_e) {}

  try {
    const bookingItems = (items ?? []).filter((p: any) => p.item_type === "course_booking" && p.course_id);
    for (const p of bookingItems) {
      const { data: full } = await admin
        .from("courses")
        .select("title, start_time, end_time, location, instructor:trainers(first_name, last_name)")
        .eq("id", p.course_id)
        .maybeSingle();
      await triggerCustomerEmail(admin, {
        user_id: userId,
        trigger_key: "booking_confirmation",
        idempotency_key: `booking-${order.id}-${p.course_id}`,
        data: {
          course_title: (full as any)?.title ?? p.name,
          course_date: formatDate((full as any)?.start_time),
          course_time: `${formatTime((full as any)?.start_time)} – ${formatTime((full as any)?.end_time)}`,
          course_location: (full as any)?.location ?? "",
          instructor_name: (full as any)?.instructor
            ? `${(full as any).instructor.first_name} ${(full as any).instructor.last_name}`
            : "",
          payment_method: "PayPal",
          amount_paid: formatMoney(Number(p.unit_price ?? 0)),
        },
      });
    }
    const cardItems = (items ?? []).filter((p: any) => p.item_type === "class_card");
    for (const p of cardItems) {
      await triggerCustomerEmail(admin, {
        user_id: userId,
        trigger_key: "card_purchased",
        idempotency_key: `card-${order.id}-${p.id}`,
        data: {
          card_type: p.name,
          credits: String(p.name?.includes("10") ? 10 : 5),
          expires_at: formatDate(new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()),
          amount_paid: formatMoney(Number(p.unit_price ?? 0)),
        },
      });
    }
    await triggerCustomerEmail(admin, {
      user_id: userId,
      trigger_key: "order_confirmation",
      idempotency_key: `order-${order.id}`,
      data: {
        order_number: order.order_number ?? order.id,
        order_total: formatMoney(Number(order.total ?? 0)),
        invoice_url: invoice_pdf_url ?? "#",
      },
    });
  } catch (e) {
    console.warn("[fulfillPaypalOrder] email trigger failed", e);
  }

  return { ok: true, order_id: order.id, order_number: order.order_number };
}
