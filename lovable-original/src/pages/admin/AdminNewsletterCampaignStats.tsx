import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export default function AdminNewsletterCampaignStats() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<any>(null);
  const [recipients, setRecipients] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: r }, { data: l }] = await Promise.all([
        supabase.from("newsletter_campaigns").select("*").eq("id", id!).maybeSingle(),
        supabase.from("newsletter_recipients").select("*").eq("campaign_id", id!).order("sent_at", { ascending: false }),
        supabase.from("newsletter_links").select("*, newsletter_clicks(count)").eq("campaign_id", id!),
      ]);
      setCampaign(c);
      setRecipients(r ?? []);
      setLinks(l ?? []);
    })();
  }, [id]);

  if (!campaign) return <div className="p-6">Laden…</div>;

  const total = recipients.length;
  const sent = recipients.filter((r) => r.status === "sent" || r.status === "bounced").length;
  const opened = recipients.filter((r) => r.opened_at).length;
  const clicked = recipients.filter((r) => r.click_count > 0).length;
  const bounced = recipients.filter((r) => r.status === "bounced").length;
  const failed = recipients.filter((r) => r.status === "failed").length;

  const pct = (n: number) => sent ? `${Math.round((n / sent) * 100)}%` : "–";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/admin/newsletter"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="font-display text-3xl text-foreground">{campaign.subject}</h1>
          <p className="text-sm text-muted-foreground">Versendet am {campaign.sent_at ? new Date(campaign.sent_at).toLocaleString("de-DE") : "–"}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Stat label="Versendet" value={sent} sub={`${total} Empfänger`} />
        <Stat label="Geöffnet" value={opened} sub={pct(opened)} />
        <Stat label="Geklickt" value={clicked} sub={pct(clicked)} />
        <Stat label="Bounced" value={bounced} />
        <Stat label="Fehler" value={failed} />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Links & Klicks</div>
          {links.length === 0 ? <div className="text-xs text-muted-foreground">Keine Links in dieser Kampagne.</div> : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-2">Link</th><th className="text-left p-2">Label</th><th className="text-right p-2">Klicks</th></tr></thead>
              <tbody>
                {links.map((l) => (
                  <tr key={l.id} className="border-t border-border"><td className="p-2 truncate max-w-md"><a href={l.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{l.url}</a></td><td className="p-2 text-muted-foreground">{l.label ?? "–"}</td><td className="p-2 text-right">{l.newsletter_clicks?.[0]?.count ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 text-sm font-semibold">Empfänger</div>
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-2">E-Mail</th><th className="text-left p-2">Status</th><th className="text-left p-2">Gesendet</th><th className="text-left p-2">Geöffnet</th><th className="text-left p-2">Klicks</th></tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-2">{r.email}</td>
                  <td className="p-2"><Badge variant={r.status === "sent" ? "secondary" : r.status === "bounced" ? "destructive" : r.status === "failed" ? "destructive" : "outline"}>{r.status}</Badge></td>
                  <td className="p-2 text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleString("de-DE") : "–"}</td>
                  <td className="p-2 text-muted-foreground">{r.opened_at ? `${new Date(r.opened_at).toLocaleString("de-DE")} (${r.open_count}×)` : "–"}</td>
                  <td className="p-2 text-muted-foreground">{r.click_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-3xl text-foreground mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent></Card>
  );
}
