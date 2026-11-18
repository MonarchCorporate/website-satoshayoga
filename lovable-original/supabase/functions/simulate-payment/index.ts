import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  triggerCustomerEmail,
  formatDate,
  formatTime,
  formatMoney,
} from "../_shared/customer-email.ts";
import { resolveVoucher, buildCartFromPositions, recordRedemption } from "../_shared/voucher.ts";
import { resolveRequestUser } from "../_shared/guest-token.ts";
import {
  validateCardAssignments,
  redeemCardAssignments,
  type CardAssignmentInput,
} from "../_shared/card-redeem.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-token",
};

interface CartItem {
  id: string;
  course_id: string | null;
  product_id: string | null;
  card_type: string | null;
  courses?: { title: string; start_time: string; end_time: string; price: number; location: string | null; course_type_id: string | null } | null;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const guestHeader = req.headers.get("x-guest-token");
    if (!authHeader && !guestHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const resolved = await resolveRequestUser(req, userClient);
    if (!resolved) return json({ error: "Unauthorized" }, 401);
    const user = { id: resolved.userId, email: resolved.email };

    // SECURITY: only run if dev_mode is globally enabled
    const { data: dm } = await admin
      .from("payment_settings")
      .select("is_active")
      .eq("provider", "dev_mode")
      .maybeSingle();
    if (!dm?.is_active) {
      return json({ error: "Entwicklermodus ist nicht aktiv." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const billing = body.billing ?? {};
    const payment_method: string =
      body.payment_method === "simulated_card" ? "simulated_card" : "simulated_paypal";
    const also_book_course_id: string | null = body.also_book_course_id ?? null;
    const rawAlsoSeats = Number(body.also_book_seats ?? 1);
    const also_book_seats = Math.max(1, Math.min(10, Number.isFinite(rawAlsoSeats) ? Math.floor(rawAlsoSeats) : 1));
    const voucher_code: string | null = body.voucher_code ?? null;
    const card_assignments: CardAssignmentInput[] = Array.isArray(body.card_assignments)
      ? body.card_assignments
      : [];
    const inlineCart: Array<{ course_id?: string; product_id?: string; card_type?: string }> | null =
      Array.isArray(body.cart) ? body.cart : null;

    // Load cart — either from cart_items or from inline body (guest flow)
    let cartItems: any[] | null = null;
    if (inlineCart && inlineCart.length > 0) {
      const courseIds = inlineCart.map((c) => c.course_id).filter(Boolean) as string[];
      const productIds = inlineCart.map((c) => c.product_id).filter(Boolean) as string[];
      const [{ data: courses }, { data: products }] = await Promise.all([
        courseIds.length
          ? admin.from("courses").select("id, title, start_time, end_time, price, location, course_type_id").in("id", courseIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length
          ? admin.from("products").select("id, name, description, price, tax_rate, kind, card_credits, card_validity_days, stock").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      cartItems = inlineCart.map((it, i) => ({
        id: `inline-${i}`,
        course_id: it.course_id ?? null,
        product_id: it.product_id ?? null,
        card_type: it.card_type ?? null,
        courses: it.course_id ? (courses ?? []).find((c: any) => c.id === it.course_id) ?? null : null,
        products: it.product_id ? (products ?? []).find((p: any) => p.id === it.product_id) ?? null : null,
      }));
    } else {
      const { data, error: cartErr } = await admin
        .from("cart_items")
        .select(
          "id, course_id, product_id, card_type, courses(title, start_time, end_time, price, location, course_type_id), products(id, name, description, price, tax_rate, kind, card_credits, card_validity_days, stock)",
        )
        .eq("user_id", user.id);
      if (cartErr) return json({ error: cartErr.message }, 500);
      cartItems = data ?? [];
    }
    if (!cartItems || cartItems.length === 0) return json({ error: "Cart is empty" }, 400);

    // Validate card assignments (only supported for logged-in cart_items flow)
    const assignedItemIds = new Set(card_assignments.map((a) => a.cart_item_id));
    let cardValidation: Awaited<ReturnType<typeof validateCardAssignments>> = {
      ok: true,
      assignments: [],
    } as any;
    if (card_assignments.length > 0 && !inlineCart) {
      cardValidation = await validateCardAssignments(
        admin,
        user.id,
        cartItems as any,
        card_assignments,
      );
      if (!cardValidation.ok) return json({ error: cardValidation.error }, 400);
    }

    // Build positions
    let subtotal = 0;
    let taxTotal = 0;
    const positions: any[] = [];
    for (const it of cartItems as CartItem[]) {
      const isCardAssigned = assignedItemIds.has(it.id);
      let name = "";
      let description: string | null = null;
      let unit_price = 0;
      const tax_rate = 0; // Kleinunternehmer §19 UStG – keine USt
      let item_type: "product" | "course_booking" | "class_card" = "product";
      const product_id: string | null = it.product_id;
      const course_id: string | null = it.course_id;

      if (it.products) {
        name = it.products.name;
        description = it.products.description;
        unit_price = Number(it.products.price);
        item_type = it.products.kind === "class_card" ? "class_card" : "product";
        if (it.products.stock !== null && it.products.stock <= 0) {
          return json({ error: `Ausverkauft: ${it.products.name}` }, 400);
        }
      } else if (it.courses) {
        name = it.courses.title;
        description = isCardAssigned
          ? "Kursbuchung (per Gruppenkarte)"
          : "Kursbuchung am " + it.courses.start_time;
        unit_price = isCardAssigned ? 0 : Number(it.courses.price);
        item_type = "course_booking";
      } else if (it.card_type) {
        name = it.card_type === "five" ? "5er-Karte" : "10er-Karte";
        unit_price = it.card_type === "five" ? 70 : 120;
        item_type = "class_card";
      }
      const line_total = unit_price;
      const net = line_total / (1 + tax_rate / 100);
      const tax = line_total - net;
      subtotal += net;
      taxTotal += tax;
      positions.push({
        product_id, course_id, course_type_id: it.courses?.course_type_id ?? null, item_type, name, description,
        quantity: 1, unit_price, tax_rate, line_total,
        _cart_item_id: it.id, _card_assigned: isCardAssigned,
      });
    }

    // Capacity check per course (multiple bookings for same course allowed)
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
    const simPaymentId = `SIMULATED-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Create order (already paid)
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        status: "paid",
        subtotal: subtotal.toFixed(2),
        tax_total: taxTotal.toFixed(2),
        total: total.toFixed(2),
        payment_method,
        payment_id: simPaymentId,
        paid_at: new Date().toISOString(),
        voucher_id: voucherId,
        voucher_code: voucherCodeStored,
        discount_amount: discountAmount.toFixed(2),
        card_assignments: cardValidation.assignments && cardValidation.assignments.length > 0
          ? (cardValidation.assignments as any)
          : null,
        notes: JSON.stringify({ simulated: true, also_book_course_id, also_book_seats }),
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
    await admin.from("order_items").insert(itemsPayload);

    // Redeem card assignments first (atomic)
    if (cardValidation.assignments && cardValidation.assignments.length > 0) {
      const redeem = await redeemCardAssignments(admin, user.id, cardValidation.assignments);
      if (!redeem.ok) {
        await admin.from("order_items").delete().eq("order_id", order.id);
        await admin.from("orders").delete().eq("id", order.id);
        return json({ error: redeem.error }, 400);
      }
    }

    // Fulfill remaining (non-card) positions
    for (const p of positions) {
      if (p._card_assigned) continue;
      if (p.item_type === "course_booking" && p.course_id) {
        await admin.from("bookings").insert({
          user_id: user.id,
          course_id: p.course_id,
          status: "confirmed",
          amount_paid: p.unit_price,
          payment_method,
          payment_id: simPaymentId,
          paid_with_card: false,
        });
      } else if (p.item_type === "class_card") {
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
        const expires = new Date();
        expires.setDate(expires.getDate() + validityDays);
        const { data: newCard } = await admin
          .from("class_cards")
          .insert({
            user_id: user.id,
            card_type: cardType,
            total_credits: credits,
            remaining_credits: credits,
            amount_paid: p.unit_price,
            payment_method,
            payment_id: simPaymentId,
            expires_at: expires.toISOString(),
          })
          .select()
          .single();

        if (also_book_course_id && newCard) {
          for (let s = 0; s < also_book_seats; s++) {
            await admin.from("bookings").insert({
              user_id: user.id,
              course_id: also_book_course_id,
              status: "confirmed",
              amount_paid: 0,
              paid_with_card: true,
              card_id: newCard.id,
            });
            await admin.rpc("consume_class_card_credit", { _card_id: newCard.id });
          }
        }

      } else if (p.item_type === "product" && p.product_id) {
        const prod = (cartItems as CartItem[]).find(
          (c) => c.products?.id === p.product_id,
        )?.products;
        if (prod && prod.stock !== null) {
          await admin
            .from("products")
            .update({ stock: Math.max(0, prod.stock - 1) })
            .eq("id", prod.id);
        }
      }
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

    // Generate invoice
    let invoice_pdf_url: string | undefined;
    try {
      const invRes = await fetch(`${supabaseUrl}/functions/v1/generate-invoice`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ order_id: order.id }),
      });
      const invJson = await invRes.json().catch(() => ({}));
      invoice_pdf_url = invJson.signed_url;
    } catch (_e) {}

    // E-Mails
    try {
      const methodLabel = payment_method === "simulated_card" ? "Kreditkarte (Test)" : "PayPal (Test)";
      const bookingItems = positions.filter((p) => p.item_type === "course_booking" && p.course_id);
      for (const p of bookingItems) {
        const { data: full } = await admin
          .from("courses")
          .select("title, start_time, end_time, location, instructor:trainers(first_name, last_name)")
          .eq("id", p.course_id)
          .maybeSingle();
        await triggerCustomerEmail(admin, {
          user_id: user.id,
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
            payment_method: methodLabel,
            amount_paid: formatMoney(Number(p.unit_price ?? 0)),
          },
        });
      }
      const cardItems = positions.filter((p) => p.item_type === "class_card");
      for (const p of cardItems) {
        await triggerCustomerEmail(admin, {
          user_id: user.id,
          trigger_key: "card_purchased",
          idempotency_key: `card-${order.id}-${p.name}`,
          data: {
            card_type: p.name,
            credits: String(p.name?.includes("10") ? 10 : 5),
            expires_at: formatDate(new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()),
            amount_paid: formatMoney(Number(p.unit_price ?? 0)),
          },
        });
      }
      await triggerCustomerEmail(admin, {
        user_id: user.id,
        trigger_key: "order_confirmation",
        idempotency_key: `order-${order.id}`,
        data: {
          order_number: order.order_number ?? order.id,
          order_total: formatMoney(Number(order.total ?? 0)),
          invoice_url: invoice_pdf_url ?? "#",
        },
      });
    } catch (e) {
      console.warn("[email] simulate-payment trigger failed", e);
    }

    return json({
      ok: true,
      simulated: true,
      order_id: order.id,
      order_number: order.order_number,
      invoice_pdf_url,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
