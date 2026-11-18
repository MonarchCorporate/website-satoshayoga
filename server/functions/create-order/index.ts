// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { resolveVoucher, buildCartFromPositions, recordRedemption } from "../_shared/voucher.ts";
import {
  validateCardAssignments,
  redeemCardAssignments,
  rollbackCardAssignments,
  type CardAssignmentInput,
} from "../_shared/card-redeem.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface CartItem {
  id: string;
  course_id: string | null;
  product_id: string | null;
  card_type: string | null;
  courses?: { title: string; start_time: string; price: number; course_type_id: string | null } | null;
  products?: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    tax_rate: number;
    kind: string;
    card_credits: number | null;
    card_validity_days: number | null;
    stock: number | null;
  } | null;
}

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = __env("SUPABASE_URL")!;
    const anonKey = __env("SUPABASE_ANON_KEY")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const billing = body.billing ?? {};
    const payment_method: string = body.payment_method ?? "paypal";
    const also_book_course_id: string | null = body.also_book_course_id ?? null;
    const rawAlsoSeats = Number(body.also_book_seats ?? 1);
    const also_book_seats = Math.max(1, Math.min(10, Number.isFinite(rawAlsoSeats) ? Math.floor(rawAlsoSeats) : 1));
    const voucher_code: string | null = body.voucher_code ?? null;
    const card_assignments: CardAssignmentInput[] = Array.isArray(body.card_assignments)
      ? body.card_assignments
      : [];

    if (also_book_course_id) {
      const { data: absCourse } = await admin
        .from("courses")
        .select("title, booking_opens_immediately, booking_opens_at")
        .eq("id", also_book_course_id)
        .maybeSingle();
      if (
        absCourse?.booking_opens_immediately === false &&
        absCourse?.booking_opens_at &&
        new Date(absCourse.booking_opens_at) > new Date()
      ) {
        return json({ error: `Buchung für "${absCourse.title}" ist noch nicht freigegeben.` }, 400);
      }
    }

    // Load cart
    const { data: cartItems, error: cartErr } = await admin
      .from("cart_items")
      .select(
        "id, course_id, product_id, card_type, courses(title, start_time, end_time, location, price, course_type_id, max_participants, is_cancelled, class_cards_allowed, booking_opens_immediately, booking_opens_at), products(id, name, description, price, tax_rate, kind, card_credits, card_validity_days, stock)"
      )
      .eq("user_id", user.id);

    if (cartErr) return json({ error: cartErr.message }, 500);
    if (!cartItems || cartItems.length === 0) {
      return json({ error: "Cart is empty" }, 400);
    }

    // Validate card assignments (read-only) before any writes
    const assignedItemIds = new Set(card_assignments.map((a) => a.cart_item_id));
    const cardValidation = await validateCardAssignments(
      admin,
      user.id,
      cartItems as any,
      card_assignments,
    );
    if (!cardValidation.ok) return json({ error: cardValidation.error }, 400);

    // Build positions
    let subtotal = 0;
    let taxTotal = 0;
    const positions: any[] = [];

    for (const it of cartItems as CartItem[]) {
      const isCardAssigned = assignedItemIds.has(it.id);
      let name = "";
      let description: string | null = null;
      let unit_price = 0;
      let tax_rate = 0; // Kleinunternehmer §19 UStG – keine USt
      let item_type: "product" | "course_booking" | "class_card" = "product";
      let product_id: string | null = it.product_id;
      let course_id: string | null = it.course_id;

      if (it.products) {
        name = it.products.name;
        description = it.products.description;
        unit_price = Number(it.products.price);
        item_type = it.products.kind === "class_card" ? "class_card" : "product";
        if (it.products.stock !== null && it.products.stock <= 0) {
          return json({ error: `Ausverkauft: ${it.products.name}` }, 400);
        }
      } else if (it.courses) {
        const c: any = it.courses;
        if (
          c.booking_opens_immediately === false &&
          c.booking_opens_at &&
          new Date(c.booking_opens_at) > new Date()
        ) {
          return json({ error: `Buchung für "${c.title}" ist noch nicht freigegeben.` }, 400);
        }
        name = c.title;
        description = isCardAssigned
          ? "Kursbuchung (per Gruppenkarte)"
          : "Kursbuchung am " + c.start_time;
        unit_price = isCardAssigned ? 0 : Number(c.price);
        item_type = "course_booking";
      } else if (it.card_type) {
        name = it.card_type === "five" ? "5er-Karte" : "10er-Karte";
        unit_price = it.card_type === "five" ? 70 : 120;
        item_type = "class_card";
      }

      const line_total = unit_price; // qty 1
      const net = line_total / (1 + tax_rate / 100);
      const tax = line_total - net;
      subtotal += net;
      taxTotal += tax;

      positions.push({
        product_id,
        course_id,
        course_type_id: it.courses?.course_type_id ?? null,
        item_type,
        name,
        description,
        quantity: 1,
        unit_price,
        tax_rate,
        line_total,
        _cart_item_id: it.id,
        _card_assigned: isCardAssigned,
      });
    }

    // Capacity check: sum requested seats per course (incl. also_book_course_id) vs. free spots.
    const seatDemand = new Map<string, number>();
    for (const p of positions) {
      if (p.item_type === "course_booking" && p.course_id) {
        seatDemand.set(p.course_id, (seatDemand.get(p.course_id) ?? 0) + 1);
      }
    }
    if (also_book_course_id) {
      seatDemand.set(also_book_course_id, (seatDemand.get(also_book_course_id) ?? 0) + also_book_seats);
    }
    for (const [cid, demand] of seatDemand) {
      const { data: cRow } = await admin
        .from("courses")
        .select("title, max_participants")
        .eq("id", cid)
        .maybeSingle();
      if (!cRow?.max_participants) continue;
      const { data: cnt } = await admin.rpc("get_course_participant_count", { course_uuid: cid });
      const confirmed = Number(cnt ?? 0);
      if (confirmed + demand > cRow.max_participants) {
        return json({
          error: `Nicht genug freie Plätze für "${cRow.title}" (${Math.max(0, cRow.max_participants - confirmed)} frei, ${demand} angefragt).`,
        }, 400);
      }
    }

    const grossTotal = subtotal + taxTotal;


    // Voucher
    let discountAmount = 0;
    let voucherId: string | null = null;
    let voucherCodeStored: string | null = null;
    if (voucher_code) {
      const cartLines = buildCartFromPositions(positions);
      const res = await resolveVoucher(admin, user.id, voucher_code, cartLines);
      if (!res.ok) return json({ error: res.error }, 400);
      discountAmount = Math.min(res.voucher.discount_amount, grossTotal);
      voucherId = res.voucher.voucher_id;
      voucherCodeStored = res.voucher.code;
    }

    const total = Math.max(0, grossTotal - discountAmount);

    // Rechnungskauf: erlaubt Bestellungen mit Restbetrag > 0.
    // Sonst (0 €-Fall via Karten/Gutschein) wird payment_method automatisch auf "invoice" gesetzt.
    const isInvoicePurchase = payment_method === "invoice" && Number(total.toFixed(2)) > 0;
    if (!isInvoicePurchase && Number(total.toFixed(2)) > 0) {
      return json({
        error: "Diese Bestellung erfordert eine Zahlung. Bitte via PayPal abschließen.",
      }, 400);
    }
    // 0-€-Bestellungen korrekt kennzeichnen: Gutschein bzw. Karten-Guthaben statt "Rechnung"
    const effective_payment_method = isInvoicePurchase
      ? "invoice"
      : voucherCodeStored
        ? "voucher"
        : (cardValidation.assignments && cardValidation.assignments.length > 0)
          ? "card_credit"
          : "invoice";
    


    // Create order
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        subtotal: subtotal.toFixed(2),
        tax_total: taxTotal.toFixed(2),
        total: total.toFixed(2),
        payment_method: effective_payment_method,
        voucher_id: voucherId,
        voucher_code: voucherCodeStored,
        discount_amount: discountAmount.toFixed(2),
        card_assignments: cardValidation.assignments && cardValidation.assignments.length > 0
          ? (cardValidation.assignments as any)
          : null,
        billing_first_name: billing.first_name ?? null,
        billing_last_name: billing.last_name ?? null,
        billing_email: billing.email ?? user.email,
        billing_phone: billing.phone ?? null,
        billing_street: billing.street ?? null,
        billing_postal_code: billing.postal_code ?? null,
        billing_city: billing.city ?? null,
        billing_country: billing.country ?? "Deutschland",
      })
      .select()
      .single();

    if (orderErr || !order) return json({ error: orderErr?.message ?? "Order failed" }, 500);

    const itemsPayload = positions.map(({ _cart_item_id: _c, _card_assigned: _a, course_type_id: _ct, ...p }) => ({
      ...p,
      order_id: order.id,
    }));
    const { error: itemsErr } = await admin.from("order_items").insert(itemsPayload);
    if (itemsErr) return json({ error: itemsErr.message }, 500);

    // Redeem card assignments FIRST — atomically per course. Rolls back on failure.
    if (cardValidation.assignments && cardValidation.assignments.length > 0) {
      const redeem = await redeemCardAssignments(admin, user.id, cardValidation.assignments);
      if (!redeem.ok) {
        // rollback whole order
        await admin.from("order_items").delete().eq("order_id", order.id);
        await admin.from("orders").delete().eq("id", order.id);
        return json({ error: redeem.error }, 400);
      }
    }

    // For "invoice" method (Auf Rechnung): immediately fulfill (create cards/bookings)
    // For "paypal": fulfill after capture; here we shortcut for now since PayPal isn't wired yet
    const shouldFulfill = true;
    // Bei Rechnungskauf werden Karten/Buchungen/Video-Zugänge in "pending_payment" angelegt
    // und erst nach manueller Zahlungsfreigabe im Backoffice aktiviert.
    const bookingStatus = isInvoicePurchase ? "pending_payment" : "confirmed";
    const cardStatus = isInvoicePurchase ? "pending_payment" : "active";

    if (shouldFulfill) {
      for (const p of positions) {
        if (p._card_assigned) continue; // already redeemed via card above
        if (p.item_type === "course_booking" && p.course_id) {
          await admin.from("bookings").insert({
            user_id: user.id,
            course_id: p.course_id,
            status: bookingStatus as any,
            amount_paid: p.unit_price,
            payment_method: effective_payment_method,
            paid_with_card: false,
            card_id: null,
            refunded: false,
            order_id: order.id,
          });

        } else if (p.item_type === "class_card") {
          let credits = 5;
          let validityDays = 365;
          let cardType: "five" | "ten" = "five";
          if (p.product_id) {
            const prod = (cartItems as CartItem[]).find(
              (c) => c.products?.id === p.product_id
            )?.products;
            if (prod?.card_credits) credits = prod.card_credits;
            if (prod?.card_validity_days) validityDays = prod.card_validity_days;
            cardType = credits >= 10 ? "ten" : "five";
          } else {
            cardType = p.name.includes("10") ? "ten" : "five";
            credits = cardType === "ten" ? 10 : 5;
          }
          const expires = new Date();
          expires.setDate(expires.getDate() + validityDays);
          const { data: newCard } = await admin.from("class_cards").insert({
            user_id: user.id,
            card_type: cardType,
            total_credits: credits,
            remaining_credits: credits,
            amount_paid: p.unit_price,
            payment_method: effective_payment_method,
            expires_at: expires.toISOString(),
            status: cardStatus,
            order_id: order.id,
          }).select().single();

          // If caller asked us to also book a course with this newly purchased card, do it
          // (nur bei sofort aktiven Karten, nicht bei Rechnungskauf)
          if (also_book_course_id && newCard && !isInvoicePurchase) {
            for (let s = 0; s < also_book_seats; s++) {
              await admin.from("bookings").insert({
                user_id: user.id,
                course_id: also_book_course_id,
                status: "confirmed" as const,
                amount_paid: 0,
                paid_with_card: true,
                card_id: newCard.id,
                refunded: false,
                payment_method: null,
                payment_id: null,
                order_id: order.id,
              });
              await admin.rpc("consume_class_card_credit", { _card_id: newCard.id });
            }
          }

        } else if (p.item_type === "product" && p.product_id) {
          // Decrement stock if tracked (auch bei Rechnungskauf → Stock reservieren)
          const prod = (cartItems as CartItem[]).find(
            (c) => c.products?.id === p.product_id
          )?.products;
          if (prod && prod.stock !== null) {
            await admin
              .from("products")
              .update({ stock: Math.max(0, prod.stock - 1) })
              .eq("id", prod.id);
          }
        }
      }

      // If nothing left to pay (only cards used), mark order as paid
      if (Number(total.toFixed(2)) === 0) {
        await admin
          .from("orders")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", order.id);
      }
      // Clear cart
      await admin.from("cart_items").delete().eq("user_id", user.id);

      // Record voucher redemption
      if (voucherId) {
        await recordRedemption(admin, {
          voucher_id: voucherId,
          user_id: user.id,
          order_id: order.id,
          discount_amount: discountAmount,
        });
      }
    }


    // Generate invoice immediately
    let invoice_pdf_url: string | undefined;
    try {
      const invRes = await fetch(
        `${supabaseUrl}/functions/v1/generate-invoice`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ order_id: order.id }),
        }
      );
      const invJson = await invRes.json().catch(() => ({}));
      invoice_pdf_url = invJson.signed_url;
    } catch (_e) {
      // ignore
    }

    return json({
      order_id: order.id,
      order_number: order.order_number,
      invoice_pdf_url,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
