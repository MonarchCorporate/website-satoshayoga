import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Search } from "lucide-react";
import ImportCustomersDialog from "@/components/admin/ImportCustomersDialog";
import UnconfirmedUsersCard from "@/components/admin/UnconfirmedUsersCard";

type Profile = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  birthday: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
};

type CardRow = {
  id: string;
  card_type: string;
  total_credits: number;
  remaining_credits: number;
  purchased_at: string;
  expires_at: string | null;
  amount_paid: number;
};

type BookingRow = {
  id: string;
  status: string;
  created_at: string;
  amount_paid: number;
  course: { title: string; start_time: string } | null;
};

type OrderItem = {
  item_type: string | null;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string | null;
  total: number | null;
  payment_method: string | null;
  items: OrderItem[] | null;
};

const emptyForm: Partial<Profile> = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  birthday: "",
  street: "",
  postal_code: "",
  city: "",
  country: "Deutschland",
};

export default function AdminCustomers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [form, setForm] = useState<Partial<Profile>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<CardRow | null>(null);
  const [cardRemaining, setCardRemaining] = useState<string>("");
  const [cardExpires, setCardExpires] = useState<string>("");
  const [savingCard, setSavingCard] = useState(false);


  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Fehler beim Laden der Kunden");
    setProfiles((data as Profile[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) =>
      [p.first_name, p.last_name, p.email, p.phone, p.city, p.postal_code]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q))
    );
  }, [profiles, search]);

  const loadDetails = async (userId: string) => {
    setDetailsLoading(true);
    const [cardsRes, bookingsRes, ordersRes] = await Promise.all([
      supabase
        .from("class_cards")
        .select("*")
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false }),
      supabase
        .from("bookings")
        .select(
          "id, status, created_at, amount_paid, course:courses(title, start_time)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select(
          "id, order_number, created_at, status, total, payment_method, items:order_items(item_type, description, quantity, unit_price)"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);
    setCards((cardsRes.data as CardRow[]) ?? []);
    setBookings((bookingsRes.data as any) ?? []);
    setOrders((ordersRes.data as any) ?? []);
    setDetailsLoading(false);
  };

  const openView = async (p: Profile) => {
    setViewing(p);
    setExpandedOrder(null);
    setCards([]);
    setBookings([]);
    setOrders([]);
    await loadDetails(p.user_id);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    setForm({
      first_name: p.first_name ?? "",
      last_name: p.last_name ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      birthday: p.birthday ?? "",
      street: p.street ?? "",
      postal_code: p.postal_code ?? "",
      city: p.city ?? "",
      country: p.country ?? "Deutschland",
    });
  };


  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    const payload = {
      first_name: form.first_name || null,
      last_name: form.last_name || null,
      email: form.email || null,
      phone: form.phone || null,
      birthday: form.birthday ? form.birthday : null,
      street: form.street || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      country: form.country || null,
    };
    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Kunde aktualisiert");
    setEditing(null);
    fetchProfiles();
  };

  const openCardEdit = (c: CardRow) => {
    setEditingCard(c);
    setCardRemaining(String(c.remaining_credits));
    setCardExpires(c.expires_at ? c.expires_at.slice(0, 10) : "");
  };

  const saveCardEdit = async () => {
    if (!editingCard) return;
    const remaining = Number(cardRemaining);
    if (
      !Number.isInteger(remaining) ||
      remaining < 0 ||
      remaining > editingCard.total_credits
    ) {
      toast.error(
        `Bitte eine ganze Zahl zwischen 0 und ${editingCard.total_credits} eingeben.`
      );
      return;
    }
    setSavingCard(true);
    const { error } = await supabase
      .from("class_cards")
      .update({
        remaining_credits: remaining,
        expires_at: cardExpires ? cardExpires : null,
      })
      .eq("id", editingCard.id);
    setSavingCard(false);
    if (error) {
      toast.error("Karte konnte nicht gespeichert werden: " + error.message);
      return;
    }
    toast.success("Karte aktualisiert");
    setEditingCard(null);
    const target = viewing ?? editing;
    if (target) await loadDetails(target.user_id);
  };

  const remainingBadge = (r: number) => {
    if (r <= 0) return "destructive" as const;
    if (r <= 2) return "outline" as const;
    return "secondary" as const;
  };

  const orderStatusVariant = (s: string | null) => {
    if (!s) return "secondary" as const;
    if (["paid", "fulfilled", "completed"].includes(s)) return "default" as const;
    if (["cancelled", "refunded", "failed", "payment_mismatch"].includes(s))
      return "destructive" as const;
    return "secondary" as const;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold">Kundenverwaltung</h1>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen (Name, E-Mail, Ort…)"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ImportCustomersDialog onDone={fetchProfiles} />
        </div>
      </div>

      <UnconfirmedUsersCard />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-muted-foreground">Keine Kunden gefunden.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>E-Mail</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Anschrift</TableHead>
                  <TableHead>Geburtstag</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => openView(p)}
                  >
                    <TableCell className="font-medium">
                      {p.first_name || p.last_name
                        ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()
                        : "–"}
                    </TableCell>
                    <TableCell>{p.email || "–"}</TableCell>
                    <TableCell>{p.phone || "–"}</TableCell>
                    <TableCell>
                      {p.street || p.city
                        ? `${p.street ?? ""}${p.street ? ", " : ""}${
                            p.postal_code ?? ""
                          } ${p.city ?? ""}`.trim()
                        : "–"}
                    </TableCell>
                    <TableCell>
                      {p.birthday
                        ? format(parseISO(p.birthday), "d. MMM yyyy", {
                            locale: de,
                          })
                        : "–"}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Bearbeiten
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Stammdaten bearbeiten</DialogTitle>
            <DialogDescription>
              Kontakt- und Adressdaten des Kunden aktualisieren
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vorname</Label>
              <Input
                value={form.first_name ?? ""}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Nachname</Label>
              <Input
                value={form.last_name ?? ""}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>E-Mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={form.phone ?? ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Geburtsdatum</Label>
              <Input
                type="date"
                value={form.birthday ?? ""}
                onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-1" />
            <div className="space-y-2 md:col-span-2">
              <Label>Straße & Hausnummer</Label>
              <Input
                value={form.street ?? ""}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>PLZ</Label>
              <Input
                value={form.postal_code ?? ""}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ort</Label>
              <Input
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Land</Label>
              <Input
                value={form.country ?? ""}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewing
                ? `${viewing.first_name ?? ""} ${viewing.last_name ?? ""}`.trim() ||
                  "Kundendetails"
                : "Kundendetails"}
            </DialogTitle>
            <DialogDescription>
              {viewing?.email ?? ""}
              {viewing?.phone ? ` · ${viewing.phone}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (viewing) {
                  const p = viewing;
                  setViewing(null);
                  openEdit(p);
                }
              }}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Stammdaten bearbeiten
            </Button>
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold mb-2">
              Zugewiesene Karten
            </h3>
            {detailsLoading ? (
              <p className="text-sm text-muted-foreground">Laden…</p>
            ) : cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Karten.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Typ</TableHead>
                    <TableHead>Verbleibend</TableHead>
                    <TableHead>Gekauft</TableHead>
                    <TableHead>Gültig bis</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Badge variant="secondary">{c.card_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={remainingBadge(c.remaining_credits)}>
                          {c.remaining_credits} / {c.total_credits}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(parseISO(c.purchased_at), "d. MMM yyyy", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell>
                        {c.expires_at
                          ? format(parseISO(c.expires_at), "d. MMM yyyy", {
                              locale: de,
                            })
                          : "–"}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(c.amount_paid).toFixed(2)} €
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCardEdit(c)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Guthaben
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold mb-2">
              Buchungshistorie
            </h3>
            {detailsLoading ? (
              <p className="text-sm text-muted-foreground">Laden…</p>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Buchungen.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kurs</TableHead>
                    <TableHead>Termin</TableHead>
                    <TableHead>Gebucht am</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Preis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {b.course?.title ?? "–"}
                      </TableCell>
                      <TableCell>
                        {b.course?.start_time
                          ? format(
                              parseISO(b.course.start_time),
                              "d. MMM yyyy, HH:mm",
                              { locale: de }
                            )
                          : "–"}
                      </TableCell>
                      <TableCell>
                        {format(parseISO(b.created_at), "d. MMM yyyy", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            b.status === "confirmed"
                              ? "default"
                              : b.status === "cancelled"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(b.amount_paid).toFixed(2)} €
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div>
            <h3 className="font-display text-lg font-semibold mb-2">
              Kaufhistorie
            </h3>
            {detailsLoading ? (
              <p className="text-sm text-muted-foreground">Laden…</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Bestellungen.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Bestellung</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Zahlart</TableHead>
                    <TableHead className="text-right">Summe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const isOpen = expandedOrder === o.id;
                    return (
                      <>
                        <TableRow
                          key={o.id}
                          className="cursor-pointer"
                          onClick={() =>
                            setExpandedOrder(isOpen ? null : o.id)
                          }
                        >
                          <TableCell>
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            #{o.order_number ?? o.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {format(parseISO(o.created_at), "d. MMM yyyy", {
                              locale: de,
                            })}
                          </TableCell>
                          <TableCell>
                            <Badge variant={orderStatusVariant(o.status)}>
                              {o.status ?? "–"}
                            </Badge>
                          </TableCell>
                          <TableCell>{o.payment_method ?? "–"}</TableCell>
                          <TableCell className="text-right">
                            {Number(o.total ?? 0).toFixed(2)} €
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow key={o.id + "-items"}>
                            <TableCell colSpan={6} className="bg-muted/30">
                              {(o.items ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">
                                  Keine Positionen.
                                </p>
                              ) : (
                                <ul className="py-2 space-y-1 text-sm">
                                  {(o.items ?? []).map((it, idx) => (
                                    <li
                                      key={idx}
                                      className="flex justify-between gap-4"
                                    >
                                      <span>
                                        <span className="text-muted-foreground">
                                          {it.item_type ?? "item"} ·{" "}
                                        </span>
                                        {it.quantity ?? 1}×{" "}
                                        {it.description ?? "–"}
                                      </span>
                                      <span className="tabular-nums">
                                        {Number(
                                          (it.unit_price ?? 0) *
                                            (it.quantity ?? 1)
                                        ).toFixed(2)}{" "}
                                        €
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>

      <Dialog
        open={!!editingCard}
        onOpenChange={(o) => !o && setEditingCard(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Karten-Guthaben bearbeiten</DialogTitle>
            <DialogDescription>
              {editingCard?.card_type} · gekauft am{" "}
              {editingCard
                ? format(parseISO(editingCard.purchased_at), "d. MMM yyyy", {
                    locale: de,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Verbleibende Einheiten (max. {editingCard?.total_credits ?? 0})
              </Label>
              <Input
                type="number"
                min={0}
                max={editingCard?.total_credits ?? 0}
                step={1}
                value={cardRemaining}
                onChange={(e) => setCardRemaining(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Gültig bis (optional)</Label>
              <Input
                type="date"
                value={cardExpires}
                onChange={(e) => setCardExpires(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCard(null)}>
              Abbrechen
            </Button>
            <Button onClick={saveCardEdit} disabled={savingCard}>
              {savingCard ? "Speichern…" : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
