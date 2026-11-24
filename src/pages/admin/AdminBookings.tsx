import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";

const paymentLabel = (b: any) => {
  if (b.paid_with_card) return "Karte (Guthaben)";
  if (b.voucher_code) return `Gutschein (${b.voucher_code})`;
  switch (b.payment_method) {
    case "paypal": return "PayPal";
    case "invoice": return "Rechnung";
    case "voucher": return "Gutschein";
    case "card_credit": return "Karte (Guthaben)";
    case "admin_grant": return "Manuell (Admin)";
    case "sofort": return "Sofort";
    case "klarna": return "Klarna";
    case "free": return "Kostenfrei";
    default: return b.payment_method || "—";
  }
};

export default function AdminBookings() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelSearch, setCancelSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setError(null);

      // Active bookings: the newest 200. Cancellations: all of them, so older ones
      // can still be looked up (previously only cancellations among the newest
      // 200 bookings were visible).
      const [activeRes, cancelledRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("*")
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("bookings")
          .select("*")
          .eq("status", "cancelled")
          .order("updated_at", { ascending: false }),
      ]);
      const bookingsError = activeRes.error ?? cancelledRes.error;
      const bks = [...(activeRes.data ?? []), ...(cancelledRes.data ?? [])];

      if (cancelled) return;

      if (bookingsError) {
        setError("Buchungen konnten nicht geladen werden.");
        setBookings([]);
        setLoading(false);
        return;
      }

      const rows = bks ?? [];
      const userIds = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
      const courseIds = Array.from(new Set(rows.map((r: any) => r.course_id).filter(Boolean)));
      const orderIds = Array.from(new Set(rows.map((r: any) => r.order_id).filter(Boolean)));
      let profileMap: Record<string, any> = {};
      let courseMap: Record<string, any> = {};
      let orderMap: Record<string, any> = {};

      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", userIds);
        profileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p]));
      }

      if (courseIds.length) {
        const { data: courses } = await supabase
          .from("courses")
          .select("id, title, start_time")
          .in("id", courseIds);
        courseMap = Object.fromEntries((courses ?? []).map((c: any) => [c.id, c]));
      }

      if (orderIds.length) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, payment_method, status, total, payment_id")
          .in("id", orderIds);
        orderMap = Object.fromEntries((orders ?? []).map((o: any) => [o.id, o]));
      }

      if (cancelled) return;
      setBookings(rows.map((r: any) => ({
        ...r,
        profiles: profileMap[r.user_id],
        courses: courseMap[r.course_id],
        order: r.order_id ? orderMap[r.order_id] : null,
      })));
      setLoading(false);
    };

    fetchData();

    const channel = supabase
      .channel("admin-bookings-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => { fetchData(); }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const { active, cancelledList } = useMemo(() => {
    const active = bookings.filter((b) => b.status !== "cancelled");
    const cancelledList = bookings
      .filter((b) => b.status === "cancelled")
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return { active, cancelledList };
  }, [bookings]);

  const cancelledFiltered = useMemo(() => {
    const q = cancelSearch.trim().toLowerCase();
    if (!q) return cancelledList;
    return cancelledList.filter((b) =>
      [
        b.profiles?.first_name,
        b.profiles?.last_name,
        `${b.profiles?.first_name ?? ""} ${b.profiles?.last_name ?? ""}`,
        b.courses?.title,
        b.order?.order_number,
        b.courses?.start_time ? format(parseISO(b.courses.start_time), "d.M.yyyy dd.MM.yyyy", { locale: de }) : "",
      ]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q)),
    );
  }, [cancelledList, cancelSearch]);

  const renderActive = (rows: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Kunde</TableHead>
          <TableHead>Kurs</TableHead>
          <TableHead>Datum</TableHead>
          <TableHead>Zahlung</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Betrag</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b) => (
          <TableRow key={b.id}>
            <TableCell>
              {`${b.profiles?.first_name ?? ""} ${b.profiles?.last_name ?? ""}`.trim() || "Kunde"}
            </TableCell>
            <TableCell>{b.courses?.title ?? "Kurs"}</TableCell>
            <TableCell>
              {b.courses?.start_time ? format(parseISO(b.courses.start_time), "d. MMM · HH:mm", { locale: de }) : "—"}
            </TableCell>
            <TableCell className="text-sm">
              <div>{paymentLabel(b)}</div>
              {b.order?.order_number && (
                <div className="text-xs text-muted-foreground font-mono">{b.order.order_number}</div>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={b.status === "confirmed" ? "default" : "secondary"}>
                {b.status === "confirmed" ? "Bestätigt" : b.status === "pending_payment" ? "Zahlung offen" : "Warteliste"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">{Number(b.amount_paid).toFixed(2)} €</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const setRefunded = async (b: any, refunded: boolean) => {
    const { error } = await supabase.from("bookings").update({ refunded }).eq("id", b.id);
    if (error) { toast.error("Konnte nicht aktualisieren: " + error.message); return; }
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, refunded } : x)));
    toast.success(refunded ? "Als erstattet markiert." : "Erstattung zurückgesetzt.");
  };

  const reactivateBooking = async (b: any) => {
    if (!confirm("Diese Buchung wieder auf 'Bestätigt' setzen? Ein evtl. bereits ausgeführter Refund wird dadurch nicht rückgängig gemacht.")) return;
    const { error } = await supabase.from("bookings").update({ status: "confirmed" }).eq("id", b.id);
    if (error) { toast.error("Konnte nicht aktualisieren: " + error.message); return; }
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "confirmed" } : x)));
    toast.success("Buchung wieder aktiviert.");
  };

  const renderCancelled = (rows: any[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Storniert am</TableHead>
          <TableHead>Kunde</TableHead>
          <TableHead>Kurs</TableHead>
          <TableHead>Kurstermin</TableHead>
          <TableHead>Zahlung</TableHead>
          <TableHead>Erstattung</TableHead>
          <TableHead className="text-right">Betrag</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b) => {
          const needsManual =
            !b.refunded && !b.paid_with_card && Number(b.amount_paid) > 0;
          return (
            <TableRow key={b.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {b.updated_at ? format(parseISO(b.updated_at), "d. MMM yyyy · HH:mm", { locale: de }) : "—"}
              </TableCell>
              <TableCell>
                {`${b.profiles?.first_name ?? ""} ${b.profiles?.last_name ?? ""}`.trim() || "Kunde"}
              </TableCell>
              <TableCell>{b.courses?.title ?? "Kurs"}</TableCell>
              <TableCell className="text-sm">
                {b.courses?.start_time ? format(parseISO(b.courses.start_time), "d. MMM · HH:mm", { locale: de }) : "—"}
              </TableCell>
              <TableCell className="text-sm">
                <div>{paymentLabel(b)}</div>
                {b.order?.order_number && (
                  <div className="text-xs text-muted-foreground font-mono">{b.order.order_number}</div>
                )}
                {b.order?.payment_method === "paypal" && b.order?.payment_id && (
                  <div className="text-xs text-muted-foreground font-mono">PP: {b.order.payment_id}</div>
                )}
              </TableCell>
              <TableCell>
                {b.refunded ? (
                  <Badge variant="default">Erstattet</Badge>
                ) : b.paid_with_card ? (
                  <Badge variant="secondary">Guthaben zurück</Badge>
                ) : Number(b.amount_paid) === 0 ? (
                  <Badge variant="secondary">Nicht nötig</Badge>
                ) : (
                  <Badge variant="destructive">Manuell offen</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">{Number(b.amount_paid).toFixed(2)} €</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Erstattungsstatus</DropdownMenuLabel>
                    {b.refunded ? (
                      <DropdownMenuItem onClick={() => setRefunded(b, false)}>
                        Als „nicht erstattet" markieren
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setRefunded(b, true)}>
                        Als „erstattet" markieren
                        {needsManual && <span className="ml-2 text-xs text-muted-foreground">(manuell)</span>}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => reactivateBooking(b)}>
                      Stornierung zurücknehmen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );


  return (
    <div className="p-6">
      <h1 className="font-display text-3xl font-semibold mb-6">Buchungsverwaltung</h1>
      {loading ? (
        <p className="p-6 text-muted-foreground">Laden…</p>
      ) : error ? (
        <p className="p-6 text-sm text-destructive">{error}</p>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="active">Aktive Buchungen ({active.length})</TabsTrigger>
            <TabsTrigger value="cancelled">Stornos ({cancelledList.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="active">
            <Card>
              <CardContent className="p-0">
                {active.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">Keine Buchungen vorhanden.</p>
                ) : renderActive(active)}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="cancelled">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Input
                value={cancelSearch}
                onChange={(e) => setCancelSearch(e.target.value)}
                placeholder="Stornos durchsuchen (Name, Kurs, Datum, Bestellnr.)…"
                className="max-w-sm"
              />
              <span className="text-sm text-muted-foreground">
                {cancelSearch.trim()
                  ? `${cancelledFiltered.length} von ${cancelledList.length} Stornos`
                  : `Alle ${cancelledList.length} Stornos, neueste zuerst`}
              </span>
            </div>
            <Card>
              <CardContent className="p-0">
                {cancelledFiltered.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">
                    {cancelledList.length === 0 ? "Keine Stornierungen vorhanden." : "Keine Stornos zur Suche gefunden."}
                  </p>
                ) : renderCancelled(cancelledFiltered)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
