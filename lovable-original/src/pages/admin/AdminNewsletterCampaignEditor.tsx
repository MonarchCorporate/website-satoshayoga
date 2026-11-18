import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Send, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { NewsletterBlockEditor } from "@/components/admin/newsletter/NewsletterBlockEditor";
import type { Block } from "@/components/admin/newsletter/types";

export default function AdminNewsletterCampaignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<any>(null);
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("newsletter_campaigns").select("*").eq("id", id!).maybeSingle();
      if (!data) { toast.error("Kampagne nicht gefunden."); navigate("/admin/newsletter"); return; }
      setCampaign(data);
      setSubject(data.subject ?? "");
      setPreheader(data.preheader ?? "");
      setBlocks(Array.isArray(data.content_json) ? data.content_json as Block[] : []);
      setLoading(false);
    })();
  }, [id, navigate]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("newsletter_campaigns").update({
      subject, preheader, content_json: blocks as any,
    }).eq("id", id!);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Gespeichert.");
  };

  const sendTest = async () => {
    if (!testEmail) return toast.error("Bitte E-Mail-Adresse für Test angeben.");
    await save();
    const { data, error } = await supabase.functions.invoke("send-newsletter-campaign", { body: { campaign_id: id, test_email: testEmail } });
    if (error || (data as any)?.error) toast.error("Fehler: " + (error?.message ?? (data as any)?.error));
    else toast.success("Test-Mail versendet.");
  };

  const sendLive = async () => {
    if (!confirm("Kampagne JETZT an alle Newsletter-Abonnenten versenden? Das kann nicht rückgängig gemacht werden.")) return;
    setSending(true);
    await save();
    const { data, error } = await supabase.functions.invoke("send-newsletter-campaign", { body: { campaign_id: id } });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error("Fehler: " + (error?.message ?? (data as any)?.error));
    } else {
      toast.success(`Versand abgeschlossen: ${(data as any).sent} gesendet, ${(data as any).failed} fehlgeschlagen.`);
      navigate(`/admin/newsletter/campaigns/${id}/stats`);
    }
  };

  if (loading) return <div className="p-6">Laden…</div>;

  const isSent = campaign?.status === "sent";

  return (
    <div className="flex flex-col p-6 space-y-4 h-screen overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link to="/admin/newsletter"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div>
            <h1 className="font-display text-2xl text-foreground">Newsletter bearbeiten</h1>
            {isSent && <Badge variant="default" className="mt-1">Bereits versendet</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {isSent && <Button variant="outline" asChild><Link to={`/admin/newsletter/campaigns/${id}/stats`}><BarChart3 className="mr-2 h-4 w-4" />Statistik</Link></Button>}
          <Button variant="outline" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? "Speichere…" : "Speichern"}</Button>
          <div className="flex items-center gap-2">
            <Input placeholder="test@mail.de" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="w-48" />
            <Button variant="secondary" onClick={sendTest}>Test-Mail</Button>
          </div>
          <Button onClick={sendLive} disabled={sending || isSent}>
            <Send className="mr-2 h-4 w-4" />{sending ? "Versende…" : "Live senden"}
          </Button>
        </div>
      </div>

      <Card><CardContent className="p-4 grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Betreff</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isSent} /></div>
        <div className="space-y-2"><Label>Preheader (Vorschau-Text)</Label><Input value={preheader} onChange={(e) => setPreheader(e.target.value)} disabled={isSent} /></div>
      </CardContent></Card>

      <NewsletterBlockEditor value={blocks} onChange={setBlocks} />
    </div>
  );
}
