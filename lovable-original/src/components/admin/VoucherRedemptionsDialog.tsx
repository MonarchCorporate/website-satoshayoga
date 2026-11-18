import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Props = {
  voucherId: string | null;
  voucherCode?: string | null;
  onClose: () => void;
};

type Row = {
  id: string;
  redeemed_at: string;
  discount_amount: number | null;
  customer: string;
  target: string;
};

export default function VoucherRedemptionsDialog({ voucherId, voucherCode, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!voucherId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: reds } = await supabase
        .from("voucher_redemptions")
        .select("id, redeemed_at, discount_amount, user_id, order_id, booking_id")
        .eq("voucher_id", voucherId)
        .order("redeemed_at", { ascending: false });

      const list = reds ?? [];
      const userIds = Array.from(new Set(list.map((r: any) => r.user_id).filter(Boolean)));
      const orderIds = Array.from(new Set(list.map((r: any) => r.order_id).filter(Boolean)));
      const bookingIds = Array.from(new Set(list.map((r: any) => r.booking_id).filter(Boolean)));

      const [profRes, orderRes, itemRes, bookRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase.from("orders").select("id, order_number").in("id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
        orderIds.length
          ? supabase.from("order_items").select("order_id, name, quantity").in("order_id", orderIds)
          : Promise.resolve({ data: [] as any[] }),
        bookingIds.length
          ? supabase.from("bookings").select("id, course_id").in("id", bookingIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const profileMap = Object.fromEntries((profRes.data ?? []).map((p: any) => [p.user_id, p]));
      const orderMap = Object.fromEntries((orderRes.data ?? []).map((o: any) => [o.id, o]));
      const itemsByOrder: Record<string, any[]> = {};
      for (const it of (itemRes.data ?? []) as any[]) {
        (itemsByOrder[it.order_id] ||= []).push(it);
      }
      const bookingMap = Object.fromEntries((bookRes.data ?? []).map((b: any) => [b.id, b]));

      const courseIds = Array.from(
        new Set(Object.values(bookingMap).map((b: any) => b.course_id).filter(Boolean))
      );
      const courseRes = courseIds.length
        ? await supabase.from("courses").select("id, title, start_time").in("id", courseIds)
        : { data: [] as any[] };
      const courseMap = Object.fromEntries((courseRes.data ?? []).map((c: any) => [c.id, c]));

      const out: Row[] = list.map((r: any) => {
        const p = profileMap[r.user_id];
        const customer = p
          ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—"
          : "Gast";
        let target = "—";
        if (r.booking_id && bookingMap[r.booking_id]) {
          const c = courseMap[bookingMap[r.booking_id].course_id];
          if (c) {
            target = `${c.title}${
              c.start_time ? ` · ${format(new Date(c.start_time), "dd.MM.yyyy HH:mm", { locale: de })}` : ""
            }`;
          } else {
            target = "Kursbuchung";
          }
        } else if (r.order_id) {
          const o = orderMap[r.order_id];
          const items = itemsByOrder[r.order_id] ?? [];
          const itemStr = items
            .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ""}${i.name}`)
            .join(", ");
          target = `${o?.order_number ? `Bestellung ${o.order_number}` : "Bestellung"}${
            itemStr ? ` · ${itemStr}` : ""
          }`;
        }
        return {
          id: r.id,
          redeemed_at: r.redeemed_at,
          discount_amount: r.discount_amount,
          customer,
          target,
        };
      });

      if (!cancelled) {
        setRows(out);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [voucherId]);

  const totalDiscount = rows.reduce((s, r) => s + Number(r.discount_amount ?? 0), 0);

  return (
    <Dialog open={!!voucherId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Einlösungen {voucherCode ? `für ${voucherCode}` : ""}
          </DialogTitle>
          <DialogDescription>
            Übersicht wann und wofür dieser Gutschein eingelöst wurde.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Dieser Gutschein wurde noch nicht eingelöst.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Kundin</TableHead>
                  <TableHead>Eingelöst für</TableHead>
                  <TableHead className="text-right">Rabatt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(r.redeemed_at), "dd.MM.yyyy HH:mm", { locale: de })}
                    </TableCell>
                    <TableCell className="text-sm">{r.customer}</TableCell>
                    <TableCell className="text-sm">{r.target}</TableCell>
                    <TableCell className="text-sm text-right whitespace-nowrap">
                      {r.discount_amount != null
                        ? `${Number(r.discount_amount).toFixed(2)} €`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-between text-sm text-muted-foreground pt-2 border-t">
              <span>{rows.length} Einlösung{rows.length === 1 ? "" : "en"}</span>
              <span>Summe Rabatt: {totalDiscount.toFixed(2)} €</span>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
