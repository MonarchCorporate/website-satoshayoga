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
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { Eye, Download, FileText, ExternalLink } from "lucide-react";

const invoicePreviewHref = (path: string) => `/admin/orders/invoice-preview?path=${encodeURIComponent(path)}`;

type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

type Order = {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  subtotal: number;
  tax_total: number;
  total: number;
  payment_method: string | null;
  paid_at: string | null;
  billing_first_name: string | null;
  billing_last_name: string | null;
  billing_email: string | null;
  billing_street: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_country: string | null;
  invoice_number: string | null;
  invoice_pdf_path: string | null;
  invoice_issued_at: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  item_type: string;
};

const statusVariant: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  paid: "default",
  cancelled: "destructive",
  refunded: "outline",
};

const statusLabel: Record<OrderStatus, string> = {
  pending: "Offen",
  paid: "Bezahlt",
  cancelled: "Storniert",
  refunded: "Erstattet",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus | "invoice_open" | "open_all">("all");
  const [opened, setOpened] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const [bank, setBank] = useState<{ bank_name: string | null; iban: string | null; bic: string | null } | null>(null);

  useEffect(() => {
    supabase
      .from("company_settings")
      .select("bank_name, iban, bic")
      .maybeSingle()
      .then(({ data }) => setBank(data as any));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const path = opened?.invoice_pdf_path;
    setPreviewError(null);
    setPreviewUrl(null);
    if (!path) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.storage.from("invoices").download(path);
        if (cancelled) return;
        if (error || !data) {
          setPreviewError(error?.message || "PDF konnte nicht geladen werden.");
          setPreviewLoading(false);
          return;
        }
        const head = new Uint8Array(await data.slice(0, 5).arrayBuffer());
        const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
        if (!isPdf) {
          setPreviewError("Die geladene Datei ist keine gültige PDF.");
          setPreviewLoading(false);
          return;
        }
        objectUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        setPreviewUrl(objectUrl);
        setPreviewLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setPreviewError(e?.message || "Unbekannter Fehler beim Laden der Vorschau.");
        setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [opened?.invoice_pdf_path, previewReloadKey]);


  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("Fehler beim Laden");
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const openInvoiceCount = useMemo(
    () => orders.filter((o) => o.status === "pending" && o.payment_method === "invoice").length,
    [orders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter === "invoice_open") {
        if (!(o.status === "pending" && o.payment_method === "invoice")) return false;
      } else if (statusFilter === "open_all") {
        if (o.status !== "pending") return false;
      } else if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return [
        o.order_number,
        o.invoice_number,
        o.billing_first_name,
        o.billing_last_name,
        o.billing_email,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [orders, search, statusFilter]);


  const open = async (o: Order) => {
    setOpened(o);
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", o.id);
    setItems((data as OrderItem[]) ?? []);
  };

  const updateStatus = async (status: OrderStatus) => {
    if (!opened) return;
    setBusy(true);
    // Bei "als bezahlt markieren" für Rechnungskauf → RPC aufrufen, damit
    // Karten/Buchungen/Video-Zugänge freigeschaltet werden.
    if (status === "paid" && opened.payment_method === "invoice") {
      const { data, error } = await (supabase as any).rpc("mark_order_paid", { _order_id: opened.id });
      setBusy(false);
      if (error) { toast.error("Fehlgeschlagen: " + error.message); return; }
      const r = data as any;
      const parts = [
        r?.cards_activated ? `${r.cards_activated} Karte(n)` : null,
        r?.bookings_confirmed ? `${r.bookings_confirmed} Buchung(en)` : null,
        r?.video_access_activated ? `${r.video_access_activated} Videokurs-Zugang/-zugänge` : null,
      ].filter(Boolean);
      toast.success(parts.length ? `Bezahlt · freigeschaltet: ${parts.join(", ")}` : "Als bezahlt markiert");
      setOpened({ ...opened, status: "paid", paid_at: new Date().toISOString() });
      fetchOrders();
      return;
    }
    const patch: any = { status };
    if (status === "paid" && !opened.paid_at) patch.paid_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", opened.id);
    setBusy(false);
    if (error) toast.error("Fehlgeschlagen: " + error.message);
    else {
      toast.success("Status aktualisiert");
      setOpened({ ...opened, ...patch });
      fetchOrders();
    }
  };


  const downloadInvoice = async (path: string) => {
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
      toast.error(`Download fehlgeschlagen: ${e?.message ?? "Unbekannter Fehler"}`, {
        action: { label: "Erneut versuchen", onClick: () => downloadInvoice(path) },
        duration: 10000,
      });
    }
  };


  const generateInvoice = async () => {
    if (!opened) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke("generate-invoice", {
      body: { order_id: opened.id },
    });
    setBusy(false);
    if (error) toast.error("Rechnung konnte nicht erstellt werden");
    else {
      toast.success("Rechnung erstellt");
      fetchOrders();
      const refreshed = (await supabase.from("orders").select("*").eq("id", opened.id).maybeSingle()).data as Order | null;
      if (refreshed) setOpened(refreshed);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-3xl font-semibold">Bestellungen</h1>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Suchen (Nr., Name, E-Mail)…"
            className="w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open_all">Alle offenen Bestellungen</SelectItem>
              <SelectItem value="invoice_open">
                Auf Rechnung – offen {openInvoiceCount > 0 ? `(${openInvoiceCount})` : ""}
              </SelectItem>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="pending">Offen</SelectItem>
              <SelectItem value="paid">Bezahlt</SelectItem>
              <SelectItem value="cancelled">Storniert</SelectItem>
              <SelectItem value="refunded">Erstattet</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-muted-foreground">Keine Bestellungen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bestell-Nr.</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rechnung</TableHead>
                  <TableHead className="text-right">Summe</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-sm">
                      {o.order_number}
                    </TableCell>
                    <TableCell>
                      {format(parseISO(o.created_at), "d. MMM yyyy", { locale: de })}
                    </TableCell>
                    <TableCell>
                      {o.billing_first_name || o.billing_last_name
                        ? `${o.billing_first_name ?? ""} ${o.billing_last_name ?? ""}`.trim()
                        : "–"}
                      <div className="text-xs text-muted-foreground">
                        {o.billing_email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant[o.status]}>
                          {statusLabel[o.status]}
                        </Badge>
                        {o.payment_method === "invoice" && o.status === "pending" && (
                          <Badge variant="destructive" className="text-[10px]">
                            Auf Rechnung – offen
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {o.invoice_number ? (
                        <span className="font-mono text-xs">{o.invoice_number}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">–</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {Number(o.total).toFixed(2)} €
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {o.invoice_pdf_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadInvoice(o.invoice_pdf_path!)}
                            title={`Rechnung ${o.invoice_number ?? ""} herunterladen`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => open(o)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bestellung {opened?.order_number}</DialogTitle>
            <DialogDescription>
              {opened &&
                format(parseISO(opened.created_at), "EEEE, d. MMM yyyy · HH:mm", {
                  locale: de,
                })}
            </DialogDescription>
          </DialogHeader>

          {opened && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold mb-1">Rechnungsadresse</h4>
                  <div>
                    {opened.billing_first_name} {opened.billing_last_name}
                  </div>
                  <div>{opened.billing_email}</div>
                  <div>{opened.billing_street}</div>
                  <div>
                    {opened.billing_postal_code} {opened.billing_city}
                  </div>
                  <div>{opened.billing_country}</div>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Status</h4>
                  <Badge variant={statusVariant[opened.status]}>
                    {statusLabel[opened.status]}
                  </Badge>
                  <div className="mt-2">
                    Zahlungsmethode: {opened.payment_method ?? "–"}
                  </div>
                  <div>
                    Bezahlt am:{" "}
                    {opened.paid_at
                      ? format(parseISO(opened.paid_at), "d. MMM yyyy HH:mm", {
                          locale: de,
                        })
                      : "–"}
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-semibold mb-2">Positionen</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artikel</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Einzel</TableHead>
                      <TableHead className="text-right">USt</TableHead>
                      <TableHead className="text-right">Summe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>
                          <div className="font-medium">{it.name}</div>
                          {it.description && (
                            <div className="text-xs text-muted-foreground">
                              {it.description}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">
                          {Number(it.unit_price).toFixed(2)} €
                        </TableCell>
                        <TableCell className="text-right">0%</TableCell>
                        <TableCell className="text-right">
                          {Number(it.line_total).toFixed(2)} €
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <div className="w-72 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Zwischensumme</span>
                    <span>{Number(opened.subtotal).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between">
                    <span>USt (0% – §19 UStG)</span>
                    <span>0,00 €</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base pt-1 border-t">
                    <span>Gesamt</span>
                    <span>{Number(opened.total).toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="font-semibold">Rechnungs-Vorschau (PDF)</h4>
                  {opened.invoice_pdf_path && (
                    <div className="flex gap-2 flex-wrap">
                      {previewUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                        >
                          <a href={invoicePreviewHref(opened.invoice_pdf_path)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" /> In neuem Tab öffnen
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadInvoice(opened.invoice_pdf_path!)}
                      >
                        <Download className="h-4 w-4 mr-1" /> Herunterladen
                      </Button>
                    </div>
                  )}
                </div>
                {opened.invoice_pdf_path ? (
                  previewError ? (
                    <div className="rounded border border-destructive/40 bg-destructive/10 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-medium text-destructive">
                          Vorschau konnte nicht geladen werden
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {previewError} Chrome oder eine Erweiterung blockiert eventuell den Download. Öffne die PDF in einem neuen Tab oder lade sie direkt herunter.
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setPreviewReloadKey((k) => k + 1)}>
                          Erneut versuchen
                        </Button>
                        {previewUrl && (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a href={invoicePreviewHref(opened.invoice_pdf_path!)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-1" /> In neuem Tab öffnen
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => downloadInvoice(opened.invoice_pdf_path!)}>
                          <Download className="h-4 w-4 mr-1" /> PDF herunterladen
                        </Button>
                      </div>
                    </div>
                  ) : previewUrl ? (
                    <object
                      data={previewUrl}
                      type="application/pdf"
                      className="w-full h-[600px] rounded border border-border bg-white"
                      aria-label="Rechnungs-Vorschau"
                    >
                      <div className="p-4 text-sm space-y-3">
                        <p className="text-muted-foreground">
                          Dein Browser kann die PDF nicht inline anzeigen.
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a href={invoicePreviewHref(opened.invoice_pdf_path!)} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-1" /> In neuem Tab öffnen
                            </a>
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => downloadInvoice(opened.invoice_pdf_path!)}>
                            <Download className="h-4 w-4 mr-1" /> PDF herunterladen
                          </Button>
                        </div>
                      </div>
                    </object>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {previewLoading ? "Vorschau wird geladen…" : "Vorschau nicht verfügbar."}
                    </p>
                  )
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Noch keine Rechnung erstellt. Klicke unten auf „Rechnung erstellen".
                  </p>
                )}
              </div>


              {bank?.iban && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="font-semibold mb-1">Bankverbindung (auf Rechnung)</div>
                  {bank.bank_name && <div>{bank.bank_name}</div>}
                  <div>IBAN: <span className="font-mono">{bank.iban}</span></div>
                  {bank.bic && <div>BIC: <span className="font-mono">{bank.bic}</span></div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    Verwendungszweck: {opened.order_number}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            {opened?.invoice_pdf_path ? (
              <Button
                variant="outline"
                onClick={() => downloadInvoice(opened.invoice_pdf_path!)}
              >
                <Download className="h-4 w-4 mr-2" />
                Rechnung {opened.invoice_number}
              </Button>
            ) : (
              <Button variant="outline" onClick={generateInvoice} disabled={busy}>
                <FileText className="h-4 w-4 mr-2" />
                Rechnung erstellen
              </Button>
            )}
            {opened?.status !== "paid" && (
              <Button onClick={() => updateStatus("paid")} disabled={busy}>
                Als bezahlt markieren
              </Button>
            )}
            {opened?.status !== "cancelled" && (
              <Button
                variant="destructive"
                onClick={() => updateStatus("cancelled")}
                disabled={busy}
              >
                Stornieren
              </Button>
            )}
            {opened?.status === "paid" && (
              <Button
                variant="outline"
                onClick={() => updateStatus("refunded")}
                disabled={busy}
              >
                Als erstattet markieren
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
