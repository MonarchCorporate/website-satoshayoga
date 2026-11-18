import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CheckCircle2, Download, FlaskConical, Ticket, X } from "lucide-react";
import { PrivacyConsent } from "@/components/PrivacyConsent";

type CartItem = {
  id: string;
  course_id: string | null;
  product_id: string | null;
  card_type: string | null;
  courses?: {
    title: string;
    start_time: string;
    price: number;
    class_cards_allowed: boolean | null;
  } | null;
  products?: {
    name: string;
    price: number;
    tax_rate: number;
    kind: string;
  } | null;
};

type ClassCard = {
  id: string;
  card_type: string;
  remaining_credits: number;
  expires_at: string | null;
};

type Step = "address" | "payment" | "review" | "done";

type AppliedVoucher = {
  voucher_id: string;
  code: string;
  discount_percent: number;
  discount_amount: number;
  applicable_amount: number;
};

const VOUCHER_KEY = "appliedVoucher";

export default function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("address");
  const [submitting, setSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    order_number: string;
    invoice_pdf_url?: string;
  } | null>(null);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);

  const [address, setAddress] = useState({
    first_name: "",
    last_name: "",
    email: user?.email ?? "",
    phone: "",
    street: "",
    postal_code: "",
    city: "",
    country: "Deutschland",
  });
  const [payment, setPayment] = useState<
    "paypal" | "invoice" | "simulated_paypal" | "simulated_card"
  >("paypal");
  const invoiceDays = 14;

  const [devMode, setDevMode] = useState(false);
  const [paypalEnabled, setPaypalEnabled] = useState(false);
  const [cards, setCards] = useState<ClassCard[]>([]);
  // cart_item_id -> card_id | ""
  const [cardAssignments, setCardAssignments] = useState<Record<string, string>>({});
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOUCHER_KEY);
      if (raw) setVoucher(JSON.parse(raw));
    } catch {}
    supabase.functions.invoke("dev-mode-status").then(({ data }) => {
      const enabled = !!(data as any)?.enabled;
      setDevMode(enabled);
      if (enabled) setPayment("simulated_paypal");
    });
    supabase.functions.invoke("paypal-public-status").then(({ data }) => {
      const enabled = !!(data as any)?.enabled;
      setPaypalEnabled(enabled);
      if (!enabled) setPayment((p) => (p === "paypal" ? "invoice" : p));
    });
  }, []);





  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [cartRes, profileRes, cardsRes] = await Promise.all([
        supabase
          .from("cart_items")
          .select(
            "id, course_id, product_id, card_type, courses(title, start_time, price, class_cards_allowed, direct_trainer_booking), products(name, price, tax_rate, kind)"
          )
          .eq("user_id", user.id),
        supabase
          .from("profiles")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("class_cards")
          .select("id, card_type, remaining_credits, expires_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .gt("remaining_credits", 0),

      ]);
      {
        const all = (cartRes.data as any[]) ?? [];
        const blocked = all.filter((i) => i.courses?.direct_trainer_booking);
        if (blocked.length) {
          await supabase.from("cart_items").delete().in("id", blocked.map((i) => i.id));
          toast.info(`${blocked.map((i) => i.courses.title).join(", ")}: nur direkt bei Trainer:in buchbar – entfernt.`);
        }
        setItems(all.filter((i) => !i.courses?.direct_trainer_booking));
      }
      const validCards = ((cardsRes.data as any[]) ?? []).filter(
        (c) => !c.expires_at || new Date(c.expires_at) > new Date(),
      );
      setCards(validCards);
      const p = profileRes.data as any;
      if (p) {
        setAddress((a) => ({
          ...a,
          first_name: p.first_name ?? "",
          last_name: p.last_name ?? "",
          email: p.email ?? user.email ?? "",
          phone: p.phone ?? "",
          street: p.street ?? "",
          postal_code: p.postal_code ?? "",
          city: p.city ?? "",
          country: p.country ?? "Deutschland",
        }));
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const isAssignedWithCard = (i: CartItem) =>
    !!i.course_id && !!cardAssignments[i.id];

  const itemPrice = (i: CartItem) => {
    if (isAssignedWithCard(i)) return 0;
    return i.products
      ? Number(i.products.price)
      : i.courses
      ? Number(i.courses.price)
      : i.card_type === "five"
      ? 70
      : i.card_type === "ten"
      ? 120
      : 0;
  };
  // Kleinunternehmer §19 UStG – keine MwSt ausgewiesen
  const itemTax = (_i: CartItem) => 0;

  // Track per-card usage so users can't over-assign a single card
  const cardUsage = Object.entries(cardAssignments).reduce<Record<string, number>>(
    (acc, [, cardId]) => {
      if (!cardId) return acc;
      acc[cardId] = (acc[cardId] ?? 0) + 1;
      return acc;
    },
    {},
  );
  const cardOverdrawn = cards.some((c) => (cardUsage[c.id] ?? 0) > c.remaining_credits);

  const eligibleCardItems = items.filter(
    (i) => i.course_id && i.courses && i.courses.class_cards_allowed !== false,
  );

  const grossTotal = items.reduce((s, i) => s + itemPrice(i), 0);
  const discount = voucher ? Math.min(voucher.discount_amount, grossTotal) : 0;
  const total = Math.max(0, grossTotal - discount);
  const subtotal = items.reduce((s, i) => {
    const r = itemTax(i);
    return s + itemPrice(i) / (1 + r / 100);
  }, 0);
  const taxTotal = total - subtotal;

  const assignmentsPayload = () =>
    Object.entries(cardAssignments)
      .filter(([, cardId]) => !!cardId)
      .map(([cart_item_id, card_id]) => ({ cart_item_id, card_id }));

  const saveAddressAndContinue = async () => {
    if (!address.first_name || !address.last_name || !address.email) {
      toast.error("Bitte fülle alle Pflichtfelder aus.");
      return;
    }
    if (user) {
      await supabase
        .from("profiles")
        .update({
          first_name: address.first_name,
          last_name: address.last_name,
          email: address.email,
          phone: address.phone,
          street: address.street,
          postal_code: address.postal_code,
          city: address.city,
          country: address.country,
        })
        .eq("user_id", user.id);
    }
    setStep("payment");
  };

  const clearVoucher = () => {
    setVoucher(null);
    localStorage.removeItem(VOUCHER_KEY);
  };

  const buildCartPayload = () =>
    items.map((it) => {
      if (it.products) {
        const isCard = it.products.kind === "class_card";
        return {
          type: isCard ? "card" : "product",
          ref_id: it.product_id,
          amount: Number(it.products.price),
        };
      }
      if (it.courses) {
        return {
          type: "course",
          ref_id: it.course_id,
          amount: Number(it.courses.price),
        };
      }
      return {
        type: "card",
        ref_id: it.card_type,
        amount: it.card_type === "five" ? 70 : 120,
      };
    });

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return;
    setVoucherValidating(true);
    const { data, error } = await (supabase as any).rpc("validate_voucher_cart", {
      _code: voucherCode.trim(),
      _cart: buildCartPayload(),
    });
    setVoucherValidating(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    const r = data as any;
    if (!r?.ok) {
      toast.error(r?.error ?? "Code ungültig.");
      return;
    }
    const av: AppliedVoucher = {
      voucher_id: r.voucher_id,
      code: r.code,
      discount_percent: Number(r.discount_percent),
      discount_amount: Number(r.discount_amount),
      applicable_amount: Number(r.applicable_amount),
    };
    setVoucher(av);
    localStorage.setItem(VOUCHER_KEY, JSON.stringify(av));
    setVoucherCode("");
    toast.success(`Gutschein „${av.code}" eingelöst – ${av.discount_amount.toFixed(2)} € Rabatt.`);
  };

  const placeOrder = async () => {
    if (cardOverdrawn) {
      toast.error("Eine Karte wurde häufiger vergeben als Credits vorhanden sind.");
      return;
    }
    if (!privacyAccepted) {
      toast.error("Bitte stimme der Datenschutzerklärung zu.");
      return;
    }
    setSubmitting(true);
    const voucher_code = voucher?.code ?? null;
    const card_assignments = assignmentsPayload();

    // If everything is paid by cards → skip PayPal, use create-order with "invoice" marker
    // (marks as paid automatically because total = 0). Bei explizit gewählter Zahlung "invoice"
    // wird Kauf auf Rechnung durchgeführt (Bestellung bleibt "offen" bis manuell freigegeben).
    const effectivePayment = total === 0 ? "invoice" : payment;


    if (effectivePayment === "simulated_paypal" || effectivePayment === "simulated_card") {
      const { data, error } = await supabase.functions.invoke("simulate-payment", {
        body: { billing: address, payment_method: effectivePayment, voucher_code, card_assignments },
      });
      setSubmitting(false);
      if (error || !data?.order_number) {
        toast.error("Simulation fehlgeschlagen: " + (error?.message ?? data?.error ?? ""));
        return;
      }
      clearVoucher();
      setOrderResult({
        order_number: data.order_number,
        invoice_pdf_url: data.invoice_pdf_url,
      });
      setStep("done");
      return;
    }
    if (effectivePayment === "paypal") {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-paypal-order", {
        body: {
          billing: address,
          return_url: `${origin}/checkout/return`,
          cancel_url: `${origin}/checkout/cancel`,
          voucher_code,
          card_assignments,
        },
      });
      setSubmitting(false);
      if (error || !data?.approve_url) {
        toast.error("PayPal-Bestellung fehlgeschlagen: " + (error?.message ?? data?.error ?? "Unbekannter Fehler"));
        return;
      }
      window.location.href = data.approve_url;
      return;
    }
    const { data, error } = await supabase.functions.invoke("create-order", {
      body: {
        billing: address,
        payment_method: effectivePayment,
        voucher_code,
        card_assignments,
      },
    });
    setSubmitting(false);
    if (error || !data?.order_number) {
      toast.error("Bestellung fehlgeschlagen: " + (error?.message ?? "Unbekannter Fehler"));
      return;
    }
    clearVoucher();
    setOrderResult({
      order_number: data.order_number,
      invoice_pdf_url: data.invoice_pdf_url,
    });
    setStep("done");
  };

  if (!user) {
    return (
      <div className="container py-12 text-center">
        <p className="text-muted-foreground">Bitte melde dich an.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="container py-12 text-center text-muted-foreground">Laden…</div>;
  }
  if (items.length === 0 && step !== "done") {
    return (
      <div className="container py-12 text-center space-y-4">
        <p className="text-muted-foreground">Dein Warenkorb ist leer.</p>
        <Button onClick={() => navigate("/shop")}>Zum Shop</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-4xl font-semibold mb-6 text-center">Kasse</h1>

      <div className="flex justify-center gap-2 mb-8 text-sm">
        {(["address", "payment", "review"] as Step[]).map((s, idx) => (
          <div
            key={s}
            className={`px-3 py-1 rounded-full ${
              step === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {idx + 1}.{" "}
            {s === "address" ? "Adresse" : s === "payment" ? "Zahlung" : "Übersicht"}
          </div>
        ))}
      </div>

      {step !== "done" && (
        <Card className="mb-6 border-primary/30">
          <CardContent className="p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Zwischensumme</span>
              <span>{grossTotal.toFixed(2)} €</span>
            </div>
            {voucher && discount > 0 && (
              <div className="flex justify-between text-primary">
                <span className="flex items-center gap-1">
                  <Ticket className="h-3.5 w-3.5" />
                  Gutschein ({voucher.code} · {voucher.discount_percent}%)
                </span>
                <span>−{discount.toFixed(2)} €</span>
              </div>
            )}
            {Object.values(cardAssignments).some(Boolean) && (
              <p className="text-xs text-muted-foreground">
                Kurse, die per Gruppenkarte bezahlt werden, sind bereits mit 0,00 € berücksichtigt.
              </p>
            )}

            <div className="flex justify-between font-semibold pt-1 border-t mt-1">
              <span>Gesamt</span>
              <span className="text-primary">{total.toFixed(2)} €</span>
            </div>
          </CardContent>
        </Card>
      )}


      {step === "address" && (
        <Card>
          <CardHeader>
            <CardTitle>Rechnungsadresse</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vorname *</Label>
              <Input
                value={address.first_name}
                onChange={(e) => setAddress({ ...address, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nachname *</Label>
              <Input
                value={address.last_name}
                onChange={(e) => setAddress({ ...address, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>E-Mail *</Label>
              <Input
                type="email"
                value={address.email}
                onChange={(e) => setAddress({ ...address, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={address.phone}
                onChange={(e) => setAddress({ ...address, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Straße & Hausnummer</Label>
              <Input
                value={address.street}
                onChange={(e) => setAddress({ ...address, street: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>PLZ</Label>
              <Input
                value={address.postal_code}
                onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ort</Label>
              <Input
                value={address.city}
                onChange={(e) => setAddress({ ...address, city: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Land</Label>
              <Input
                value={address.country}
                onChange={(e) => setAddress({ ...address, country: e.target.value })}
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={saveAddressAndContinue}>Weiter</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "payment" && (
        <Card>
          <CardHeader>
            <CardTitle>Zahlungsart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {devMode && (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <FlaskConical className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <p>
                  <strong>Entwicklermodus aktiv.</strong> Es werden keine echten Zahlungen ausgeführt –
                  alle Bestellungen, Buchungen und Rechnungen werden zu Testzwecken erstellt.
                </p>
              </div>
            )}

            {eligibleCardItems.length > 0 && cards.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <h4 className="font-semibold text-sm">Mit Gruppenkarte bezahlen</h4>
                  <p className="text-xs text-muted-foreground">
                    Weise einzelne Kurse einer deiner Karten zu. Der Preis wird von der Summe abgezogen. Nicht zugewiesene Kurse werden ganz normal bezahlt.
                  </p>
                </div>
                {eligibleCardItems.map((it) => (
                  <div key={it.id} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0 truncate">
                      <span className="font-medium">{it.courses?.title}</span>
                      <span className="text-muted-foreground">
                        {" "}– {Number(it.courses?.price ?? 0).toFixed(2)} €
                      </span>
                    </div>
                    <select
                      className="border rounded-md px-2 py-1 bg-background text-sm"
                      value={cardAssignments[it.id] ?? ""}
                      onChange={(e) =>
                        setCardAssignments((prev) => ({
                          ...prev,
                          [it.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Normal bezahlen</option>
                      {cards.map((c) => {
                        const used = cardUsage[c.id] ?? 0;
                        const isCurrent = cardAssignments[it.id] === c.id;
                        const availableForThis = c.remaining_credits - used + (isCurrent ? 1 : 0);
                        const label = `${c.card_type === "ten" ? "10er" : "5er"}-Karte · ${availableForThis} frei`;
                        return (
                          <option key={c.id} value={c.id} disabled={availableForThis < 1}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ))}
                {cardOverdrawn && (
                  <p className="text-xs text-destructive">
                    Eine Karte wurde zu oft vergeben. Bitte Auswahl anpassen.
                  </p>
                )}
              </div>
            )}

            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Ticket className="h-4 w-4 text-primary" />
                Gutscheincode
              </div>
              {voucher ? (
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="text-sm">
                    <p className="font-mono font-semibold">{voucher.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {voucher.discount_percent}% Rabatt · −{discount.toFixed(2)} €
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={clearVoucher}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Code eingeben"
                    value={voucherCode}
                    onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                  <Button
                    onClick={applyVoucher}
                    disabled={voucherValidating || !voucherCode.trim()}
                  >
                    {voucherValidating ? "Prüfen…" : "Einlösen"}
                  </Button>
                </div>
              )}
              <div className="border-t pt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Zwischensumme</span>
                  <span>{grossTotal.toFixed(2)} €</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-primary">
                    <span>Rabatt</span>
                    <span>−{discount.toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <span>Zu zahlen</span>
                  <span className="text-primary">{total.toFixed(2)} €</span>
                </div>
              </div>
            </div>

            {total === 0 && Object.values(cardAssignments).some(Boolean) && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                Der komplette Warenkorb wird per Gruppenkarte bezahlt – es fällt keine Zahlung an.
              </div>
            )}

            <RadioGroup value={payment} onValueChange={(v) => setPayment(v as any)}>
              {devMode ? (
                <>
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <RadioGroupItem value="simulated_paypal" id="sim_paypal" />
                    <div className="flex-1">
                      <Label htmlFor="sim_paypal" className="font-medium">
                        PayPal (Test)
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Simulierte PayPal-Zahlung – wird sofort als bezahlt verbucht.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 border rounded-lg">
                    <RadioGroupItem value="simulated_card" id="sim_card" />
                    <div className="flex-1">
                      <Label htmlFor="sim_card" className="font-medium">
                        Kreditkarte (Test)
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Simulierte Kartenzahlung – keine echte Belastung.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {paypalEnabled && (
                    <div className="flex items-start gap-3 p-4 border rounded-lg">
                      <RadioGroupItem value="paypal" id="paypal" />
                      <div className="flex-1">
                        <Label htmlFor="paypal" className="font-medium">
                          PayPal
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Sicher bezahlen mit deinem PayPal-Konto.
                        </p>
                      </div>
                    </div>
                  )}
                  {total > 0 && (
                    <div className="flex items-start gap-3 p-4 border rounded-lg">
                      <RadioGroupItem value="invoice" id="invoice" />
                      <div className="flex-1">
                        <Label htmlFor="invoice" className="font-medium">
                          Auf Rechnung ({invoiceDays} Tage)
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Du erhältst die Rechnung per E-Mail als PDF und überweist den Betrag innerhalb von {invoiceDays} Tagen.
                          Karten, Kursbuchungen und Videokurs-Zugänge werden erst nach Zahlungseingang freigeschaltet.
                        </p>
                      </div>
                    </div>
                  )}
                  {total === 0 && (
                    <div className="rounded-md border p-4 text-sm text-muted-foreground">
                      Keine Zahlung notwendig – Bestellung wird direkt abgeschlossen.
                    </div>
                  )}
                  {total > 0 && !paypalEnabled && (
                    <div className="rounded-md border border-muted/40 bg-muted/5 p-4 text-sm text-muted-foreground">
                      Hinweis: PayPal ist derzeit nicht verbunden. Du kannst per Rechnung bezahlen.
                    </div>
                  )}
                </>
              )}

            </RadioGroup>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("address")}>
                Zurück
              </Button>
              <Button
                onClick={() => setStep("review")}
                disabled={
                  !devMode &&
                  total > 0 &&
                  !(payment === "paypal" && paypalEnabled) &&
                  payment !== "invoice"
                }
              >
                Weiter
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Übersicht</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Rechnungsadresse</h4>
              <p className="text-sm">
                {address.first_name} {address.last_name}
                <br />
                {address.email}
                <br />
                {address.street}
                <br />
                {address.postal_code} {address.city}
                <br />
                {address.country}
              </p>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold mb-2">Positionen</h4>
              {items.map((i) => (
                <div key={i.id} className="flex justify-between text-sm py-1">
                  <span>
                    {i.products?.name ??
                      i.courses?.title ??
                      (i.card_type === "five" ? "5er-Karte" : "10er-Karte")}
                    {isAssignedWithCard(i) && (
                      <span className="ml-2 text-xs text-primary">(per Karte)</span>
                    )}
                  </span>
                  <span>
                    {isAssignedWithCard(i) ? (
                      <span className="text-muted-foreground line-through mr-1">
                        {Number(i.courses?.price ?? 0).toFixed(2)} €
                      </span>
                    ) : null}
                    {itemPrice(i).toFixed(2)} €
                  </span>
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Zwischensumme</span>
                <span>{grossTotal.toFixed(2)} €</span>
              </div>
              {voucher && discount > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Gutschein ({voucher.code})</span>
                  <span>−{discount.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-base pt-1">
                <span>Gesamt</span>
                <span className="text-primary">{total.toFixed(2)} €</span>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Gemäß § 19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer ausgewiesen.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-1">Zahlungsart</h4>
              <p className="text-sm">
                {payment === "paypal"
                  ? "PayPal"
                  : payment === "invoice"
                  ? `Auf Rechnung (${invoiceDays} Tage)`
                  : payment === "simulated_paypal"
                  ? "PayPal (Test)"
                  : payment === "simulated_card"
                  ? "Kreditkarte (Test)"
                  : "Per Gruppenkarte"}
              </p>
            </div>


            <div className="pt-2">
              <PrivacyConsent checked={privacyAccepted} onChange={setPrivacyAccepted} id="checkout-privacy" />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("payment")}>
                Zurück
              </Button>
              <Button onClick={placeOrder} disabled={submitting || !privacyAccepted} size="lg">
                {submitting ? "Bestellung wird gesendet…" : "Jetzt kostenpflichtig bestellen"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && orderResult && (
        <Card>
          <CardContent className="text-center py-12 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h2 className="font-display text-2xl font-semibold">
              Vielen Dank für deine Bestellung!
            </h2>
            <p className="text-muted-foreground">
              Bestellnummer:{" "}
              <span className="font-mono font-semibold">
                {orderResult.order_number}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {payment === "invoice"
                ? `Deine Rechnung wurde an ${address.email} gesendet. Bitte überweise den Betrag innerhalb von ${invoiceDays} Tagen. Karten und Buchungen werden nach Zahlungseingang freigeschaltet.`
                : `Eine Bestätigung wurde an ${address.email} gesendet.`}
            </p>
            {orderResult.invoice_pdf_url && (
              <Button asChild variant="outline">
                <a href={orderResult.invoice_pdf_url} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4 mr-2" />
                  Rechnung herunterladen
                </a>
              </Button>
            )}

            <div className="flex justify-center gap-2 pt-4">
              <Button onClick={() => navigate("/dashboard")}>Zum Dashboard</Button>
              <Button variant="outline" onClick={() => navigate("/shop")}>
                Weiter einkaufen
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
