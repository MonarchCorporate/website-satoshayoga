// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { getPaypalAccessToken, loadPaypalConfig, paypalBaseUrl } from "../_shared/paypal.ts";
import { resolveVoucher, buildCartFromPositions } from "../_shared/voucher.ts";
import { resolveRequestUser } from "../_shared/guest-token.ts";
import { validateCardAssignments, type CardAssignmentInput } from "../_shared/card-redeem.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-token",
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const guestHeader = req.headers.get("x-guest-token");
    if (!authHeader && !guestHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = __env("SUPABASE_URL")!;
    const anonKey = __env("SUPABASE_ANON_KEY")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const resolved = await resolveRequestUser(req, userClient);
    if (!resolved) return json({ error: "Unauthorized" }, 401);
    const user = { id: resolved.userId, email: resolved.email };

    const body = await req.json().catch(() => ({}));
    const billing = body.billing ?? {};
    const also_book_course_id: string | null = body.also_book_course_id ?? null;
    const rawAlsoSeats = Number(body.also_book_seats ?? 1);
    const also_book_seats = Math.max(1, Math.min(10, Number.isFinite(rawAlsoSeats) ? Math.floor(rawAlsoSeats) : 1));
    const return_url: string = body.return_url;
    const cancel_url: string = body.cancel_url;
    const voucher_code: string | null = body.voucher_code ?? null;
    const inlineCart: Array<{ course_id?: string; product_id?: string; card_type?: string }> | null =
      Array.isArray(body.cart) ? body.cart : null;
    const card_assignments: CardAssignmentInput[] = Array.isArray(body.card_assignments)
      ? body.card_assignments
      : [];
    if (!return_url || !cancel_url) return json({ error: "return_url and cancel_url required" }, 400);


    // Load cart — either from cart_items or from inline body (guest flow)
    let cartItems: any[] | null = null;
    if (inlineCart && inlineCart.length > 0) {
      const courseIds = inlineCart.map((c) => c.course_id).filter(Boolean) as string[];
      const productIds = inlineCart.map((c) => c.product_id).filter(Boolean) as string[];
      const [{ data: courses }, { data: products }] = await Promise.all([
        courseIds.length
          ? admin.from("courses").select("id, title, start_time, price, course_type_id").in("id", courseIds)
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
          "id, course_id, product_id, card_type, courses(title, start_time, price, course_type_id), products(id, name, description, price, tax_rate, kind, card_credits, card_validity_days, stock)",
        )
        .eq("user_id", user.id);
      if (cartErr) return json({ error: cartErr.message }, 500);
      cartItems = data ?? [];
    }
    if (!cartItems || cartItems.length === 0) return json({ error: "Cart is empty" }, 400);

    // Validate card assignments (only for logged-in / cart_items flow)
    const assignedItemIds = new Set(card_assignments.map((a) => a.cart_item_id));
    let cardValidation: any = { ok: true, assignments: [] };
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

    // Capacity check: sum requested seats per course (incl. also_book_course_id).
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
        .select("title, max_participants, booking_opens_immediately, booking_opens_at")
        .eq("id", cid)
        .maybeSingle();
      if (
        cRow?.booking_opens_immediately === false &&
        cRow?.booking_opens_at &&
        new Date(cRow.booking_opens_at) > new Date()
      ) {
        return json({
          error: `"${cRow.title}" ist noch nicht buchbar (Buchung ab ${new Date(cRow.booking_opens_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}).`,
        }, 400);
      }
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

    // PayPal order
    const cfg = await loadPaypalConfig(admin);
    const accessToken = await getPaypalAccessToken(cfg);

    const ppRes = await fetch(`${paypalBaseUrl(cfg.mode)}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "EUR", value: total.toFixed(2) },
            description: positions.map((p) => p.name).join(", ").slice(0, 127),
          },
        ],
        application_context: {
          brand_name: "Santosha Yoga",
          user_action: "PAY_NOW",
          return_url,
          cancel_url,
        },
      }),
    });
    const ppData = await ppRes.json();
    if (!ppRes.ok) {
      return json({ error: "PayPal order creation failed", details: ppData }, 500);
    }
    const paypal_order_id = ppData.id as string;
    const approveLink = (ppData.links ?? []).find((l: any) => l.rel === "approve");
    if (!approveLink) return json({ error: "PayPal approve link missing" }, 500);

    // Local order (pending)
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending",
        subtotal: subtotal.toFixed(2),
        tax_total: taxTotal.toFixed(2),
        total: total.toFixed(2),
        payment_method: "paypal",
        payment_id: paypal_order_id,
        voucher_id: voucherId,
        voucher_code: voucherCodeStored,
        discount_amount: discountAmount.toFixed(2),
        card_assignments: cardValidation.assignments && cardValidation.assignments.length > 0
          ? (cardValidation.assignments as any)
          : null,
        notes: also_book_course_id ? JSON.stringify({ also_book_course_id, also_book_seats }) : null,
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

    return json({
      order_id: order.id,
      paypal_order_id,
      approve_url: approveLink.href,
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
