import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Trash2, Settings as SettingsIcon, Send } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf", scheduled: "Geplant", sending: "Wird gesendet…", sent: "Versendet", failed: "Fehler",
};

export default function AdminNewsletterCampaigns() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [optInCount, setOptInCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [{ data: cs }, { count }] = await Promise.all([
      supabase.from("newsletter_campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id", { head: true, count: "exact" }).eq("newsletter_opt_in", true),
    ]);
    setCampaigns(cs ?? []);
    setOptInCount(count ?? 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const { data, error } = await supabase.from("newsletter_campaigns").insert({
      subject: "Neue Newsletter-Kampagne",
      content_json: [],
      audience_filter: { type: "opt_in" },
    }).select("id").single();
    if (error) return toast.error(error.message);
    navigate(`/admin/newsletter/campaigns/${data.id}`);
  };

  const remove = async (id: string) => {
    if (!confirm("Kampagne wirklich löschen?")) return;
    const { error } = await supabase.from("newsletter_campaigns").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Gelöscht."); load(); }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-foreground">Newsletter</h1>
          <p className="text-sm text-muted-foreground">{optInCount} angemeldete Empfänger.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin/newsletter/settings"><SettingsIcon className="mr-2 h-4 w-4" />SMTP-Einstellungen</Link></Button>
          <Button onClick={create}><Plus className="mr-2 h-4 w-4" />Neue Kampagne</Button>
        </div>
      </div>

      {loading ? <div>Laden…</div> : campaigns.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Noch keine Kampagnen. Klicke auf <strong>Neue Kampagne</strong>, um zu starten.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-3">Betreff</th><th className="p-3">Status</th><th className="p-3">Erstellt</th><th className="p-3">Versendet</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{c.subject}</td>
                  <td className="p-3"><Badge variant={c.status === "sent" ? "default" : c.status === "failed" ? "destructive" : "secondary"}>{STATUS_LABEL[c.status] ?? c.status}</Badge></td>
                  <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("de-DE")}</td>
                  <td className="p-3 text-muted-foreground">{c.sent_at ? new Date(c.sent_at).toLocaleString("de-DE") : "–"}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" asChild><Link to={`/admin/newsletter/campaigns/${c.id}`}><Send className="h-3.5 w-3.5" /></Link></Button>
                    <Button size="sm" variant="ghost" asChild><Link to={`/admin/newsletter/campaigns/${c.id}/stats`}><BarChart3 className="h-3.5 w-3.5" /></Link></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
