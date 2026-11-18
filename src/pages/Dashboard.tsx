import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInHours, differenceInCalendarDays, isPast } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, CreditCard, Download, Mail, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Dashboard() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [cards, setCards] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [newsletterOptIn, setNewsletterOptIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);


  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      setLoadError(null);
      const [bookingsRes, cardsRes, profileRes, ordersRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("*, courses(title, start_time, end_time)")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("class_cards")
          .select("*")
          .eq("user_id", user.id)
          .neq("status", "cancelled")
          .order("purchased_at", { ascending: false }),
        supabase.from("profiles").select("newsletter_opt_in").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("orders")
          .select("id, order_number, created_at, status, payment_method, total, invoice_number, invoice_pdf_path, invoice_issued_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
      ]);
      if (bookingsRes.error || cardsRes.error || profileRes.error) {
        setLoadError("Deine Daten konnten nicht vollständig geladen werden.");
      }
      setBookings(bookingsRes.data ?? []);
      setCards(cardsRes.data ?? []);
      setOrders(ordersRes.data ?? []);
      setNewsletterOptIn(profileRes.data?.newsletter_opt_in ?? false);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const toggleNewsletter = async (next: boolean) => {
    if (!user) return;
    setNewsletterOptIn(next);
    const { error } = await supabase.from("profiles").update({ newsletter_opt_in: next }).eq("user_id", user.id);
    if (error) {
      toast.error("Konnte Einstellung nicht speichern.");
      setNewsletterOptIn(!next);
    } else {
      toast.success(next ? "Newsletter abonniert." : "Vom Newsletter abgemeldet.");
    }
  };

  const cancelBooking = async (booking: any) => {
    if (cancellingId) return;
    const hoursUntil = differenceInHours(parseISO(booking.courses.start_time), new Date());
    const willRefund = hoursUntil >= 24;
    if (!confirm(
      willRefund
        ? "Möchtest du diese Buchung wirklich stornieren? Du erhältst eine Rückerstattung bzw. dein Karten-Guthaben zurück."
        : "Achtung: Stornierung weniger als 24 Stunden vor Kursbeginn.\n\n• Keine Rückerstattung des Kursbetrags\n• Keine Gutschrift auf deine Karte (Kontingent verfällt)\n• Dein Platz verfällt ersatzlos\n\nTrotzdem stornieren?"
    )) return;

    setCancellingId(booking.id);
    try {
      const { data, error } = await supabase.functions.invoke("cancel-booking", {
        body: { booking_id: booking.id },
      });

      if (error || (data as any)?.error) {
        toast.error("Fehler beim Stornieren: " + ((data as any)?.error ?? error?.message ?? ""));
        return;
      }

      const refundType = (data as any)?.refund_type;
      const msg =
        refundType === "card_credit"
          ? "Storniert – Karten-Guthaben zurückgebucht."
          : refundType === "paypal"
          ? "Storniert – Rückerstattung via PayPal veranlasst."
          : refundType === "manual"
          ? "Storniert – Rückerstattung wird manuell bearbeitet."
          : "Storniert – keine Rückerstattung (weniger als 24 Stunden vorher).";
      toast.success(msg);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === booking.id ? { ...b, status: "cancelled", refunded: refundType !== "none" } : b
        )
      );
    } finally {
      setCancellingId(null);
    }
  };


  const downloadICS = (booking: any) => {
    const start = parseISO(booking.courses.start_time);
    const end = parseISO(booking.courses.end_time);
    const fmt = (d: Date) => format(d, "yyyyMMdd'T'HHmmss");
    const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${fmt(start)}
DTEND:${fmt(end)}
SUMMARY:${booking.courses.title} – Santosha Yoga
DESCRIPTION:Yoga-Stunde bei Santosha Yoga
END:VEVENT
END:VCALENDAR`;
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `santosha-${format(start, "yyyy-MM-dd")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadInvoice = async (order: any) => {
    let path = order.invoice_pdf_path as string | null;
    if (!path) {
      const { data, error } = await supabase.functions.invoke("generate-invoice", {
        body: { order_id: order.id },
      });
      if (error || (data as any)?.error) {
        toast.error("Rechnung konnte nicht erstellt werden");
        return;
      }
      path = (data as any)?.invoice_pdf_path ?? null;
      if (path) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, invoice_pdf_path: path, invoice_number: (data as any)?.invoice_number ?? o.invoice_number } : o)));
      }
    }
    if (!path) {
      toast.error("Rechnung nicht verfügbar");
      return;
    }
    try {
      const { data, error } = await supabase.storage.from("invoices").download(path);
      if (error || !data) throw new Error(error?.message || "Download fehlgeschlagen");
      const head = new Uint8Array(await data.slice(0, 5).arrayBuffer());
      const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
      if (!isPdf) throw new Error("Datei ist keine gültige PDF");
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || "rechnung.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast.error(`Download fehlgeschlagen: ${e?.message ?? "Unbekannter Fehler"}. Chrome oder eine Erweiterung blockiert eventuell den Download.`, {
        action: { label: "Erneut versuchen", onClick: () => downloadInvoice(order) },
        duration: 10000,
      });
    }
  };



  if (!user) return null;

  return (
    <div className="container max-w-3xl py-8">
      <h1 className="font-display text-4xl font-semibold mb-8 text-center">Mein Bereich</h1>

      {/* Class Cards */}
      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          Meine Karten
        </h2>
        {cards.length === 0 ? (
          <p className="text-muted-foreground text-sm">Keine Karten vorhanden.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...cards]
              .sort((a, b) => {
                const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
                const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
                const aExpired = a.expires_at && isPast(new Date(a.expires_at));
                const bExpired = b.expires_at && isPast(new Date(b.expires_at));
                if (aExpired !== bExpired) return aExpired ? 1 : -1;
                return aExp - bExp;
              })
              .map((card) => {
                const expiresAt = card.expires_at ? new Date(card.expires_at) : null;
                const expired = expiresAt ? isPast(expiresAt) : false;
                const daysLeft = expiresAt ? differenceInCalendarDays(expiresAt, new Date()) : null;
                const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30;
                const noCredits = card.remaining_credits <= 0;
                const pending = card.status === "pending_payment";

                return (
                  <Card key={card.id} className={pending || expired || noCredits ? "opacity-60" : ""}>
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">
                          {card.card_type === "five" ? "5er-Karte" : "10er-Karte"}
                        </p>
                        {pending && (
                          <Badge variant="secondary">Warte auf Zahlungseingang</Badge>
                        )}
                        {!pending && expired && <Badge variant="destructive">Abgelaufen</Badge>}
                        {!pending && !expired && soon && (
                          <Badge className="bg-primary/20 text-primary border border-primary/40">
                            Läuft bald ab
                          </Badge>
                        )}
                        {!pending && !expired && noCredits && (
                          <Badge variant="secondary">Aufgebraucht</Badge>
                        )}
                      </div>
                      <p className="text-2xl font-display font-semibold text-primary">
                        {card.remaining_credits} / {card.total_credits}
                      </p>
                      <p className="text-xs text-muted-foreground">verbleibende Stunden</p>

                      <div className="pt-2 border-t border-border/40 mt-2 space-y-0.5">
                        {pending ? (
                          <p className="text-sm text-muted-foreground">
                            Diese Karte wird nach Zahlungseingang der Rechnung freigeschaltet.
                          </p>
                        ) : expiresAt ? (
                          <p className={`text-sm ${expired ? "text-destructive" : soon ? "text-primary" : "text-foreground"}`}>
                            {expired
                              ? `Abgelaufen am ${format(expiresAt, "dd.MM.yyyy", { locale: de })}`
                              : `Gültig bis ${format(expiresAt, "dd.MM.yyyy", { locale: de })}`}
                            {!expired && daysLeft !== null && (
                              <span className="text-muted-foreground">
                                {" "}· noch {daysLeft} {daysLeft === 1 ? "Tag" : "Tage"}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Unbegrenzt gültig</p>
                        )}
                        {card.purchased_at && (
                          <p className="text-xs text-muted-foreground">
                            Gekauft am {format(new Date(card.purchased_at), "dd.MM.yyyy", { locale: de })}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

          </div>
        )}
      </section>

      {/* Bookings */}
      <section>
        <h2 className="font-display text-2xl mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Meine Buchungen
        </h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Laden…</p>
        ) : loadError ? (
          <p className="text-destructive text-sm">{loadError}</p>
        ) : bookings.length === 0 ? (
          <p className="text-muted-foreground text-sm">Noch keine Buchungen.</p>
        ) : (() => {
          const validBookings = bookings.filter((b) => b.courses);
          const upcoming = validBookings
            .filter((b) => !isPast(parseISO(b.courses.start_time)))
            .sort(
              (a, b) =>
                parseISO(a.courses.start_time).getTime() -
                parseISO(b.courses.start_time).getTime()
            );
          const pastBookings = validBookings
            .filter((b) => isPast(parseISO(b.courses.start_time)))
            .sort(
              (a, b) =>
                parseISO(b.courses.start_time).getTime() -
                parseISO(a.courses.start_time).getTime()
            );

          // Group by course_id to number seats (each seat = own booking row).
          // Show status per seat so cancelling one shows "Platz 2/2 · Storniert".
          const groupMap = new Map<string, { total: number; ids: string[] }>();
          for (const b of [...validBookings].sort(
            (a, c) => parseISO(a.courses.start_time).getTime() - parseISO(c.courses.start_time).getTime()
          )) {
            const key = b.course_id;
            const g = groupMap.get(key) ?? { total: 0, ids: [] };
            g.total += 1;
            g.ids.push(b.id);
            groupMap.set(key, g);
          }


          const renderBooking = (booking: any) => {
            const courseStart = parseISO(booking.courses.start_time);
            const past = isPast(courseStart);
            const canCancel = !past && booking.status === "confirmed";
            const canRebook = !past && booking.status === "cancelled";
            const usableCard = cards.find(
              (c) =>
                c.remaining_credits > 0 &&
                (!c.expires_at || new Date(c.expires_at) > new Date())
            );
            const group = groupMap.get(booking.course_id);
            const seatIndex = group ? group.ids.indexOf(booking.id) + 1 : 1;
            const showSeatBadge = (group?.total ?? 1) > 1;


            const rebook = async () => {
              if (usableCard) {
                const { data, error } = await supabase.functions.invoke("redeem-card-booking", {
                  body: { course_id: booking.course_id, card_id: usableCard.id, seats: 1 },
                });
                if (error || (data as any)?.error) {
                  toast.error("Buchung fehlgeschlagen: " + ((data as any)?.error ?? error?.message ?? ""));
                  return;
                }
                toast.success("Buchung reaktiviert – Stunde von Karte abgebucht.");
                setBookings((prev) =>
                  prev.map((b) =>
                    b.id === booking.id
                      ? { ...b, status: "confirmed", paid_with_card: true, card_id: usableCard.id, refunded: false }
                      : b
                  )
                );
                const newRemaining = (data as any)?.remaining_after;
                setCards((prev) =>
                  prev.map((c) =>
                    c.id === usableCard.id
                      ? {
                          ...c,
                          remaining_credits:
                            typeof newRemaining === "number"
                              ? newRemaining
                              : c.remaining_credits - 1,
                        }
                      : c
                  )
                );
              } else {
                window.location.href = `/schedule?course=${booking.course_id}`;
              }
            };

            return (
              <Card key={booking.id} className={`animate-fade-in ${past ? "opacity-70" : ""}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{booking.courses.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(courseStart, "EEEE, d. MMM · HH:mm", { locale: de })}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <Badge
                        variant={
                          booking.status === "confirmed" ? "default"
                            : booking.status === "pending_payment" ? "secondary"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {booking.status === "confirmed"
                          ? past ? "Absolviert" : "Bestätigt"
                          : booking.status === "pending_payment"
                          ? "Warte auf Zahlungseingang"
                          : "Storniert"}
                      </Badge>
                      {showSeatBadge && (
                        <Badge variant="outline" className="text-xs">
                          Platz {seatIndex}/{group!.total}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {booking.status === "confirmed" && !past && (
                      <Button variant="ghost" size="icon" onClick={() => downloadICS(booking)} title="Kalender-Export">
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {canCancel && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cancelBooking(booking)}
                        disabled={cancellingId === booking.id}
                      >
                        {cancellingId === booking.id ? "Wird storniert…" : "Stornieren"}
                      </Button>
                    )}
                    {canRebook && (
                      <Button variant="default" size="sm" onClick={rebook}>
                        {usableCard ? "Erneut buchen" : "Wieder aktivieren"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          };

          return (
            <Tabs defaultValue="upcoming" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="upcoming">
                  Bevorstehende ({upcoming.length})
                </TabsTrigger>
                <TabsTrigger value="past">
                  Vergangene ({pastBookings.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="upcoming">
                {upcoming.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Keine bevorstehenden Buchungen.</p>
                ) : (
                  <div className="space-y-3">{upcoming.map(renderBooking)}</div>
                )}
              </TabsContent>
              <TabsContent value="past">
                {pastBookings.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Keine vergangenen Buchungen.</p>
                ) : (
                  <div className="space-y-3">{pastBookings.map(renderBooking)}</div>
                )}
              </TabsContent>
            </Tabs>
          );
        })()}
      </section>


      {/* Orders / Invoices */}
      {orders.length > 0 && (
        <section className="mt-10 mb-10">
          <h2 className="font-display text-2xl mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Bestellungen & Rechnungen
          </h2>
          <div className="space-y-3">
            {orders.map((o) => {
              const isInvoicePending = o.payment_method === "invoice" && o.status !== "paid" && o.status !== "cancelled" && o.status !== "refunded";
              return (
                <Card key={o.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-medium font-mono text-sm">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(o.created_at), "d. MMM yyyy", { locale: de })}
                        {o.invoice_number ? ` · Rechnung ${o.invoice_number}` : ""}
                      </p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Badge variant={o.status === "paid" ? "default" : "secondary"} className="text-xs">
                          {o.status === "paid" ? "Bezahlt" : o.status === "cancelled" ? "Storniert" : o.status === "refunded" ? "Erstattet" : "Offen"}
                        </Badge>
                        {isInvoicePending && (
                          <Badge variant="secondary" className="text-xs">Auf Rechnung – Zahlung offen</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{Number(o.total).toFixed(2)} €</span>
                      <Button variant="outline" size="sm" onClick={() => downloadInvoice(o)}>
                        <Download className="h-4 w-4 mr-1" /> Rechnung
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}



      <section className="mb-10">
        <h2 className="font-display text-2xl mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          Newsletter
        </h2>
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium">Newsletter abonnieren</Label>
              <p className="text-xs text-muted-foreground mt-1">Studio-News, neue Kurse und Aktionen. Abmeldung jederzeit möglich.</p>
            </div>
            <Switch checked={!!newsletterOptIn} onCheckedChange={toggleNewsletter} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
