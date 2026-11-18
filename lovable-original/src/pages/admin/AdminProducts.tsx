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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Upload, CreditCard } from "lucide-react";

type Kind = "physical" | "digital" | "class_card" | "voucher";

type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  kind: Kind;
  price: number;
  tax_rate: number;
  stock: number | null;
  sku: string | null;
  is_active: boolean;
  sort_order: number;
  card_credits: number | null;
  card_validity_days: number | null;
};

const emptyProduct: Partial<Product> = {
  name: "",
  description: "",
  image_url: "",
  kind: "physical",
  price: 0,
  tax_rate: 0,
  stock: null,
  sku: "",
  is_active: true,
  sort_order: 0,
  card_credits: null,
  card_validity_days: null,
};

const kindLabel: Record<Kind, string> = {
  physical: "Physisches Produkt",
  digital: "Digitales Produkt",
  class_card: "Gruppenkarte (5er, 10er, …)",
  voucher: "Gutschein",
};

export default function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyProduct);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) toast.error("Fehler beim Laden");
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter !== "all" && p.kind !== filter) return false;
      if (!q) return true;
      return [p.name, p.sku, p.description].some((v) =>
        (v ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, filter]);

  const openNew = (kind: Kind = "physical") => {
    setEditing({ id: "" } as Product);
    if (kind === "class_card") {
      setForm({
        ...emptyProduct,
        kind: "class_card",
        card_credits: 5,
        card_validity_days: 365,
        tax_rate: 0,
      });
      setFilter("class_card");
    } else {
      setForm({ ...emptyProduct, kind });
    }
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...p });
  };

  const handleSave = async () => {
    if (!form.name) {
      toast.error("Name ist erforderlich");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description || null,
      image_url: form.image_url || null,
      kind: form.kind ?? "physical",
      price: Number(form.price ?? 0),
      tax_rate: 0,
      stock:
        form.stock === null || form.stock === undefined || (form.stock as any) === ""
          ? null
          : Number(form.stock),
      sku: form.sku || null,
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order ?? 0),
      card_credits:
        form.kind === "class_card" && form.card_credits != null
          ? Number(form.card_credits)
          : null,
      card_validity_days:
        form.kind === "class_card" && form.card_validity_days != null
          ? Number(form.card_validity_days)
          : null,
    };

    const isNew = !editing?.id;
    const { error } = isNew
      ? await supabase.from("products").insert(payload)
      : await supabase.from("products").update(payload).eq("id", editing!.id);

    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success(isNew ? "Produkt erstellt" : "Produkt aktualisiert");
    setEditing(null);
    fetchProducts();
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`„${p.name}" wirklich löschen?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error("Löschen fehlgeschlagen: " + error.message);
    else {
      toast.success("Gelöscht");
      fetchProducts();
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { upsert: false });
    if (error) {
      toast.error("Upload fehlgeschlagen: " + error.message);
    } else {
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setForm({ ...form, image_url: data.publicUrl });
      toast.success("Bild hochgeladen");
    }
    setUploading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold">Produkte</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Suchen…"
            className="w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Typen</SelectItem>
              <SelectItem value="physical">{kindLabel.physical}</SelectItem>
              <SelectItem value="digital">{kindLabel.digital}</SelectItem>
              <SelectItem value="class_card">{kindLabel.class_card}</SelectItem>
              <SelectItem value="voucher">{kindLabel.voucher}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => openNew("class_card")}>
            <CreditCard className="h-4 w-4 mr-2" />
            Neue Gruppenkarte
          </Button>
          <Button onClick={() => openNew()}>
            <Plus className="h-4 w-4 mr-2" />
            Neues Produkt
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-muted-foreground">Keine Produkte.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Preis</TableHead>
                  <TableHead>USt</TableHead>
                  <TableHead>Bestand / Karte</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium flex items-center gap-3">
                      {p.image_url && (
                        <img
                          src={p.image_url}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      )}
                      <div>
                        <div>{p.name}</div>
                        {p.sku && (
                          <div className="text-xs text-muted-foreground">
                            SKU: {p.sku}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{kindLabel[p.kind]}</Badge>
                    </TableCell>
                    <TableCell>{Number(p.price).toFixed(2)} €</TableCell>
                    <TableCell>0%</TableCell>
                    <TableCell>
                      {p.kind === "class_card" ? (
                        <span className="text-sm">
                          {p.card_credits ?? "—"} Stunden
                          {p.card_validity_days ? (
                            <span className="text-xs text-muted-foreground block">
                              {p.card_validity_days} Tage gültig
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span>{p.stock ?? "∞"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.is_active ? (
                        <Badge>Aktiv</Badge>
                      ) : (
                        <Badge variant="outline">Inaktiv</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 text-destructive"
                        onClick={() => handleDelete(p)}
                      >
                        <Trash2 className="h-4 w-4" />
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
            <DialogTitle>
              {editing?.id ? "Produkt bearbeiten" : "Neues Produkt"}
            </DialogTitle>
            <DialogDescription>
              Stammdaten, Preis und Bestand pflegen
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Name *</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Beschreibung</Label>
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Typ</Label>
              <Select
                value={form.kind ?? "physical"}
                onValueChange={(v) => setForm({ ...form, kind: v as Kind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">{kindLabel.physical}</SelectItem>
                  <SelectItem value="digital">{kindLabel.digital}</SelectItem>
                  <SelectItem value="class_card">
                    {kindLabel.class_card}
                  </SelectItem>
                  <SelectItem value="voucher">{kindLabel.voucher}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.kind !== "class_card" && (
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={form.sku ?? ""}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Preis (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price ?? 0}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
              />
            </div>
            {/* Kleinunternehmer §19 UStG – keine USt ausgewiesen (0%) */}
            {form.kind !== "class_card" && (
              <div className="space-y-2">
                <Label>Bestand (leer = unbegrenzt)</Label>
                <Input
                  type="number"
                  value={form.stock ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      stock:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>Sortierung</Label>
              <Input
                type="number"
                value={form.sort_order ?? 0}
                onChange={(e) =>
                  setForm({ ...form, sort_order: Number(e.target.value) })
                }
              />
            </div>

            {form.kind === "class_card" && (
              <>
                <div className="space-y-2 md:col-span-2">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                    1 Credit = 1 Kursbuchung – unabhängig vom Kurspreis. Lege z.B. eine 5er-Karte mit 5 Credits oder eine Jahreskarte mit 100 Credits an.
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Anzahl Stunden (Credits)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.card_credits ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        card_credits:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gültigkeit ab Kauf (Tage)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.card_validity_days ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        card_validity_days:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value),
                      })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    z.B. 365 = ein Jahr ab Kaufdatum
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label>Bild</Label>
              <div className="flex items-center gap-3">
                {form.image_url && (
                  <img
                    src={form.image_url}
                    alt=""
                    className="h-16 w-16 rounded object-cover"
                  />
                )}
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageUpload(f);
                  }}
                />
                {uploading && (
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Upload className="h-4 w-4" />
                    lädt…
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between md:col-span-2 pt-2">
              <Label htmlFor="active">Aktiv (im Shop sichtbar)</Label>
              <Switch
                id="active"
                checked={!!form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
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
    </div>
  );
}
