import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronLeft, CreditCard, Loader2, Ticket, X } from "lucide-react";
import { PrivacyConsent } from "@/components/PrivacyConsent";

type CourseRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  price: number;
  max_participants: number;
  class_cards_allowed?: boolean;
  course_type_id?: string | null;
};

type AppliedVoucher = {
  voucher_id: string;
  code: string;
  discount_percent: number;
  discount_amount: number;
  applicable_amount: number;
};

type Step = "auth" | "payment" | "done";

interface ClassCard {
  id: string;
  card_type: "five" | "ten";
  remaining_credits: number;
  total_credits: number;
  expires_at: string | null;
}

interface Props {
  course: CourseRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  freeSeats?: number;
}

export default function BookingWizard({ course, open, onOpenChange, freeSeats }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(user ? "payment" : "auth");
  const [authMode, setAuthMode] = useState<"login" | "signup" | "guest">("login");
  const [loading, setLoading] = useState(false);
  const [cards, setCards] = useState<ClassCard[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<string>("");
  const [devMode, setDevMode] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [voucherValidating, setVoucherValidating] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const maxSeats = Math.max(1, Math.min(freeSeats ?? 5, 5));
  const [seats, setSeats] = useState(1);
  useEffect(() => {
    if (seats > maxSeats) setSeats(maxSeats);
  }, [maxSeats]);

  useEffect(() => {
    supabase.functions.invoke("dev-mode-status").then(({ data }) => {
      setDevMode(!!(data as any)?.enabled);
    });
  }, []);

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup
  const [signup, setSignup] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    phone: "",
    birthday: "",
    street: "",
    postal_code: "",
    city: "",
    country: "Deutschland",
  });

  // Guest booking
  const [guest, setGuest] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    birthday: "",
    street: "",
    postal_code: "",
    city: "",
    country: "Deutschland",
  });

  useEffect(() => {
    if (open) {
      setStep(user ? "payment" : "auth");
      setVoucher(null);
      setVoucherCode("");
      if (!user) {
        setGuestToken(null);
        setGuestUserId(null);
        setGuestEmail(null);
      }
    }
  }, [user, open]);

  // Voucher not applicable for card redemption (already free per card)
  const voucherUsable = !paymentChoice.startsWith("card:");
  useEffect(() => {
    if (!voucherUsable && voucher) setVoucher(null);
  }, [voucherUsable]);

  const getCartForVoucher = () => {
    if (paymentChoice === "buy_5") {
      return [{ type: "card", ref_id: "five", amount: 70 }];
    }
    if (paymentChoice === "buy_10") {
      return [{ type: "card", ref_id: "ten", amount: 120 }];
    }
    // Default: course booking(s) — one line per seat
    return Array.from({ length: seats }, () => ({
      type: "course",
      ref_id: course.course_type_id ?? null,
      amount: Number(course.price),
    }));
  };

  const applyVoucher = async () => {
    if (!voucherCode.trim()) return;
    // Voucher only applies to paid bookings; auto-switch off card redemption
    if (paymentChoice.startsWith("card:")) {
      setPaymentChoice("paypal");
    }
    setVoucherValidating(true);
    const { data, error } = await (supabase as any).rpc("validate_voucher_cart", {
      _code: voucherCode.trim(),
      _cart: getCartForVoucher(),
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
    setVoucher({
      voucher_id: r.voucher_id,
      code: r.code,
      discount_percent: Number(r.discount_percent),
      discount_amount: Number(r.discount_amount),
      applicable_amount: Number(r.applicable_amount),
    });
    setVoucherCode("");
    toast.success(`Gutschein „${r.code}" eingelöst.`);
  };

  // Re-validate voucher when seats change (so discount amount updates)
  useEffect(() => {
    if (!voucher || paymentChoice === "buy_5" || paymentChoice === "buy_10") return;
    (async () => {
      const { data } = await (supabase as any).rpc("validate_voucher_cart", {
        _code: voucher.code,
        _cart: getCartForVoucher(),
      });
      const r = data as any;
      if (r?.ok) {
        setVoucher({
          voucher_id: r.voucher_id,
          code: r.code,
          discount_percent: Number(r.discount_percent),
          discount_amount: Number(r.discount_amount),
          applicable_amount: Number(r.applicable_amount),
        });
      }
    })();
  }, [seats]);

  const courseSeatsMultiplier =
    paymentChoice === "buy_5" || paymentChoice === "buy_10" ? 1 : seats;
  const singlePrice =
    paymentChoice === "buy_5" ? 70 : paymentChoice === "buy_10" ? 120 : Number(course.price);
  const basePrice = singlePrice * courseSeatsMultiplier;
  const discount = voucher && voucherUsable ? Math.min(voucher.discount_amount, basePrice) : 0;
  const finalPrice = Math.max(0, basePrice - discount);


  const cardsAllowed = course.class_cards_allowed !== false;

  useEffect(() => {
    if (!user || !open || step !== "payment") return;
    const loadCards = async () => {
      const { data } = await supabase
        .from("class_cards")
        .select("id, card_type, remaining_credits, total_credits, expires_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .gt("remaining_credits", 0)
        .order("purchased_at", { ascending: true });

      const valid = (data ?? []).filter(
        (c: any) => !c.expires_at || new Date(c.expires_at) > new Date()
      ) as ClassCard[];
      setCards(valid);
      if (!cardsAllowed) {
        setPaymentChoice("paypal");
        return;
      }
      // Default selection: existing card if available, else PayPal
      if (valid.length > 0) setPaymentChoice(`card:${valid[0].id}`);
      else setPaymentChoice("paypal");
    };
    loadCards();
  }, [user, open, step, cardsAllowed]);

  // ---- Auth handlers ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Willkommen zurück!");
    setStep("payment");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signup.first_name || !signup.last_name || !signup.email || !signup.password) {
      toast.error("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: signup.email,
      password: signup.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { first_name: signup.first_name, last_name: signup.last_name },
      },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    // wait briefly for trigger to create profile, then update extra fields
    if (data.user) {
      await new Promise((r) => setTimeout(r, 500));
      await supabase.from("profiles").update({
        phone: signup.phone || null,
        birthday: signup.birthday || null,
        street: signup.street || null,
        postal_code: signup.postal_code || null,
        city: signup.city || null,
        country: signup.country || null,
        email: signup.email,
      }).eq("user_id", data.user.id);
    }
    setLoading(false);
    toast.success("Konto erstellt!");
    // If session is set, go to payment; otherwise tell user to confirm email
    if (data.session) {
      setStep("payment");
    } else {
      toast.info("Bitte prüfe dein E-Mail-Postfach zur Bestätigung.");
    }
  };

  const handleGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest.first_name || !guest.last_name || !guest.email || !guest.phone
        || !guest.street || !guest.postal_code || !guest.city) {
      toast.error("Bitte alle Pflichtfelder ausfüllen.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("guest-account", {
      body: guest,
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Konnte kein Konto anlegen.");
      return;
    }
    const token = (data as any).guest_token as string;
    const uid = (data as any).user_id as string;
    setGuestToken(token);
    setGuestUserId(uid);
    setGuestEmail(guest.email);
    try { sessionStorage.setItem("guest_booking_token", token); } catch {}
    if (!cardsAllowed) setPaymentChoice("paypal");
    else setPaymentChoice("paypal");
    toast.success("Weiter zur Zahlung.");
    setStep("payment");
  };

  // ---- Payment handlers ----
  const handleConfirm = async () => {
    const effectiveUserId = user?.id ?? guestUserId;
    if (!effectiveUserId) return;
    if (!privacyAccepted) {
      toast.error("Bitte stimme der Datenschutzerklärung zu.");
      return;
    }
    const isGuest = !user && !!guestToken;
    const invokeOpts = isGuest ? { headers: { "x-guest-token": guestToken! } } : {};
    setLoading(true);

    try {
      if (paymentChoice.startsWith("card:")) {
        const cardId = paymentChoice.slice(5);
        const { data, error } = await supabase.functions.invoke("redeem-card-booking", {
          body: { course_id: course.id, card_id: cardId, seats },
          ...invokeOpts,
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message || "Buchung fehlgeschlagen");
        }
        setStep("done");
        return;
      }

      // Build inline cart (guest) OR mutate cart_items (logged-in user)
      let inlineCart: Array<{ course_id?: string; product_id?: string; card_type?: "five" | "ten" }> = [];
      let alsoBookCourseId: string | null = null;
      let alsoBookSeats = 1;

      if (paymentChoice === "buy_5" || paymentChoice === "buy_10") {
        const credits = paymentChoice === "buy_5" ? 5 : 10;
        const cardType = paymentChoice === "buy_5" ? "five" : "ten";
        const { data: prod } = await supabase
          .from("products")
          .select("id")
          .eq("kind", "class_card")
          .eq("card_credits", credits)
          .eq("is_active", true)
          .maybeSingle();
        if (prod) inlineCart = [{ product_id: prod.id }];
        else inlineCart = [{ card_type: cardType }];
        alsoBookCourseId = course.id;
        alsoBookSeats = seats;
      } else {
        // Course booking via PayPal — one entry per seat
        inlineCart = Array.from({ length: seats }, () => ({ course_id: course.id }));
      }

      if (!isGuest) {
        await supabase.from("cart_items").delete().eq("user_id", user!.id);
        const cartInserts = inlineCart.map((it) => ({ user_id: user!.id, ...it }));
        await supabase.from("cart_items").insert(cartInserts);
      }

      // Billing info: from profile (logged in) or guest form
      let billing;
      if (isGuest) {
        billing = {
          first_name: guest.first_name,
          last_name: guest.last_name,
          email: guest.email,
          phone: guest.phone,
          street: guest.street,
          postal_code: guest.postal_code,
          city: guest.city,
          country: guest.country,
        };
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone, street, postal_code, city, country, email")
          .eq("user_id", user!.id)
          .maybeSingle();
        billing = {
          first_name: profile?.first_name ?? "",
          last_name: profile?.last_name ?? "",
          email: profile?.email ?? user!.email,
          phone: profile?.phone ?? "",
          street: profile?.street ?? "",
          postal_code: profile?.postal_code ?? "",
          city: profile?.city ?? "",
          country: profile?.country ?? "Deutschland",
        };
      }

      const origin = window.location.origin;

      // Free booking via voucher (100% or full-cover) — skip PayPal entirely
      if (
        voucher &&
        voucherUsable &&
        paymentChoice === "paypal" &&
        finalPrice === 0
      ) {
        const { data: freeData, error: freeErr } = await supabase.functions.invoke(
          "book-with-voucher",
          {
            body: {
              course_id: course.id,
              voucher_code: voucher.code,
              billing,
              seats,
            },
            ...invokeOpts,
          },
        );
        if (freeErr || (freeData as any)?.error) {
          throw new Error(
            (freeData as any)?.error || freeErr?.message || "Buchung fehlgeschlagen",
          );
        }
        setStep("done");
        return;
      }

      const fnName = devMode ? "simulate-payment" : "create-paypal-order";
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          also_book_course_id: alsoBookCourseId,
          also_book_seats: alsoBookSeats,
          return_url: `${origin}/checkout/return`,
          cancel_url: `${origin}/checkout/cancel`,
          payment_method: "simulated_paypal",
          billing,
          voucher_code: voucher?.code ?? null,
          ...(isGuest ? { cart: inlineCart } : {}),
        },
        ...invokeOpts,
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Buchung fehlgeschlagen");
      }
      if (devMode) {
        setStep("done");
        return;
      }
      if (!(data as any)?.approve_url) {
        throw new Error("PayPal-Bestellung fehlgeschlagen");
      }
      window.location.href = (data as any).approve_url;
      return;

    } catch (e: any) {
      toast.error(e.message ?? "Fehler bei der Buchung");
    } finally {
      setLoading(false);
    }
  };

  const start = parseISO(course.start_time);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[calc(100dvh-1rem)] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] bg-[hsl(var(--card))] border-[hsl(var(--border))]/40 p-4 sm:p-6">
        {/* AUTH STEP */}
        {step === "auth" && (
          <>
            <DialogHeader className="border-b border-[hsl(var(--border))]/40 pb-4">
              <DialogTitle className="font-display text-2xl text-[hsl(var(--primary))]">
                Ihre Information
              </DialogTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Melde dich an, registriere dich – oder buche ohne Konto als Gast.
              </p>
            </DialogHeader>

            <Tabs value={authMode} onValueChange={(v) => setAuthMode(v as any)}>
              <TabsList className="grid w-full grid-cols-3 bg-[hsl(var(--secondary))]">
                <TabsTrigger value="login">Anmelden</TabsTrigger>
                <TabsTrigger value="signup">Registrieren</TabsTrigger>
                <TabsTrigger value="guest">Als Gast</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-3 pt-4">
                  <div>
                    <Label>E-Mail</Label>
                    <Input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Passwort</Label>
                    <Input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anmelden & weiter"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-3 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Vorname *</Label>
                      <Input
                        required
                        value={signup.first_name}
                        onChange={(e) => setSignup({ ...signup, first_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Nachname *</Label>
                      <Input
                        required
                        value={signup.last_name}
                        onChange={(e) => setSignup({ ...signup, last_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>E-Mail *</Label>
                      <Input
                        type="email"
                        required
                        value={signup.email}
                        onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Passwort *</Label>
                      <Input
                        type="password"
                        required
                        minLength={6}
                        value={signup.password}
                        onChange={(e) => setSignup({ ...signup, password: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Telefon</Label>
                      <Input
                        type="tel"
                        placeholder="+49 …"
                        value={signup.phone}
                        onChange={(e) => setSignup({ ...signup, phone: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Geburtsdatum</Label>
                      <Input
                        type="date"
                        value={signup.birthday}
                        onChange={(e) => setSignup({ ...signup, birthday: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Straße & Hausnummer</Label>
                    <Input
                      value={signup.street}
                      onChange={(e) => setSignup({ ...signup, street: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>PLZ</Label>
                      <Input
                        value={signup.postal_code}
                        onChange={(e) => setSignup({ ...signup, postal_code: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Ort</Label>
                      <Input
                        value={signup.city}
                        onChange={(e) => setSignup({ ...signup, city: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Land</Label>
                    <Input
                      value={signup.country}
                      onChange={(e) => setSignup({ ...signup, country: e.target.value })}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Konto erstellen & weiter"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="guest">
                <form onSubmit={handleGuest} className="space-y-3 pt-4">
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Wir legen für dich im Hintergrund ein Kundenkonto an, damit du Rechnung und Buchungsübersicht bekommst. Zugang später über „Passwort vergessen".
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Vorname *</Label>
                      <Input required value={guest.first_name}
                        onChange={(e) => setGuest({ ...guest, first_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>Nachname *</Label>
                      <Input required value={guest.last_name}
                        onChange={(e) => setGuest({ ...guest, last_name: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>E-Mail *</Label>
                      <Input type="email" required value={guest.email}
                        onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
                    </div>
                    <div>
                      <Label>Telefon *</Label>
                      <Input type="tel" required placeholder="+49 …" value={guest.phone}
                        onChange={(e) => setGuest({ ...guest, phone: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Geburtsdatum</Label>
                    <Input type="date" value={guest.birthday}
                      onChange={(e) => setGuest({ ...guest, birthday: e.target.value })} />
                  </div>
                  <div>
                    <Label>Straße & Hausnummer *</Label>
                    <Input required value={guest.street}
                      onChange={(e) => setGuest({ ...guest, street: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>PLZ *</Label>
                      <Input required value={guest.postal_code}
                        onChange={(e) => setGuest({ ...guest, postal_code: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label>Ort *</Label>
                      <Input required value={guest.city}
                        onChange={(e) => setGuest({ ...guest, city: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Land</Label>
                    <Input value={guest.country}
                      onChange={(e) => setGuest({ ...guest, country: e.target.value })} />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Weiter zur Zahlung"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* PAYMENT STEP */}
        {step === "payment" && (
          <>
            <DialogHeader className="border-b border-[hsl(var(--border))]/40 pb-4">
              <DialogTitle className="font-display text-2xl text-[hsl(var(--primary))]">
                Buchung abschließen
              </DialogTitle>
              <p className="text-sm text-[hsl(var(--foreground))]">
                {course.title} · {format(start, "EEEE, d. MMMM · HH:mm", { locale: de })}
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Einzelpreis: <span className="text-[hsl(var(--primary))] font-medium">€{Number(course.price).toFixed(2)}</span>
              </p>
            </DialogHeader>

            {/* Seats selector */}
            <div className="py-2">
              <Label className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 block">
                Anzahl Plätze
              </Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSeats((s) => Math.max(1, s - 1))}
                  disabled={seats <= 1}
                  aria-label="Weniger Plätze"
                >
                  −
                </Button>
                <div className="min-w-[3rem] text-center">
                  <span className="font-display text-2xl text-[hsl(var(--foreground))]">{seats}</span>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {seats === 1 ? "Platz" : "Plätze"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSeats((s) => Math.min(maxSeats, s + 1))}
                  disabled={seats >= maxSeats}
                  aria-label="Mehr Plätze"
                >
                  +
                </Button>
                {maxSeats > 1 && (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    max. {maxSeats} verfügbar
                  </span>
                )}
                {maxSeats === 1 && (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    nur noch 1 Platz frei
                  </span>
                )}
              </div>
              {seats > 1 && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                  Du buchst {seats} Plätze. Bei einer Karten- oder Gutschein-Einlösung werden entsprechend {seats} Guthaben abgezogen. Jeden Platz kannst du später einzeln stornieren.
                </p>
              )}
            </div>



            <div className="py-2">
              <Label className="text-xs uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 block">
                Zahlungsmethode
              </Label>
              <RadioGroup value={paymentChoice} onValueChange={setPaymentChoice} className="space-y-2">
                {cards.map((c) => (
                  <label
                    key={c.id}
                    className={cn(
                      "flex items-center gap-3 border border-[hsl(var(--border))]/40 rounded p-3",
                      cardsAllowed
                        ? "cursor-pointer hover:bg-[hsl(var(--secondary))]/40"
                        : "opacity-50 cursor-not-allowed pointer-events-none"
                    )}
                  >
                    <RadioGroupItem value={`card:${c.id}`} disabled={!cardsAllowed} />
                    <CreditCard className="h-4 w-4 text-[hsl(var(--primary))]" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        {c.card_type === "ten" ? "10er-Karte" : "5er-Karte"} einlösen
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {c.remaining_credits} von {c.total_credits} Stunden verbleibend
                      </p>
                    </div>
                    {!cardsAllowed ? (
                      <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">Nicht zulässig</span>
                    ) : (
                      <span className="text-sm text-[hsl(var(--primary))]">
                        −{seats} {seats === 1 ? "Stunde" : "Stunden"}
                      </span>
                    )}
                  </label>
                ))}

                <label className="flex items-center gap-3 border border-[hsl(var(--border))]/40 rounded p-3 cursor-pointer hover:bg-[hsl(var(--secondary))]/40">
                  <RadioGroupItem value="paypal" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      {seats === 1 ? "Einzelbuchung" : `${seats} Plätze`} via PayPal
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Sicher mit PayPal, Sofort oder Klarna
                    </p>
                  </div>
                  <span className="text-sm text-[hsl(var(--primary))]">€{(Number(course.price) * seats).toFixed(2)}</span>
                </label>


                <>
                  <label className={cn(
                    "flex items-center gap-3 border border-[hsl(var(--border))]/40 rounded p-3",
                    cardsAllowed
                      ? "cursor-pointer hover:bg-[hsl(var(--secondary))]/40"
                      : "opacity-50 cursor-not-allowed pointer-events-none"
                  )}>
                    <RadioGroupItem value="buy_5" disabled={!cardsAllowed} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        5er-Karte kaufen + Kurs einlösen
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        4 weitere Stunden bleiben für künftige Buchungen
                      </p>
                    </div>
                    {!cardsAllowed ? (
                      <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">Nicht zulässig</span>
                    ) : (
                      <span className="text-sm text-[hsl(var(--primary))]">€75,00</span>
                    )}
                  </label>

                  <label className={cn(
                    "flex items-center gap-3 border border-[hsl(var(--border))]/40 rounded p-3",
                    cardsAllowed
                      ? "cursor-pointer hover:bg-[hsl(var(--secondary))]/40"
                      : "opacity-50 cursor-not-allowed pointer-events-none"
                  )}>
                    <RadioGroupItem value="buy_10" disabled={!cardsAllowed} />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                        10er-Karte kaufen + Kurs einlösen
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        9 weitere Stunden bleiben für künftige Buchungen
                      </p>
                    </div>
                    {!cardsAllowed ? (
                      <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">Nicht zulässig</span>
                    ) : (
                      <span className="text-sm text-[hsl(var(--primary))]">€140,00</span>
                    )}
                  </label>
                </>
              </RadioGroup>
              {!cardsAllowed && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                  Für diesen Kurs sind Gruppenkarten (5er/10er) nicht zulässig. Du kannst per Bezahlung oder mit einem Geschenkgutschein buchen.
                </p>
              )}
            </div>

            <div className={cn(
              "border border-[hsl(var(--border))]/40 rounded p-3 space-y-2",
              !voucherUsable && "opacity-60"
            )}>
                <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--foreground))]">
                  <Ticket className="h-4 w-4 text-[hsl(var(--primary))]" />
                  Gutscheincode
                  {!voucherUsable && (
                    <span className="ml-auto text-xs font-normal text-[hsl(var(--muted-foreground))]">
                      Bei Karten-Einlösung nicht nötig
                    </span>
                  )}
                </div>

                {voucher ? (
                  <div className="flex items-center justify-between rounded border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/5 p-2">
                    <div className="text-sm">
                      <p className="font-mono font-semibold text-[hsl(var(--foreground))]">{voucher.code}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {voucher.discount_percent}% Rabatt · −{discount.toFixed(2)} €
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setVoucher(null)}>
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
                      className="bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
                    >
                      {voucherValidating ? "Prüfen…" : "Einlösen"}
                    </Button>
                  </div>
                )}
                <div className="border-t border-[hsl(var(--border))]/40 pt-2 flex items-center justify-between text-sm">
                  <span className="text-[hsl(var(--muted-foreground))]">Zu zahlen</span>
                  <span className="font-semibold text-[hsl(var(--primary))]">
                    {discount > 0 && (
                      <span className="text-xs text-[hsl(var(--muted-foreground))] line-through mr-2">
                        €{basePrice.toFixed(2)}
                      </span>
                    )}
                    €{finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>



            <div className="px-1 pt-2">
              <PrivacyConsent checked={privacyAccepted} onChange={setPrivacyAccepted} id="booking-privacy" />
            </div>

            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={loading || !paymentChoice || !privacyAccepted}
                className="bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Jetzt verbindlich buchen"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* DONE STEP */}
        {step === "done" && (
          <>
            <div className="py-8 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 text-[hsl(var(--primary))] mx-auto" />
              <DialogTitle className="font-display text-2xl text-[hsl(var(--foreground))]">
                Buchung bestätigt!
              </DialogTitle>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {course.title}<br />
                {format(start, "EEEE, d. MMMM · HH:mm", { locale: de })}
              </p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Wir freuen uns auf dich!
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Schließen
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  navigate("/dashboard");
                }}
                className="bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]"
              >
                Zu meinen Buchungen
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
