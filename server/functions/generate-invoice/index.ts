// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export default (async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = __env("SUPABASE_URL")!;
    const serviceKey = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id required" }, 400);

    const { data: order, error: oErr } = await admin
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .single();
    if (oErr || !order) return json({ error: "Order not found" }, 404);

    const { data: items } = await admin
      .from("order_items")
      .select("*")
      .eq("order_id", order_id);

    // Load company settings (singleton)
    const { data: company } = await admin
      .from("company_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    const c = company ?? ({} as any);

    // Assign invoice number if not set
    let invoiceNumber = order.invoice_number as string | null;
    if (!invoiceNumber) {
      const { data: numData } = await admin.rpc("next_number", { _scope: "invoice" });
      invoiceNumber = numData as string;
    }

    // Build PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const draw = (
      text: string,
      x: number,
      y: number,
      size = 10,
      f = font,
      color = rgb(0.1, 0.1, 0.1)
    ) => page.drawText(text, { x, y, size, font: f, color });

    const companyName = c.company_name ?? "Santosha Yoga by Tessa";

    // Header
    draw(companyName, 40, 800, 16, bold);
    draw("Rechnung", 40, 770, 22, bold, rgb(0.78, 0.66, 0.49));

    // Right block (invoice meta)
    draw(`Rechnungs-Nr.: ${invoiceNumber}`, 380, 800, 10, bold);
    draw(`Datum: ${new Date().toLocaleDateString("de-DE")}`, 380, 786);
    draw(`Bestell-Nr.: ${order.order_number}`, 380, 772);

    // Sender line above billing block (small absender)
    const senderParts = [
      c.company_name,
      c.street,
      [c.postal_code, c.city].filter(Boolean).join(" "),
    ].filter(Boolean).join(" · ");
    if (senderParts) {
      draw(senderParts, 40, 736, 8, font, rgb(0.4, 0.4, 0.4));
      page.drawLine({
        start: { x: 40, y: 732 },
        end: { x: 300, y: 732 },
        thickness: 0.3,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    // Billing block
    draw("Rechnungsadresse:", 40, 720, 10, bold);
    draw(
      `${order.billing_first_name ?? ""} ${order.billing_last_name ?? ""}`.trim(),
      40,
      706,
    );
    if (order.billing_street) draw(order.billing_street, 40, 692);
    draw(
      `${order.billing_postal_code ?? ""} ${order.billing_city ?? ""}`.trim(),
      40,
      678,
    );
    if (order.billing_country) draw(order.billing_country, 40, 664);
    if (order.billing_email) draw(order.billing_email, 40, 650);

    // Items table header
    let y = 600;
    draw("Pos", 40, y, 10, bold);
    draw("Bezeichnung", 80, y, 10, bold);
    draw("Menge", 380, y, 10, bold);
    draw("Einzel", 450, y, 10, bold);
    draw("Summe", 510, y, 10, bold);
    y -= 8;
    page.drawLine({
      start: { x: 40, y },
      end: { x: 555, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 14;

    let pos = 1;
    for (const it of items ?? []) {
      draw(String(pos), 40, y);
      const name = (it.name ?? "").substring(0, 45);
      draw(name, 80, y);
      draw(String(it.quantity), 385, y);
      draw(`${Number(it.unit_price).toFixed(2)} €`, 445, y);
      draw(`${Number(it.line_total).toFixed(2)} €`, 505, y);
      y -= 16;
      pos++;
    }

    y -= 10;
    page.drawLine({
      start: { x: 340, y },
      end: { x: 555, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
    y -= 16;

    const discount = Number(order.discount_amount ?? 0);
    const grossBeforeDiscount = Number(order.total ?? 0) + discount;
    if (discount > 0) {
      draw("Zwischensumme:", 380, y, 10);
      draw(`${grossBeforeDiscount.toFixed(2)} €`, 505, y, 10);
      y -= 14;
      const label = order.voucher_code ? `Gutschein (${order.voucher_code}):` : "Rabatt:";
      draw(label, 380, y, 10);
      draw(`−${discount.toFixed(2)} €`, 505, y, 10);
      y -= 14;
    }

    draw("Gesamt:", 400, y, 12, bold);
    draw(`${Number(order.total).toFixed(2)} €`, 505, y, 12, bold);
    y -= 18;
    draw("Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.", 40, y, 9);

    // Footer with company info
    let fy = 180;
    draw(`Zahlungsmethode: ${order.payment_method === "invoice" ? "Auf Rechnung" : (order.payment_method ?? "-")}`, 40, fy);
    fy -= 14;
    const invoicePaymentDays = Number(c.invoice_payment_days ?? 14);
    if (order.payment_method === "invoice" && order.status !== "paid") {
      const due = new Date();
      due.setDate(due.getDate() + invoicePaymentDays);
      const dueStr = due.toLocaleDateString("de-DE");
      const bankInfo = c.iban
        ? `Bitte überweise den Betrag bis ${dueStr} auf: ${c.bank_name ?? ""} · IBAN ${c.iban}${c.bic ? " · BIC " + c.bic : ""} · Verwendungszweck: ${order.order_number}`
        : `Bitte überweise den Betrag bis ${dueStr}. Verwendungszweck: ${order.order_number}`;
      draw(bankInfo.substring(0, 130), 40, fy);
      fy -= 14;
    } else if (order.paid_at) {
      draw(`Bezahlt am: ${new Date(order.paid_at).toLocaleDateString("de-DE")}`, 40, fy);
      fy -= 14;
    }


    // Footer block: company contact + tax IDs
    let footerY = 90;
    const footerParts: string[] = [];
    if (c.owner_name) footerParts.push(c.owner_name);
    if (c.street) footerParts.push(c.street);
    if (c.postal_code || c.city) footerParts.push(`${c.postal_code ?? ""} ${c.city ?? ""}`.trim());
    if (c.country) footerParts.push(c.country);
    if (footerParts.length) {
      draw(footerParts.join(" · ").substring(0, 110), 40, footerY, 8, font, rgb(0.45, 0.45, 0.45));
      footerY -= 11;
    }
    const contactParts: string[] = [];
    if (c.email) contactParts.push(c.email);
    if (c.phone) contactParts.push(c.phone);
    if (c.website) contactParts.push(c.website);
    if (contactParts.length) {
      draw(contactParts.join(" · ").substring(0, 110), 40, footerY, 8, font, rgb(0.45, 0.45, 0.45));
      footerY -= 11;
    }
    const taxParts: string[] = [];
    if (c.tax_number) taxParts.push(`Steuer-Nr.: ${c.tax_number}`);
    if (c.tax_id) taxParts.push(`USt-IdNr.: ${c.tax_id}`);
    if (taxParts.length) {
      draw(taxParts.join(" · ").substring(0, 110), 40, footerY, 8, font, rgb(0.45, 0.45, 0.45));
      footerY -= 11;
    }
    if (c.invoice_footer) {
      draw(c.invoice_footer.substring(0, 110), 40, footerY, 8, font, rgb(0.45, 0.45, 0.45));
      footerY -= 11;
    }
    draw(
      `${companyName} · Vielen Dank für Ihren Auftrag!`,
      40,
      40,
      9,
      font,
      rgb(0.5, 0.5, 0.5),
    );


    const pdfBytes = await pdfDoc.save();
    const path = `${order.user_id}/${order.id}-${invoiceNumber}.pdf`;

    const { error: upErr } = await admin.storage
      .from("invoices")
      .upload(path, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (upErr) return json({ error: upErr.message }, 500);

    await admin
      .from("orders")
      .update({
        invoice_number: invoiceNumber,
        invoice_pdf_path: path,
        invoice_issued_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    const { data: signed } = await admin.storage
      .from("invoices")
      .createSignedUrl(path, 60 * 60);

    // Rechnung per E-Mail mit PDF-Anhang senden
    const recipientEmail = order.billing_email;
    if (recipientEmail) {
      try {
        // PDF -> base64
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < pdfBytes.length; i += chunkSize) {
          binary += String.fromCharCode(...pdfBytes.subarray(i, i + chunkSize));
        }
        const b64 = btoa(binary);

        const isInvoicePayment = order.payment_method === "invoice" && order.status !== "paid";
        const dueDays = Number((company ?? {}).invoice_payment_days ?? 14);
        const due = new Date();
        due.setDate(due.getDate() + dueDays);
        const dueStr = due.toLocaleDateString("de-DE");
        const bankHtml = (c.iban)
          ? `<p><strong>Bankverbindung:</strong><br>${c.bank_name ?? ""}<br>IBAN: ${c.iban}${c.bic ? "<br>BIC: " + c.bic : ""}<br>Verwendungszweck: ${order.order_number}</p>`
          : "";
        const introHtml = isInvoicePayment
          ? `<p>Vielen Dank für deine Bestellung!</p>
             <p>Anbei findest du deine Rechnung <strong>${invoiceNumber}</strong> zur Bestellung <strong>${order.order_number}</strong>.</p>
             <p>Bitte überweise den Betrag von <strong>${Number(order.total).toFixed(2)} €</strong> bis zum <strong>${dueStr}</strong> auf das unten angegebene Konto.</p>
             ${bankHtml}
             <p><em>Bei Kauf einer Karte oder Kursbuchung: Deine Karte bzw. Buchung wird nach Zahlungseingang automatisch freigeschaltet.</em></p>`
          : `<p>Vielen Dank für deine Bestellung!</p>
             <p>Anbei findest du deine Rechnung <strong>${invoiceNumber}</strong> zur Bestellung <strong>${order.order_number}</strong>.</p>`;
        const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:16px">
          <h2 style="color:#c7a97c">Deine Rechnung</h2>
          ${introHtml}
          <p style="font-size:12px;color:#666">Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
          <p style="font-size:11px;color:#888">Santosha Yoga · Tessa Ratke · Querweg 12 · 25746 Süderholm</p>
        </body></html>`;

        await admin.functions.invoke("send-email-smtp", {
          body: {
            to: recipientEmail,
            subject: `Rechnung ${invoiceNumber} · Santosha Yoga`,
            html,
            trigger_key: isInvoicePayment ? "invoice_created" : "invoice_receipt",
            source: "transactional",
            metadata: { order_id: order.id, invoice_number: invoiceNumber },
            attachments: [
              {
                filename: `Rechnung-${invoiceNumber}.pdf`,
                content_base64: b64,
                content_type: "application/pdf",
              },
            ],
          },
        });
      } catch (mailErr) {
        console.warn("invoice email send failed", mailErr);
      }
    }

    return json({
      ok: true,
      invoice_number: invoiceNumber,
      path,
      signed_url: signed?.signedUrl,
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
