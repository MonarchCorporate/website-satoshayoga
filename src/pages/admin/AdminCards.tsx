import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Ban, Pencil, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";


type CardType = "five" | "ten";

export default function AdminCards() {
  const [cards, setCards] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState<string>("");
  const [cardType, setCardType] = useState<CardType>("ten");
  const [credits, setCredits] = useState<number>(10);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Details / manual edit dialog
  const [detailCard, setDetailCard] = useState<any | null>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editRemaining, setEditRemaining] = useState<number>(0);
  const [editExpiresAt, setEditExpiresAt] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);


  const loadCards = async () => {
    const { data: cardsData, error } = await supabase
      .from("class_cards")
      .select("*")
      .order("purchased_at", { ascending: false });
    if (error) {
      toast.error("Fehler beim Laden: " + error.message);
      setLoading(false);
      return;
    }
    const userIds = Array.from(new Set((cardsData ?? []).map((c: any) => c.user_id).filter(Boolean)));
    let profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p]));
    }
    setCards((cardsData ?? []).map((c: any) => ({ ...c, profiles: profileMap[c.user_id] ?? null })));
    setLoading(false);
  };

  const loadCustomers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .order("last_name", { ascending: true });
    setCustomers(data ?? []);
  };

  useEffect(() => {
    loadCards();
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers.slice(0, 50);
    return customers
      .filter((c) =>
        `${c.first_name ?? ""} ${c.last_name ?? ""} ${c.email ?? ""}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 50);
  }, [customers, customerSearch]);

  const filteredCards = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return cards;
    return cards.filter((c) =>
      `${c.profiles?.first_name ?? ""} ${c.profiles?.last_name ?? ""} ${c.profiles?.email ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [cards, search]);

  const resetForm = () => {
    setUserId("");
    setCardType("ten");
    setCredits(10);
    setExpiresAt("");
    setNote("");
    setCustomerSearch("");
  };

  const handleCardTypeChange = (v: CardType) => {
    setCardType(v);
    setCredits(v === "five" ? 5 : 10);
  };

  const handleSubmit = async () => {
    if (!userId) {
      toast.error("Bitte einen Kunden auswählen");
      return;
    }
    if (!credits || credits < 1) {
      toast.error("Guthaben muss mindestens 1 sein");
      return;
    }
    setSubmitting(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("class_cards").insert({
      user_id: userId,
      card_type: cardType,
      total_credits: credits,
      remaining_credits: credits,
      amount_paid: 0,
      payment_method: "admin_grant" as any,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      granted_by: auth.user?.id ?? null,
      grant_note: note || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Fehler: " + error.message);
      return;
    }
    toast.success("Karte erfolgreich zugewiesen");
    setOpen(false);
    resetForm();
    loadCards();
  };

  const selectedCustomer = customers.find((c) => c.user_id === userId);

  const handleCancel = async (card: any) => {
    const reason = window.prompt(
      `Karte von ${card.profiles?.first_name ?? ""} ${card.profiles?.last_name ?? ""} stornieren?\n\nOptionaler Grund:`,
      "",
    );
    if (reason === null) return;
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("class_cards")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: auth.user?.id ?? null,
        cancel_reason: reason || null,
        remaining_credits: 0,
      })
      .eq("id", card.id);
    if (error) {
      toast.error("Storno fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Karte storniert.");
    loadCards();
  };

  const openDetails = async (card: any) => {
    setDetailCard(card);
    setEditRemaining(card.remaining_credits);
    setEditExpiresAt(card.expires_at ? new Date(card.expires_at).toISOString().slice(0, 10) : "");
    setDetailLoading(true);
    setDetailHistory([]);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, status, refunded, created_at, updated_at, courses(title, start_time)")
      .eq("card_id", card.id)
      .eq("paid_with_card", true)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Historie konnte nicht geladen werden: " + error.message);
    } else {
      setDetailHistory(data ?? []);
    }
    setDetailLoading(false);
  };

  const saveEdit = async () => {
    if (!detailCard) return;
    const rem = Math.max(0, Math.floor(Number(editRemaining) || 0));
    if (rem > detailCard.total_credits) {
      toast.error(`Guthaben darf höchstens ${detailCard.total_credits} sein.`);
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from("class_cards")
      .update({
        remaining_credits: rem,
        expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
      })
      .eq("id", detailCard.id);
    setSavingEdit(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Karte aktualisiert.");
    setDetailCard({ ...detailCard, remaining_credits: rem, expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null });
    loadCards();
  };


  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold">Karten-Übersicht</h1>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Karte zuweisen
        </Button>
      </div>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Kunde suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : filteredCards.length === 0 ? (
            <p className="p-6 text-muted-foreground">Keine Karten vorhanden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Guthaben</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Gültig bis</TableHead>
                  <TableHead>Bezahlt</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCards.map((c) => {
                  const isGrant = c.payment_method === "admin_grant";
                  const isCancelled = c.status === "cancelled";
                  return (
                    <TableRow key={c.id} className={isCancelled ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        {c.profiles?.first_name} {c.profiles?.last_name}
                        {c.profiles?.email && (
                          <div className="text-xs text-muted-foreground">{c.profiles.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {c.card_type === "five" ? "5er" : c.card_type === "ten" ? "10er" : c.card_type}
                        </Badge>
                      </TableCell>
                      <TableCell className={isCancelled ? "line-through" : ""}>
                        {c.remaining_credits} / {c.total_credits}
                      </TableCell>
                      <TableCell>
                        {isGrant ? (
                          <Badge
                            className="bg-primary/15 text-primary hover:bg-primary/20"
                            title={c.grant_note ?? undefined}
                          >
                            Admin-Vergabe
                          </Badge>
                        ) : (
                          <Badge variant="outline">Gekauft</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isCancelled ? (
                          <Badge variant="destructive" title={c.cancel_reason ?? undefined}>
                            Storniert
                          </Badge>
                        ) : (
                          <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">
                            Aktiv
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.expires_at ? format(new Date(c.expires_at), "dd.MM.yyyy") : "—"}
                      </TableCell>
                      <TableCell>{Number(c.amount_paid).toFixed(2)} €</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetails(c)}
                            className="gap-1"
                          >
                            <History className="h-4 w-4" /> Details
                          </Button>
                          {!isCancelled && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(c)}
                              className="text-destructive hover:text-destructive gap-1"
                            >
                              <Ban className="h-4 w-4" /> Stornieren
                            </Button>
                          )}
                        </div>
                      </TableCell>

                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Karte zuweisen</DialogTitle>
            <DialogDescription>
              Weise einem Kunden direkt ein Kontingent zu — ohne Zahlung oder Rechnung.
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
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {filteredCustomers.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Keine Treffer</p>
                ) : (
                  filteredCustomers.map((c) => (
                    <button
                      key={c.user_id}
                      type="button"
                      onClick={() => setUserId(c.user_id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors ${
                        userId === c.user_id ? "bg-accent" : ""
                      }`}
                    >
                      <div className="font-medium">
                        {c.first_name} {c.last_name}
                      </div>
                      {c.email && (
                        <div className="text-xs text-muted-foreground">{c.email}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
              {selectedCustomer && (
                <p className="text-xs text-primary">
                  Ausgewählt: {selectedCustomer.first_name} {selectedCustomer.last_name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Kartentyp</Label>
                <Select value={cardType} onValueChange={(v) => handleCardTypeChange(v as CardType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="five">5er-Karte</SelectItem>
                    <SelectItem value="ten">10er-Karte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Guthaben</Label>
                <Input
                  type="number"
                  min={1}
                  value={credits}
                  onChange={(e) => setCredits(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gültig bis (optional)</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Notiz (intern, optional)</Label>
              <Textarea
                placeholder="z. B. Geschenk, Kulanz, Teamtraining…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || !userId}>
              {submitting ? "Wird zugewiesen…" : "Karte zuweisen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailCard} onOpenChange={(o) => { if (!o) setDetailCard(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Karte {detailCard?.card_type === "five" ? "5er" : "10er"} —{" "}
              {detailCard?.profiles?.first_name} {detailCard?.profiles?.last_name}
            </DialogTitle>
            <DialogDescription>
              Guthaben manuell anpassen und Einlöse-Historie einsehen.
            </DialogDescription>
          </DialogHeader>

          {detailCard && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 rounded-md border p-4 bg-muted/30">
                <div className="space-y-2">
                  <Label htmlFor="edit-remaining">
                    Guthaben (max. {detailCard.total_credits})
                  </Label>
                  <Input
                    id="edit-remaining"
                    type="number"
                    min={0}
                    max={detailCard.total_credits}
                    value={editRemaining}
                    onChange={(e) => setEditRemaining(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-expires">Gültig bis</Label>
                  <Input
                    id="edit-expires"
                    type="date"
                    value={editExpiresAt}
                    onChange={(e) => setEditExpiresAt(e.target.value)}
                  />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button onClick={saveEdit} disabled={savingEdit} className="gap-2">
                    <Pencil className="h-4 w-4" />
                    {savingEdit ? "Speichern…" : "Änderungen speichern"}
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" /> Einlöse-Historie
                </h3>
                {detailLoading ? (
                  <p className="text-sm text-muted-foreground">Laden…</p>
                ) : detailHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Buchungen mit dieser Karte.
                  </p>
                ) : (
                  <div className="border rounded-md max-h-80 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Eingelöst am</TableHead>
                          <TableHead>Kurs</TableHead>
                          <TableHead>Kurstermin</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailHistory.map((b: any) => {
                          const isCancelled = b.status === "cancelled";
                          const refunded = isCancelled && b.refunded;
                          return (
                            <TableRow key={b.id}>
                              <TableCell className="text-sm">
                                {format(new Date(b.created_at), "dd.MM.yyyy HH:mm", { locale: de })}
                              </TableCell>
                              <TableCell className="text-sm">
                                {b.courses?.title ?? "—"}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {b.courses?.start_time
                                  ? format(new Date(b.courses.start_time), "dd.MM.yyyy HH:mm", { locale: de })
                                  : "—"}
                              </TableCell>
                              <TableCell>
                                {refunded ? (
                                  <Badge className="bg-amber-500/15 text-amber-600 hover:bg-amber-500/20">
                                    Storniert · gutgeschrieben
                                  </Badge>
                                ) : isCancelled ? (
                                  <Badge variant="secondary">Storniert · verfallen</Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20">
                                    Eingelöst
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailCard(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}
