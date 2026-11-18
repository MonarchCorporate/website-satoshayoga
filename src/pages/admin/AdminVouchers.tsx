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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Ticket, Shuffle, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import ImportVouchersDialog from "@/components/admin/ImportVouchersDialog";
import VoucherRedemptionsDialog from "@/components/admin/VoucherRedemptionsDialog";

type AppliesTo = "all" | "shop_products" | "courses" | "class_cards" | "video_courses";

type Voucher = {
  id: string;
  code: string;
  description: string | null;
  discount_percent: number;
  discount_amount_fixed: number | null;
  applies_to: AppliesTo[];
  product_ids: string[] | null;
  course_type_ids: string[] | null;
  class_card_types: string[] | null;
  video_course_ids: string[] | null;
  valid_from: string | null;
  valid_until: string | null;
  max_total_uses: number | null;
  max_uses_per_customer: number | null;
  is_single_use: boolean;
  is_active: boolean;
  times_used: number;
  created_at: string;
};

const scopeLabel: Record<AppliesTo, string> = {
  all: "Alles",
  shop_products: "Shop-Produkte",
  courses: "Kursbuchungen",
  class_cards: "Karten",
  video_courses: "Videokurse",
};


const CARD_TYPES: { value: string; label: string }[] = [
  { value: "5er", label: "5er-Karte" },
  { value: "10er", label: "10er-Karte" },
];

const emptyForm: Partial<Voucher> = {
  code: "",
  description: "",
  discount_percent: 10,
  discount_amount_fixed: null,
  applies_to: ["all"],
  product_ids: [],
  course_type_ids: [],
  class_card_types: [],
  video_course_ids: [],
  valid_from: null,
  valid_until: null,
  max_total_uses: null,
  max_uses_per_customer: null,
  is_single_use: false,
  is_active: true,
};



function randomCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function AdminVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Voucher | null>(null);
  const [form, setForm] = useState<Partial<Voucher>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "expired">("all");
  const [redemptionsFor, setRedemptionsFor] = useState<{ id: string; code: string } | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string; kind: string | null }[]>([]);
  const [courseTypes, setCourseTypes] = useState<{ id: string; name: string }[]>([]);
  const [videoCourses, setVideoCourses] = useState<{ id: string; title: string }[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [videoCourseSearch, setVideoCourseSearch] = useState("");


  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vouchers" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Fehler beim Laden");
    setVouchers(((data as any) ?? []) as Voucher[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    (async () => {
      const [p, c, vc] = await Promise.all([
        supabase.from("products").select("id, name, kind, is_active").order("name"),
        supabase.from("course_types").select("id, name").order("name"),
        supabase.from("video_courses" as any).select("id, title").order("title"),
      ]);
      setProducts(((p.data as any) ?? []) as any);
      setCourseTypes(((c.data as any) ?? []) as any);
      setVideoCourses(((vc.data as any) ?? []) as any);
    })();
  }, []);



  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();
    return vouchers.filter((v) => {
      if (q && !v.code.toLowerCase().includes(q) && !(v.description ?? "").toLowerCase().includes(q)) return false;
      const expired = v.valid_until && new Date(v.valid_until).getTime() < now;
      if (filter === "active") return v.is_active && !expired;
      if (filter === "inactive") return !v.is_active;
      if (filter === "expired") return !!expired;
      return true;
    });
  }, [vouchers, search, filter]);

  const openNew = () => {
    setEditing({ id: "" } as Voucher);
    setForm({ ...emptyForm, code: randomCode() });
  };

  const openEdit = (v: Voucher) => {
    setEditing(v);
    setForm({ ...v });
  };

  const toggleScope = (s: AppliesTo) => {
    const cur = new Set(form.applies_to ?? []);
    if (cur.has(s)) cur.delete(s);
    else cur.add(s);
    if (cur.size === 0) cur.add("all");
    // "all" and others are exclusive
    if (s === "all" && cur.has("all")) {
      setForm({ ...form, applies_to: ["all"] });
      return;
    }
    if (s !== "all" && cur.has(s)) cur.delete("all");
    setForm({ ...form, applies_to: Array.from(cur) as AppliesTo[] });
  };

  const handleSave = async () => {
    if (!form.code?.trim()) {
      toast.error("Bitte Code angeben.");
      return;
    }
    const pct = Number(form.discount_percent ?? 0);
    const fixed =
      form.discount_amount_fixed == null || (form.discount_amount_fixed as any) === ""
        ? null
        : Number(form.discount_amount_fixed);
    if (!(pct > 0) && !(fixed && fixed > 0)) {
      toast.error("Bitte Prozent-Rabatt oder Fixbetrag angeben.");
      return;
    }
    if (pct < 0 || pct > 100) {
      toast.error("Prozentsatz muss zwischen 0 und 100 liegen.");
      return;
    }
    setSaving(true);
    const applies = form.applies_to?.length ? form.applies_to : ["all"];
    const isAll = applies.includes("all");
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_percent: pct,
      discount_amount_fixed: fixed,
      applies_to: applies,
      product_ids: isAll || !applies.includes("shop_products") ? [] : (form.product_ids ?? []),
      course_type_ids: isAll || !applies.includes("courses") ? [] : (form.course_type_ids ?? []),
      class_card_types: isAll || !applies.includes("class_cards") ? [] : (form.class_card_types ?? []),
      video_course_ids: isAll || !applies.includes("video_courses") ? [] : (form.video_course_ids ?? []),

      valid_from: form.valid_from,
      valid_until: form.valid_until,
      max_total_uses:
        form.max_total_uses == null || (form.max_total_uses as any) === ""
          ? null
          : Number(form.max_total_uses),
      max_uses_per_customer:
        form.max_uses_per_customer == null || (form.max_uses_per_customer as any) === ""
          ? null
          : Number(form.max_uses_per_customer),
      is_single_use: !!form.is_single_use,
      is_active: !!form.is_active,
      ...(editing?.id && form.times_used != null && (form.times_used as any) !== ""
        ? { times_used: Math.max(0, Number(form.times_used)) }
        : {}),
    };

    const isNew = !editing?.id;
    const { error } = isNew
      ? await supabase.from("vouchers" as any).insert(payload)
      : await supabase.from("vouchers" as any).update(payload).eq("id", editing!.id);
    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success(isNew ? "Gutschein erstellt" : "Gutschein aktualisiert");
    setEditing(null);
    fetchData();
  };

  const handleDelete = async (v: Voucher) => {
    if (!confirm(`Gutschein „${v.code}" wirklich löschen?`)) return;
    const { error } = await supabase.from("vouchers" as any).delete().eq("id", v.id);
    if (error) toast.error("Löschen fehlgeschlagen: " + error.message);
    else {
      toast.success("Gelöscht");
      fetchData();
    }
  };

  const toggleActive = async (v: Voucher) => {
    await supabase.from("vouchers" as any).update({ is_active: !v.is_active }).eq("id", v.id);
    fetchData();
  };

  const statusBadge = (v: Voucher) => {
    const expired = v.valid_until && new Date(v.valid_until).getTime() < Date.now();
    if (expired) return <Badge variant="outline">Abgelaufen</Badge>;
    if (!v.is_active) return <Badge variant="outline">Inaktiv</Badge>;
    if (v.max_total_uses && v.times_used >= v.max_total_uses)
      return <Badge variant="outline">Verbraucht</Badge>;
    return <Badge>Aktiv</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <Ticket className="h-7 w-7 text-primary" />
          Gutscheine
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Code suchen…"
            className="w-56"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(["all", "active", "inactive", "expired"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "Alle" : f === "active" ? "Aktiv" : f === "inactive" ? "Inaktiv" : "Abgelaufen"}
            </Button>
          ))}
          <ImportVouchersDialog onDone={fetchData} />
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Neuer Gutschein
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-muted-foreground">Keine Gutscheine.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Rabatt</TableHead>
                  <TableHead>Gilt für</TableHead>
                  <TableHead>Gültig</TableHead>
                  <TableHead>Nutzungen</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setRedemptionsFor({ id: v.id, code: v.code })}
                  >
                    <TableCell className="font-mono font-medium">{v.code}</TableCell>
                    <TableCell>{v.discount_amount_fixed && Number(v.discount_amount_fixed) > 0 ? `${Number(v.discount_amount_fixed).toFixed(2)} €` : `${Number(v.discount_percent)}%`}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {v.applies_to.map((s) => {
                          const count =
                            s === "shop_products"
                              ? v.product_ids?.length ?? 0
                              : s === "courses"
                              ? v.course_type_ids?.length ?? 0
                              : s === "class_cards"
                              ? v.class_card_types?.length ?? 0
                              : s === "video_courses"
                              ? v.video_course_ids?.length ?? 0
                              : 0;

                          return (
                            <Badge key={s} variant="secondary" className="text-xs">
                              {scopeLabel[s] ?? s}
                              {count > 0 ? ` · ${count}` : ""}
                            </Badge>
                          );
                        })}
                      </div>
                    </TableCell>

                    <TableCell className="text-sm">
                      {v.valid_from || v.valid_until ? (
                        <>
                          {v.valid_from ? format(new Date(v.valid_from), "dd.MM.yy", { locale: de }) : "—"}
                          {" – "}
                          {v.valid_until ? format(new Date(v.valid_until), "dd.MM.yy", { locale: de }) : "∞"}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Unbegrenzt</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <button
                        type="button"
                        className="underline-offset-2 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRedemptionsFor({ id: v.id, code: v.code });
                        }}
                      >
                        {v.times_used}
                        {v.max_total_uses ? ` / ${v.max_total_uses}` : ""}
                      </button>
                      {v.max_uses_per_customer ? (
                        <span className="text-xs text-muted-foreground block">
                          max. {v.max_uses_per_customer} pro Kunde
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{statusBadge(v)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(v)}>
                        {v.is_active ? "Deaktivieren" : "Aktivieren"}
                      </Button>
                      <Button size="sm" variant="outline" className="ml-1" onClick={() => openEdit(v)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-1 text-destructive"
                        onClick={() => handleDelete(v)}
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

      <VoucherRedemptionsDialog
        voucherId={redemptionsFor?.id ?? null}
        voucherCode={redemptionsFor?.code}
        onClose={() => setRedemptionsFor(null)}
      />


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? "Gutschein bearbeiten" : "Neuer Gutschein"}
            </DialogTitle>
            <DialogDescription>
              Prozentualer Rabatt mit optionalen Einschränkungen.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Code *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.code ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, code: e.target.value.toUpperCase() })
                  }
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setForm({ ...form, code: randomCode() })}
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Zufall
                </Button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Interne Beschreibung</Label>
              <Textarea
                rows={2}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="z.B. Sommeraktion 2026"
              />
            </div>

            <div className="space-y-2">
              <Label>Rabatt in %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="1"
                value={form.discount_percent ?? 0}
                onChange={(e) =>
                  setForm({ ...form, discount_percent: Number(e.target.value) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Fixer Rabatt in €</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.discount_amount_fixed ?? ""}
                placeholder="optional"
                onChange={(e) =>
                  setForm({
                    ...form,
                    discount_amount_fixed:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Ist ein Fixbetrag gesetzt, wird dieser statt des Prozentsatzes angewendet.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Gilt für</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["all", "shop_products", "courses", "class_cards", "video_courses"] as AppliesTo[]).map(
                  (s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={(form.applies_to ?? []).includes(s)}
                        onCheckedChange={() => toggleScope(s)}
                      />
                      <span className="text-sm">{scopeLabel[s]}</span>
                    </label>
                  )
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                „Alles" rabattiert den gesamten Warenkorb. Andernfalls werden nur passende Artikel rabattiert.
              </p>
            </div>

            {(form.applies_to ?? []).includes("shop_products") && (
              <div className="space-y-2 md:col-span-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Gültig für Shop-Produkte</Label>
                  <Input
                    placeholder="Suchen…"
                    className="h-8 w-48"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leer lassen = gilt für alle Shop-Produkte.
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {products
                    .filter((p) => p.kind !== "card")
                    .filter((p) =>
                      productSearch
                        ? p.name.toLowerCase().includes(productSearch.toLowerCase())
                        : true
                    )
                    .map((p) => {
                      const selected = (form.product_ids ?? []).includes(p.id);
                      return (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 rounded p-1.5 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => {
                              const cur = new Set(form.product_ids ?? []);
                              selected ? cur.delete(p.id) : cur.add(p.id);
                              setForm({ ...form, product_ids: Array.from(cur) });
                            }}
                          />
                          <span className="text-sm">{p.name}</span>
                        </label>
                      );
                    })}
                  {products.filter((p) => p.kind !== "card").length === 0 && (
                    <p className="text-xs text-muted-foreground">Keine Produkte vorhanden.</p>
                  )}
                </div>
                {(form.product_ids ?? []).length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {(form.product_ids ?? []).length} ausgewählt
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, product_ids: [] })}
                    >
                      Auswahl leeren
                    </Button>
                  </div>
                )}
              </div>
            )}

            {(form.applies_to ?? []).includes("courses") && (
              <div className="space-y-2 md:col-span-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Gültig für Kursarten</Label>
                  <Input
                    placeholder="Suchen…"
                    className="h-8 w-48"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leer lassen = gilt für alle Kursarten.
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {courseTypes
                    .filter((c) =>
                      courseSearch
                        ? c.name.toLowerCase().includes(courseSearch.toLowerCase())
                        : true
                    )
                    .map((c) => {
                      const selected = (form.course_type_ids ?? []).includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 rounded p-1.5 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => {
                              const cur = new Set(form.course_type_ids ?? []);
                              selected ? cur.delete(c.id) : cur.add(c.id);
                              setForm({ ...form, course_type_ids: Array.from(cur) });
                            }}
                          />
                          <span className="text-sm">{c.name}</span>
                        </label>
                      );
                    })}
                  {courseTypes.length === 0 && (
                    <p className="text-xs text-muted-foreground">Keine Kursarten vorhanden.</p>
                  )}
                </div>
                {(form.course_type_ids ?? []).length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {(form.course_type_ids ?? []).length} ausgewählt
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, course_type_ids: [] })}
                    >
                      Auswahl leeren
                    </Button>
                  </div>
                )}
              </div>
            )}

            {(form.applies_to ?? []).includes("class_cards") && (
              <div className="space-y-2 md:col-span-2 rounded-md border p-3">
                <Label>Gültig für Karten</Label>
                <p className="text-xs text-muted-foreground">
                  Leer lassen = gilt für alle Kartentypen.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {CARD_TYPES.map((c) => {
                    const selected = (form.class_card_types ?? []).includes(c.value);
                    return (
                      <label
                        key={c.value}
                        className="flex items-center gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => {
                            const cur = new Set(form.class_card_types ?? []);
                            selected ? cur.delete(c.value) : cur.add(c.value);
                            setForm({ ...form, class_card_types: Array.from(cur) });
                          }}
                        />
                        <span className="text-sm">{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {(form.applies_to ?? []).includes("video_courses") && (
              <div className="space-y-2 md:col-span-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label>Gültig für Videokurse</Label>
                  <Input
                    placeholder="Suchen…"
                    className="h-8 w-48"
                    value={videoCourseSearch}
                    onChange={(e) => setVideoCourseSearch(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leer lassen = gilt für alle Videokurse. Hinweis: Bei Abos wird der Rabatt nur auf die erste Zahlung angewendet, Folgezahlungen erfolgen zum regulären Preis.
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                  {videoCourses
                    .filter((c) =>
                      videoCourseSearch
                        ? c.title.toLowerCase().includes(videoCourseSearch.toLowerCase())
                        : true
                    )
                    .map((c) => {
                      const selected = (form.video_course_ids ?? []).includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 rounded p-1.5 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => {
                              const cur = new Set(form.video_course_ids ?? []);
                              selected ? cur.delete(c.id) : cur.add(c.id);
                              setForm({ ...form, video_course_ids: Array.from(cur) });
                            }}
                          />
                          <span className="text-sm">{c.title}</span>
                        </label>
                      );
                    })}
                  {videoCourses.length === 0 && (
                    <p className="text-xs text-muted-foreground">Keine Videokurse vorhanden.</p>
                  )}
                </div>
                {(form.video_course_ids ?? []).length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {(form.video_course_ids ?? []).length} ausgewählt
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, video_course_ids: [] })}
                    >
                      Auswahl leeren
                    </Button>
                  </div>
                )}
              </div>
            )}




            <div className="space-y-2">
              <Label>Gültig ab</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.valid_from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.valid_from
                      ? format(new Date(form.valid_from), "PPP", { locale: de })
                      : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={form.valid_from ? new Date(form.valid_from) : undefined}
                    onSelect={(d) =>
                      setForm({ ...form, valid_from: d ? d.toISOString() : null })
                    }
                    initialFocus
                    className="pointer-events-auto"
                  />
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setForm({ ...form, valid_from: null })}
                    >
                      Zurücksetzen
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Gültig bis</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !form.valid_until && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.valid_until
                      ? format(new Date(form.valid_until), "PPP", { locale: de })
                      : "—"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={form.valid_until ? new Date(form.valid_until) : undefined}
                    onSelect={(d) =>
                      setForm({
                        ...form,
                        valid_until: d
                          ? new Date(
                              d.getFullYear(),
                              d.getMonth(),
                              d.getDate(),
                              23,
                              59,
                              59
                            ).toISOString()
                          : null,
                      })
                    }
                    initialFocus
                    className="pointer-events-auto"
                  />
                  <div className="p-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setForm({ ...form, valid_until: null })}
                    >
                      Zurücksetzen
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2 md:col-span-2 rounded-md border p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium text-sm">Einmal-Code</p>
                  <p className="text-xs text-muted-foreground">
                    Nur 1× global einlösbar.
                  </p>
                </div>
                <Switch
                  checked={!!form.is_single_use}
                  onCheckedChange={(c) => setForm({ ...form, is_single_use: c })}
                />
              </label>
            </div>

            <div className="space-y-2">
              <Label>Max. Nutzungen gesamt</Label>
              <Input
                type="number"
                min={1}
                placeholder="unbegrenzt"
                disabled={!!form.is_single_use}
                value={form.max_total_uses ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_total_uses: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Max. Nutzungen pro Kunde</Label>
              <Input
                type="number"
                min={1}
                placeholder="unbegrenzt"
                disabled={!!form.is_single_use}
                value={form.max_uses_per_customer ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_uses_per_customer:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>

            {editing?.id ? (
              <div className="space-y-2 md:col-span-2">
                <Label>Aktuelle Nutzungen</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.times_used ?? 0}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      times_used: e.target.value === "" ? 0 : Number(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Manuell anpassen, z. B. um eine Einlösung zurückzusetzen. Beeinflusst nur den Zähler, nicht die Einlösungs-Historie.
                </p>
              </div>
            ) : null}

            <div className="space-y-2 md:col-span-2 rounded-md border p-3">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <p className="font-medium text-sm">Aktiv</p>
                  <p className="text-xs text-muted-foreground">
                    Inaktive Codes können nicht eingelöst werden.
                  </p>
                </div>
                <Switch
                  checked={!!form.is_active}
                  onCheckedChange={(c) => setForm({ ...form, is_active: c })}
                />
              </label>
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
