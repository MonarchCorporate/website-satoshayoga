import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Check, X, Download, RefreshCw } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen", requested: "Angefragt", approved: "Abgerechnet", rejected: "Abgelehnt",
};

export default function AdminTrainerPayouts() {
  const [payouts, setPayouts] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<Record<string, any>>({});
  const [earningsTotals, setEarningsTotals] = useState<{ pending: number; requested: number }>({ pending: 0, requested: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    await supabase.functions.invoke("compute-trainer-earnings", { body: {} });
    const [{ data: p }, { data: t }, { data: e }] = await Promise.all([
      supabase.from("trainer_payouts").select("*").order("requested_at", { ascending: false }),
      supabase.from("trainers").select("id, first_name, last_name"),
      supabase.from("trainer_earnings").select("status, amount"),
    ]);
    setPayouts(p ?? []);
    setTrainers(Object.fromEntries((t ?? []).map((x) => [x.id, x])));
    setEarningsTotals({
      pending: (e ?? []).filter((x) => x.status === "pending").reduce((s, x) => s + Number(x.amount), 0),
      requested: (e ?? []).filter((x) => x.status === "requested").reduce((s, x) => s + Number(x.amount), 0),
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const trainerName = (id: string) => {
    const t = trainers[id];
    return t ? `${t.first_name} ${t.last_name}` : "—";
  };

  const approve = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("approve-trainer-payout", {
      body: { payout_id: id, action: "approve" },
    });
    if (error || (data as any)?.error) return toast.error(error?.message ?? (data as any)?.error);
    toast.success("Abrechnung freigegeben & PDF erstellt.");
    load();
  };

  const reject = async (id: string) => {
    if (!confirm("Anfrage ablehnen?")) return;
    const { data, error } = await supabase.functions.invoke("approve-trainer-payout", {
      body: { payout_id: id, action: "reject" },
    });
    if (error || (data as any)?.error) return toast.error(error?.message ?? (data as any)?.error);
    toast.success("Abgelehnt.");
    load();
  };

  const downloadPdf = async (id: string) => {
    const { data, error } = await supabase.functions.invoke("trainer-payout-download", {
      body: { payout_id: id },
    });
    if (error || (data as any)?.error) return toast.error(error?.message ?? (data as any)?.error);
    window.open((data as any).signed_url, "_blank");
  };

  const open = payouts.filter((p) => p.status === "requested");
  const closed = payouts.filter((p) => p.status !== "requested");

  if (loading) return <div className="p-6">Laden…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl">Trainer-Abrechnungen</h1>
          <p className="text-sm text-muted-foreground">Anfragen prüfen und freigeben.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Aktualisieren</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Offene Anfragen</p><p className="text-2xl font-display">{open.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">In Anfrage (Summe)</p><p className="text-2xl font-display">{earningsTotals.requested.toFixed(2)} €</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Noch offen (Trainer)</p><p className="text-2xl font-display">{earningsTotals.pending.toFixed(2)} €</p></CardContent></Card>
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Offene Anfragen ({open.length})</TabsTrigger>
          <TabsTrigger value="all">Alle ({payouts.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="space-y-3">
          {open.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Keine offenen Anfragen.</p>}
          {open.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-medium">{trainerName(p.trainer_id)}</p>
                  <p className="text-xs text-muted-foreground font-mono">{p.payout_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(p.period_start).toLocaleDateString("de-DE")} – {new Date(p.period_end).toLocaleDateString("de-DE")} · {Number(p.total).toFixed(2)} €
                  </p>
                  {p.note && <p className="text-xs text-muted-foreground mt-1 italic">"{p.note}"</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => reject(p.id)}><X className="h-4 w-4 mr-1" />Ablehnen</Button>
                  <Button size="sm" onClick={() => approve(p.id)}><Check className="h-4 w-4 mr-1" />Freigeben & PDF</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="all">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/30">
                    <tr>
                      <th className="text-left p-3">Nr.</th>
                      <th className="text-left p-3">Trainer</th>
                      <th className="text-left p-3">Zeitraum</th>
                      <th className="text-right p-3">Summe</th>
                      <th className="text-left p-3">Status</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="p-3 font-mono text-xs">{p.payout_number}</td>
                        <td className="p-3">{trainerName(p.trainer_id)}</td>
                        <td className="p-3">{new Date(p.period_start).toLocaleDateString("de-DE")} – {new Date(p.period_end).toLocaleDateString("de-DE")}</td>
                        <td className="p-3 text-right">{Number(p.total).toFixed(2)} €</td>
                        <td className="p-3"><Badge variant="outline">{STATUS_LABEL[p.status]}</Badge></td>
                        <td className="p-3 text-right">
                          {p.pdf_path && <Button size="sm" variant="outline" onClick={() => downloadPdf(p.id)}><Download className="h-4 w-4 mr-1" />PDF</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
