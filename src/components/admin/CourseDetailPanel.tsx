import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { X, MoreVertical, Search, Pencil, Calendar, Users, Mail, Copy, Trash2, Ban, UserPlus } from "lucide-react";

import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course: any | null;
  onEdit: () => void;
  onChanged: () => void;
}

export default function CourseDetailPanel({ open, onOpenChange, course, onEdit, onChanged }: Props) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  // Add-participant dialog
  const [addOpen, setAddOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [customerCards, setCustomerCards] = useState<any[]>([]);
  const [payMode, setPayMode] = useState<"free" | "card" | "voucher">("free");
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [voucherCode, setVoucherCode] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!addOpen) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .order("last_name", { ascending: true });
      setCustomers(data ?? []);
    })();
  }, [addOpen]);

  useEffect(() => {
    if (!selectedUserId) { setCustomerCards([]); setSelectedCardId(""); return; }
    (async () => {
      const { data } = await supabase
        .from("class_cards")
        .select("id, card_type, remaining_credits, total_credits, expires_at, status")
        .eq("user_id", selectedUserId)
        .neq("status", "cancelled")
        .gt("remaining_credits", 0)
        .order("created_at", { ascending: true });
      const usable = (data ?? []).filter((c: any) => !c.expires_at || new Date(c.expires_at) > new Date());
      setCustomerCards(usable);
      setSelectedCardId(usable[0]?.id ?? "");
      if (usable.length === 0) setPayMode("free");
    })();
  }, [selectedUserId]);


  useEffect(() => {
    if (!open || !course?.id) return;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, status, amount_paid, payment_method, paid_with_card, user_id, order_id, voucher_code, orders(status, payment_method, order_number)")
        .eq("course_id", course.id);
      const userIds = Array.from(new Set((data ?? []).map((b: any) => b.user_id)));
      let profiles: any[] = [];
      if (userIds.length) {
        const { data: p } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", userIds);
        profiles = p ?? [];
      }
      const merged = (data ?? []).map((b: any) => ({
        ...b,
        profile: profiles.find(p => p.user_id === b.user_id),
      }));
      setBookings(merged);
      await loadWaitlist(course.id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, course?.id]);

  const loadWaitlist = async (courseId: string) => {
    const { data: wl } = await supabase
      .from("waitlist_entries" as any)
      .select("id, user_id, status, created_at, notified_at")
      .eq("course_id", courseId)
      .in("status", ["waiting", "notified"])
      .order("created_at", { ascending: true });
    const list = (wl as any[]) ?? [];
    const ids = list.map((w) => w.user_id);
    let profs: any[] = [];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("user_id, first_name, last_name, email, phone").in("user_id", ids);
      profs = p ?? [];
    }
    setWaitlist(list.map((w) => ({ ...w, profile: profs.find((p) => p.user_id === w.user_id) })));
  };

  const removeFromWaitlist = async (id: string) => {
    const { error } = await supabase.from("waitlist_entries" as any).delete().eq("id", id);
    if (error) return toast.error(error.message);
    setWaitlist((prev) => prev.filter((w) => w.id !== id));
    toast.success("Von der Warteliste entfernt.");
  };

  if (!course) return null;

  const status = course.is_cancelled
    ? { label: "Abgesagt", variant: "destructive" as const, color: "bg-destructive" }
    : bookings.filter(b => b.status === "confirmed").length >= course.max_participants
    ? { label: "Voll", variant: "secondary" as const, color: "bg-primary" }
    : { label: "Offen", variant: "outline" as const, color: "bg-emerald-500" };

  const confirmed = bookings.filter(b => b.status === "confirmed").length;
  // A booking counts as unpaid while it waits for payment or its order is not paid yet
  // (e.g. "Kauf auf Rechnung"). Card/voucher/admin bookings are always settled.
  const isUnpaid = (b: any) =>
    b.status !== "cancelled" &&
    (b.status === "pending_payment" ||
      (!!b.orders && b.orders.status !== "paid" && b.orders.status !== "refunded" && !b.paid_with_card));
  const unpaidCount = bookings.filter(isUnpaid).length;
  const filtered = bookings.filter(b => {
    if (!search) return true;
    const s = search.toLowerCase();
    const p = b.profile;
    return p?.first_name?.toLowerCase().includes(s)
      || p?.last_name?.toLowerCase().includes(s)
      || p?.email?.toLowerCase().includes(s);
  });

  const cancelCourse = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("cancel-course", { body: { course_id: course.id } });
    setBusy(false);
    setConfirmCancel(false);
    if (error) return toast.error(error.message);
    const n = data?.results?.[0]?.bookings?.length ?? 0;
    toast.success(`Kurs abgesagt. ${n} Buchung(en) storniert & Kunden benachrichtigt.`);
    onChanged();
  };

  const duplicate = async () => {
    const { id, course_no, created_at, updated_at, course_types, trainers, ...rest } = course;
    const { error } = await supabase.from("courses").insert({ ...rest, is_cancelled: false, series_id: null });
    if (error) return toast.error(error.message);
    toast.success("Kurs dupliziert.");
    onChanged();
  };

  const deleteCourse = async () => {
    setBusy(true);
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) {
      console.error("[delete course]", error);
      return toast.error(error.message || "Löschen fehlgeschlagen");
    }
    toast.success("Kurs gelöscht.");
    onChanged();
    onOpenChange(false);
  };

  const updateBookingStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("bookings").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Buchung aktualisiert.");
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  };

  const reloadBookings = async () => {
    const { data } = await supabase
      .from("bookings")
      .select("id, status, amount_paid, payment_method, paid_with_card, user_id, order_id, voucher_code, orders(status, payment_method, order_number)")
      .eq("course_id", course.id);
    const userIds = Array.from(new Set((data ?? []).map((b: any) => b.user_id)));
    let profiles: any[] = [];
    if (userIds.length) {
      const { data: p } = await supabase
        .from("profiles").select("user_id, first_name, last_name, email").in("user_id", userIds);
      profiles = p ?? [];
    }
    setBookings((data ?? []).map((b: any) => ({ ...b, profile: profiles.find(p => p.user_id === b.user_id) })));
  };

  const addParticipant = async () => {
    if (!selectedUserId) return toast.error("Bitte einen Kunden auswählen");
    setAdding(true);
    try {
      // Mehrfachbuchungen erlaubt (z. B. wenn Kunde einen Gast mitbringt)

      let cardId: string | null = null;
      let voucherId: string | null = null;
      let voucherCodeVal: string | null = null;
      let discountAmount = 0;
      const coursePrice = Number(course.price) || 0;

      if (payMode === "card") {
        if (!selectedCardId) { toast.error("Bitte Karte auswählen"); return; }
        const { data: remaining, error: rErr } = await supabase.rpc("consume_class_card_credit", { _card_id: selectedCardId });
        if (rErr) { toast.error("Karte konnte nicht belastet werden: " + rErr.message); return; }
        if (remaining === null) { toast.error("Karte hat kein Guthaben mehr."); return; }
        cardId = selectedCardId;
      } else if (payMode === "voucher") {
        const code = voucherCode.trim();
        if (!code) { toast.error("Bitte Gutscheincode eingeben"); return; }
        const { data: v, error: vErr } = await supabase
          .from("vouchers")
          .select("id, code, is_active, valid_from, valid_until, is_single_use, times_used, max_total_uses, discount_percent, discount_amount_fixed")
          .ilike("code", code)
          .maybeSingle();
        if (vErr || !v) { toast.error("Gutschein nicht gefunden."); return; }
        if (!v.is_active) { toast.error("Gutschein ist nicht aktiv."); return; }
        const now = Date.now();
        if (v.valid_from && new Date(v.valid_from).getTime() > now) { toast.error("Gutschein ist noch nicht gültig."); return; }
        if (v.valid_until && new Date(v.valid_until).getTime() < now) { toast.error("Gutschein ist abgelaufen."); return; }
        if (v.is_single_use && (v.times_used ?? 0) >= 1) { toast.error("Gutschein wurde bereits eingelöst."); return; }
        if (v.max_total_uses != null && (v.times_used ?? 0) >= v.max_total_uses) { toast.error("Gutschein wurde bereits maximal oft eingelöst."); return; }
        voucherId = v.id;
        voucherCodeVal = v.code;
        const fixed = v.discount_amount_fixed != null ? Number(v.discount_amount_fixed) : 0;
        discountAmount = fixed > 0
          ? Math.min(fixed, coursePrice)
          : Math.round(coursePrice * Number(v.discount_percent)) / 100;
        if (discountAmount < coursePrice) {
          toast.error("Gutschein deckt nicht den vollen Preis. Bitte anders abrechnen.");
          return;
        }
      }

      const { error } = await supabase.from("bookings").insert({
        course_id: course.id,
        user_id: selectedUserId,
        status: "confirmed",
        amount_paid: 0,
        payment_method: "admin_grant" as any,
        paid_with_card: payMode === "card",
        card_id: cardId,
        voucher_id: voucherId,
        voucher_code: voucherCodeVal,
        discount_amount: voucherId ? discountAmount : 0,
      });
      if (error) {
        // Refund credit if booking failed
        if (cardId) await supabase.rpc("refund_class_card_credit", { _card_id: cardId });
        toast.error("Buchung fehlgeschlagen: " + error.message);
        return;
      }

      // The voucher redemption (linked to this booking) is recorded by the server.

      toast.success("Teilnehmer hinzugefügt.");
      setAddOpen(false);
      setSelectedUserId("");
      setCustomerSearch("");
      setPayMode("free");
      setVoucherCode("");
      await reloadBookings();
    } finally {
      setAdding(false);
    }
  };

  const filteredCustomers = customerSearch.trim()
    ? customers.filter(c => `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""}`.toLowerCase().includes(customerSearch.toLowerCase()))
    : customers;
  const selectedCustomer = customers.find(c => c.user_id === selectedUserId);


  const total = bookings.reduce((s, b) => s + Number(b.amount_paid || 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-display text-lg">Kursdetails</h2>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={duplicate}><Copy className="h-4 w-4 mr-2" />Duplizieren</DropdownMenuItem>
                {!course.is_cancelled && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmCancel(true); }}>
                    <Ban className="h-4 w-4 mr-2" />Absagen
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setConfirmDelete(true); }} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${course.is_visible ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                {course.is_visible ? "Sichtbar" : "Versteckt"}
              </span>
              <span>ID: {course.course_no ?? "–"}</span>
            </div>

            <div className="flex flex-col items-center text-center space-y-2">
              <div
                className="h-20 w-20 rounded-full bg-cover bg-center border"
                style={{
                  backgroundImage: (course.image_url || course.course_types?.image_url) ? `url(${course.image_url ?? course.course_types?.image_url})` : undefined,
                  backgroundColor: course.color || course.course_types?.color || "hsl(var(--secondary))",
                }}
              />
              <h3 className="font-display text-xl">{course.title}</h3>
              {course.course_types && <Badge variant="secondary" className="text-xs">{course.course_types.name}</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(parseISO(course.start_time), "d. MMM", { locale: de })}</span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{confirmed} / {course.max_participants}</span>
              </div>
              <div className="col-span-2 text-muted-foreground text-xs">
                {format(parseISO(course.start_time), "EEEE · HH:mm", { locale: de })} – {format(parseISO(course.end_time), "HH:mm")}
                {course.location && <> · {course.location}</>}
              </div>
              {course.trainers && (
                <div className="col-span-2 text-xs">Trainer: {course.trainers.first_name} {course.trainers.last_name}</div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" className="flex-1" onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-1" />Kurs bearbeiten
              </Button>
              <Badge variant={status.variant} className="px-3 py-2">{status.label}</Badge>
            </div>

            <Tabs defaultValue="participants">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="participants">{confirmed} Teilnehmer</TabsTrigger>
                <TabsTrigger value="waitlist">Warteliste ({waitlist.length})</TabsTrigger>
                <TabsTrigger value="summary">Zusammenfassung</TabsTrigger>
              </TabsList>

              <TabsContent value="waitlist" className="space-y-3 pt-3">
                {waitlist.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Niemand auf der Warteliste.</p>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Wird ein Platz frei, bekommen alle Wartenden automatisch eine E-Mail – wer zuerst bucht, bekommt den Platz.
                    </p>
                    {waitlist.map((w, i) => (
                      <div key={w.id} className="border rounded p-3 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-sm">
                            {i + 1}. {w.profile ? `${w.profile.first_name ?? ""} ${w.profile.last_name ?? ""}`.trim() || "Kund:in" : "Kund:in"}
                          </span>
                          <Badge variant={w.status === "notified" ? "default" : "secondary"} className="text-[10px]">
                            {w.status === "notified" ? "Benachrichtigt" : "Wartet"}
                          </Badge>
                        </div>
                        {w.profile?.email && (
                          <a href={`mailto:${w.profile.email}`} className="text-xs text-primary inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />{w.profile.email}
                          </a>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            seit {format(parseISO(w.created_at), "d. MMM, HH:mm", { locale: de })}
                            {w.notified_at && ` · informiert ${format(parseISO(w.notified_at), "d. MMM, HH:mm", { locale: de })}`}
                          </span>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => removeFromWaitlist(w.id)}>
                            Entfernen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </TabsContent>

              <TabsContent value="participants" className="space-y-3 pt-3">
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Teilnehmer hinzufügen
                </Button>
                {unpaidCount > 0 && (
                  <div className="rounded border border-destructive/60 bg-destructive/10 px-3 py-2 text-sm text-destructive font-medium">
                    {unpaidCount} {unpaidCount === 1 ? "Teilnehmer:in hat" : "Teilnehmer:innen haben"} noch nicht bezahlt
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Teilnehmer suchen…" className="pl-8" />
                </div>

                {loading ? <p className="text-sm text-muted-foreground">Laden…</p>
                  : filtered.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">Noch keine Buchungen.</p>
                  : filtered.map(b => (
                    <div
                      key={b.id}
                      className={`rounded p-3 space-y-1 border ${isUnpaid(b) ? "border-destructive/70 bg-destructive/10" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm flex items-center gap-2 flex-wrap">
                          {b.profile?.first_name} {b.profile?.last_name}
                          {isUnpaid(b) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 uppercase tracking-wide">
                              Nicht bezahlt
                            </Badge>
                          )}
                        </span>
                        <Select value={b.status} onValueChange={(v) => updateBookingStatus(b.id, v)}>
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">Freigegeben</SelectItem>
                            <SelectItem value="pending_payment">Zahlung offen</SelectItem>
                            <SelectItem value="cancelled">Storniert</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {b.profile?.email && (
                        <a href={`mailto:${b.profile.email}`} className="text-xs text-primary inline-flex items-center gap-1">
                          <Mail className="h-3 w-3" />{b.profile.email}
                        </a>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {b.paid_with_card
                            ? "Karte"
                            : b.voucher_code
                            ? `Gutschein ${b.voucher_code}`
                            : b.payment_method === "invoice"
                            ? "Rechnung"
                            : b.payment_method === "admin_grant"
                            ? "Kostenlos (Backoffice)"
                            : (b.payment_method ?? "–")}
                          {isUnpaid(b) && (
                            <span className="text-destructive font-medium">
                              {" "}· Zahlung offen{b.orders?.order_number ? ` (Best.-Nr. ${b.orders.order_number})` : ""}
                            </span>
                          )}
                        </span>
                        <span>€{Number(b.amount_paid || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
              </TabsContent>

              <TabsContent value="summary" className="space-y-2 pt-3 text-sm">
                <Row label="Buchungen gesamt" value={String(bookings.length)} />
                <Row label="Bestätigt" value={String(confirmed)} />
                <Row label="Nicht bezahlt" value={String(unpaidCount)} />
                <Row label="Warteliste" value={String(waitlist.length)} />
                <Row label="Auslastung" value={`${Math.round((confirmed / course.max_participants) * 100)}%`} />
                <Row label="Umsatz" value={`€${total.toFixed(2)}`} />
                {course.series_id && <Row label="Teil einer Serie" value="Ja" />}
                {course.internal_notes && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Interne Notizen</p>
                    <p className="text-sm whitespace-pre-wrap">{course.internal_notes}</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kurs absagen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle Buchungen werden storniert, Karten zurückgebucht und Kunden per E-Mail informiert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); cancelCourse(); }} disabled={busy}>
              {busy ? "Wird abgesagt…" : "Absagen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kurs unwiderruflich löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Alle zugehörigen Buchungen werden ebenfalls entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); deleteCourse(); }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy ? "Wird gelöscht…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setSelectedUserId(""); setCustomerSearch(""); setPayMode("free"); setVoucherCode(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Teilnehmer hinzufügen</DialogTitle>
            <DialogDescription>
              Buche einen Kunden manuell in „{course.title}" ein.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Kunde</Label>
              <Input
                placeholder="Name oder E-Mail suchen…"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
              <div className="max-h-40 overflow-y-auto border rounded-md">
                {filteredCustomers.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Keine Treffer</p>
                ) : filteredCustomers.map(c => (
                  <button
                    key={c.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(c.user_id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${selectedUserId === c.user_id ? "bg-accent" : ""}`}
                  >
                    <div className="font-medium">{c.first_name} {c.last_name}</div>
                    {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
                  </button>
                ))}
              </div>
              {selectedCustomer && (
                <p className="text-xs text-primary">Ausgewählt: {selectedCustomer.first_name} {selectedCustomer.last_name}</p>
              )}
            </div>

            {selectedUserId && (
              <div className="space-y-2">
                <Label>Abrechnung</Label>
                <Select value={payMode} onValueChange={(v) => setPayMode(v as "free" | "card" | "voucher")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Frei / Admin (0 €)</SelectItem>
                    <SelectItem value="card" disabled={customerCards.length === 0}>
                      Karten-Guthaben einlösen{customerCards.length === 0 ? " (keine Karte)" : ""}
                    </SelectItem>
                    <SelectItem value="voucher">Gutschein einlösen</SelectItem>
                  </SelectContent>
                </Select>
                {payMode === "card" && customerCards.length > 0 && (
                  <Select value={selectedCardId} onValueChange={setSelectedCardId}>
                    <SelectTrigger><SelectValue placeholder="Karte auswählen" /></SelectTrigger>
                    <SelectContent>
                      {customerCards.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.card_type === "five" ? "5er" : "10er"} – {c.remaining_credits}/{c.total_credits} verbleibend
                          {c.expires_at ? ` · bis ${format(parseISO(c.expires_at), "dd.MM.yyyy")}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {payMode === "voucher" && (
                  <div className="space-y-1">
                    <Input
                      placeholder="Gutscheincode eingeben"
                      value={voucherCode}
                      onChange={(e) => setVoucherCode(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Der Code muss den vollen Kurspreis abdecken (z. B. 100 %-Rabatt).
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Abbrechen</Button>
            <Button onClick={addParticipant} disabled={adding || !selectedUserId}>
              {adding ? "Wird hinzugefügt…" : "Hinzufügen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>

  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
