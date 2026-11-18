// Ported from supabase/functions (Deno) by scripts/port_functions.py
import { __env } from "../../src/fn-env";
import { createClient } from "../../src/supabase-server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default (async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = __env("SUPABASE_URL")!;
    const svc = __env("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = __env("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, svc);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id);
    if (!roles?.some((r) => r.role === "admin")) return json({ error: "Nur Admin" }, 403);

    const { payout_id, action } = await req.json();
    if (!payout_id) return json({ error: "payout_id required" }, 400);

    const { data: payout, error: pErr } = await admin
      .from("trainer_payouts").select("*").eq("id", payout_id).single();
    if (pErr || !payout) return json({ error: "Payout not found" }, 404);

    if (action === "reject") {
      await admin.from("trainer_payouts").update({ status: "rejected" }).eq("id", payout_id);
      await admin.from("trainer_earnings")
        .update({ status: "pending", payout_id: null })
        .eq("payout_id", payout_id);
      return json({ ok: true });
    }

    // Approve: build PDF
    const { data: earnings } = await admin
      .from("trainer_earnings")
      .select("id, amount, participants_count, course_date, course_id")
      .eq("payout_id", payout_id);

    const courseIds = (earnings ?? []).map((e) => e.course_id);
    const { data: courses } = courseIds.length
      ? await admin.from("courses").select("id, title").in("id", courseIds)
      : { data: [] as any[] };
    const courseMap = new Map((courses ?? []).map((c) => [c.id, c.title]));

    const { data: company } = await admin
      .from("company_settings").select("*").eq("singleton", true).maybeSingle();
    const c = company ?? ({} as any);
    const snap: any = payout.trainer_snapshot ?? {};

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (t: string, x: number, y: number, s = 10, f = font, col = rgb(0.1, 0.1, 0.1)) =>
      page.drawText(t, { x, y, size: s, font: f, color: col });

    // Header: trainer is the issuer
    draw(`${snap.first_name ?? ""} ${snap.last_name ?? ""}`.trim(), 40, 800, 14, bold);
    if (snap.street) draw(snap.street, 40, 786);
    draw(`${snap.postal_code ?? ""} ${snap.city ?? ""}`.trim(), 40, 772);
    if (snap.country) draw(snap.country, 40, 758);
    if (snap.email) draw(snap.email, 40, 744);

    // Recipient: company
    draw("Rechnung an:", 340, 786, 9, bold);
    draw(c.company_name ?? "Santosha Yoga by Tessa", 340, 772);
    if (c.street) draw(c.street, 340, 758);
    draw(`${c.postal_code ?? ""} ${c.city ?? ""}`.trim(), 340, 744);
    if (c.country) draw(c.country, 340, 730);

    // Title
    draw("Honorarrechnung", 40, 700, 20, bold, rgb(0.78, 0.66, 0.49));
    draw(`Rechnungs-Nr.: ${payout.payout_number}`, 40, 678, 10, bold);
    draw(`Datum: ${new Date().toLocaleDateString("de-DE")}`, 40, 664);
    draw(
      `Zeitraum: ${new Date(payout.period_start).toLocaleDateString("de-DE")} – ${new Date(payout.period_end).toLocaleDateString("de-DE")}`,
      40, 650,
    );

    // Items
    let y = 610;
    draw("Pos", 40, y, 10, bold);
    draw("Kurs", 75, y, 10, bold);
    draw("Datum", 305, y, 10, bold);
    draw("TN", 380, y, 10, bold);
    draw("Vergütung", 480, y, 10, bold);
    y -= 6;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 14;

    let pos = 1;
    for (const e of earnings ?? []) {
      draw(String(pos), 40, y);
      draw((courseMap.get(e.course_id) ?? "Kurs").substring(0, 38), 75, y);
      draw(new Date(e.course_date).toLocaleDateString("de-DE"), 305, y);
      draw(String(e.participants_count), 385, y);
      draw(`${Number(e.amount).toFixed(2)} €`, 485, y);
      y -= 14;
      pos++;
      if (y < 200) { y = 780; pdf.addPage([595, 842]); }
    }

    y -= 10;
    page.drawLine({ start: { x: 340, y }, end: { x: 555, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 16;
    draw("Netto:", 400, y);
    draw(`${Number(payout.subtotal).toFixed(2)} €`, 505, y);
    if (Number(payout.vat_rate) > 0) {
      y -= 14;
      draw(`USt (${payout.vat_rate}%):`, 400, y);
      draw(`${Number(payout.vat_amount).toFixed(2)} €`, 505, y);
    }
    y -= 16;
    draw("Gesamt:", 400, y, 12, bold);
    draw(`${Number(payout.total).toFixed(2)} €`, 505, y, 12, bold);

    if (snap.is_small_business) {
      y -= 30;
      draw(
        "Gemäß §19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmer).",
        40, y, 9, font, rgb(0.4, 0.4, 0.4),
      );
    }

    // Bank / tax footer
    let fy = 120;
    if (snap.iban) {
      draw(`Bankverbindung: ${snap.bank_name ?? ""} · IBAN ${snap.iban}${snap.bic ? " · BIC " + snap.bic : ""}`,
        40, fy, 9, font, rgb(0.4, 0.4, 0.4));
      fy -= 12;
    }
    const taxParts: string[] = [];
    if (snap.tax_number) taxParts.push(`Steuer-Nr.: ${snap.tax_number}`);
    if (snap.tax_id) taxParts.push(`USt-IdNr.: ${snap.tax_id}`);
    if (taxParts.length) {
      draw(taxParts.join(" · "), 40, fy, 9, font, rgb(0.4, 0.4, 0.4));
      fy -= 12;
    }

    const bytes = await pdf.save();
    const path = `${payout.trainer_id}/${payout.payout_number}.pdf`;
    const { error: upErr } = await admin.storage
      .from("trainer-payouts")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) return json({ error: upErr.message }, 500);

    await admin.from("trainer_payouts").update({
      status: "approved",
      pdf_path: path,
      approved_at: new Date().toISOString(),
      approved_by: userRes.user.id,
    }).eq("id", payout_id);

    await admin.from("trainer_earnings")
      .update({ status: "approved" })
      .eq("payout_id", payout_id);

    const { data: signed } = await admin.storage
      .from("trainer-payouts").createSignedUrl(path, 3600);

    return json({ ok: true, path, signed_url: signed?.signedUrl });
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
