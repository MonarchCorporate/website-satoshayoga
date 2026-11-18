import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Download, Send, AlertCircle, CheckCircle2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Offen",
  requested: "Angefragt",
  approved: "Abgerechnet",
  rejected: "Abgelehnt",
};

export default function MyEarnings() {
  const { user } = useAuth();
  const [trainer, setTrainer] = useState<any>(null);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [courseTitles, setCourseTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [periodStart, setPeriodStart] = useState(monthAgo);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: t } = await supabase.from("trainers").select("*").eq("user_id", user.id).maybeSingle();
    setTrainer(t);
    if (!t) { setLoading(false); return; }

    // refresh earnings server-side
    await supabase.functions.invoke("compute-trainer-earnings", { body: { trainer_id: t.id } });

    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("trainer_earnings").select("*").eq("trainer_id", t.id).order("course_date", { ascending: false }),
      supabase.from("trainer_payouts").select("*").eq("trainer_id", t.id).order("requested_at", { ascending: false }),
    ]);
    setEarnings(e ?? []);
    setPayouts(p ?? []);

    const ids = Array.from(new Set((e ?? []).map((x) => x.course_id)));
    if (ids.length) {
      const { data: cs } = await supabase.from("courses").select("id, title").in("id", ids);
      setCourseTitles(Object.fromEntries((cs ?? []).map((c) => [c.id, c.title])));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const totals = {
    pending: earnings.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.amount), 0),
    requested: earnings.filter((e) => e.status === "requested").reduce((s, e) => s + Number(e.amount), 0),
    yearTotal: earnings.filter((e) => new Date(e.course_date).getFullYear() === new Date().getFullYear())
      .reduce((s, e) => s + Number(e.amount), 0),
  };

  const submit = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("request-trainer-payout", {
      body: { period_start: periodStart, period_end: periodEnd, note },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      toast.error("Fehler: " + (error?.message ?? (data as any)?.error));
      return;
    }
    toast.success("Abrechnung angefragt.");
    setOpen(false);
    setNote("");
    load();
  };

  const downloadPdf = async (payoutId: string) => {
    const { data, error } = await supabase.functions.invoke("trainer-payout-download", {
      body: { payout_id: payoutId },
    });
    if (error || (data as any)?.error) {
      toast.error("Fehler: " + (error?.message ?? (data as any)?.error));
      return;
    }
    window.open((data as any).signed_url, "_blank");
  };

  if (loading) return <div className="p-6">Laden…</div>;
  if (!trainer) return (
    <div className="p-6">
      <Card><CardContent className="p-6 text-sm text-muted-foreground">
        Kein Trainerprofil verknüpft.
      </CardContent></Card>
    </div>
  );

  const profileComplete = trainer.street && trainer.postal_code && trainer.city;

  const startTs = new Date(periodStart + "T00:00:00").getTime();
  const endTs = new Date(periodEnd + "T23:59:59").getTime();
  const previewItems = earnings.filter((e) => {
    if (e.status !== "pending") return false;
    const t = new Date(e.course_date).getTime();
    return t >= startTs && t <= endTs;
  });
  const previewSubtotal = previewItems.reduce((s, e) => s + Number(e.amount), 0);
  const vatRate = trainer.is_small_business ? 0 : 19;
  const previewVat = +(previewSubtotal * (vatRate / 100)).toFixed(2);
  const previewTotal = +(previewSubtotal + previewVat).toFixed(2);
  const itemsWithoutTier = previewItems.filter((e) => !e.tier_id || Number(e.amount) === 0);
  const canSubmit = previewItems.length > 0 && profileComplete;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl">Mein Verdienst</h1>
          <p className="text-sm text-muted-foreground">Übersicht deiner gehaltenen Kurse und Abrechnungen.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={totals.pending <= 0}>
              <Send className="h-4 w-4 mr-1" /> Abrechnung anfordern
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Abrechnung anfordern</DialogTitle></DialogHeader>
            {!profileComplete && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>Bitte vervollständige zuerst deine Adresse unter „Mein Profil".</span>
              </div>
            )}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Von</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
                <div><Label>Bis</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
              </div>

              <div className="border border-border rounded-md">
                <div className="px-3 py-2 bg-secondary/30 text-sm font-medium flex items-center justify-between">
                  <span>Vorschau ({previewItems.length} {previewItems.length === 1 ? "Kurs" : "Kurse"})</span>
                  {previewItems.length > 0 && itemsWithoutTier.length === 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3" />geprüft</span>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {previewItems.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">Keine offenen Kurse in diesem Zeitraum.</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/10">
                        <tr>
                          <th className="text-left p-2">Kurs</th>
                          <th className="text-left p-2">Datum</th>
                          <th className="text-right p-2">TN</th>
                          <th className="text-right p-2">Betrag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewItems.map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="p-2">{courseTitles[e.course_id] ?? "—"}</td>
                            <td className="p-2">{new Date(e.course_date).toLocaleDateString("de-DE")}</td>
                            <td className="p-2 text-right">{e.participants_count}</td>
                            <td className="p-2 text-right">
                              {!e.tier_id || Number(e.amount) === 0 ? (
                                <span className="text-destructive">0,00 €</span>
                              ) : (
                                <>{Number(e.amount).toFixed(2)} €</>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {previewItems.length > 0 && (
                  <div className="border-t border-border p-3 space-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Zwischensumme</span><span>{previewSubtotal.toFixed(2)} €</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">USt ({vatRate}%)</span><span>{previewVat.toFixed(2)} €</span></div>
                    <div className="flex justify-between font-medium pt-1 border-t border-border"><span>Gesamt</span><span>{previewTotal.toFixed(2)} €</span></div>
                  </div>
                )}
              </div>

              {itemsWithoutTier.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-xs">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{itemsWithoutTier.length} {itemsWithoutTier.length === 1 ? "Kurs hat" : "Kurse haben"} keine passende Vergütungsstufe (0 €). Bitte mit dem Admin abklären.</span>
                </div>
              )}

              <div>
                <Label>Notiz (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <Button onClick={submit} disabled={submitting || !canSubmit} className="w-full">
                Anfrage senden ({previewTotal.toFixed(2)} €)
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Offen</p><p className="text-2xl font-display">{totals.pending.toFixed(2)} €</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">In Anfrage</p><p className="text-2xl font-display">{totals.requested.toFixed(2)} €</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Gesamt {new Date().getFullYear()}</p><p className="text-2xl font-display">{totals.yearTotal.toFixed(2)} €</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Gehaltene Kurse</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="text-left p-3">Kurs</th>
                  <th className="text-left p-3">Datum</th>
                  <th className="text-right p-3">TN</th>
                  <th className="text-right p-3">Vergütung</th>
                  <th className="text-left p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-3">{courseTitles[e.course_id] ?? "—"}</td>
                    <td className="p-3">{new Date(e.course_date).toLocaleDateString("de-DE")}</td>
                    <td className="p-3 text-right">{e.participants_count}</td>
                    <td className="p-3 text-right">{Number(e.amount).toFixed(2)} €</td>
                    <td className="p-3"><Badge variant="outline">{STATUS_LABEL[e.status]}</Badge></td>
                  </tr>
                ))}
                {earnings.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Noch keine Verdienste.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Meine Abrechnungen</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30">
                <tr>
                  <th className="text-left p-3">Nr.</th>
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
                    <td className="p-3">{new Date(p.period_start).toLocaleDateString("de-DE")} – {new Date(p.period_end).toLocaleDateString("de-DE")}</td>
                    <td className="p-3 text-right">{Number(p.total).toFixed(2)} €</td>
                    <td className="p-3"><Badge variant="outline">{STATUS_LABEL[p.status]}</Badge></td>
                    <td className="p-3 text-right">
                      {p.pdf_path && (
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(p.id)}>
                          <Download className="h-4 w-4 mr-1" />PDF
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Noch keine Abrechnungen.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
