import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send, Save, ShieldCheck } from "lucide-react";

export default function AdminNewsletterSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { ok: boolean; message: string; latency?: number }>(null);
  const [testEmail, setTestEmail] = useState("");
  const [s, setS] = useState<any>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("newsletter_settings").select("*").maybeSingle();
      if (data) setS(data);
      setLoading(false);
    })();
  }, []);

  const set = (k: string, v: any) => setS((prev: any) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("newsletter_settings").update({
      smtp_host: s.smtp_host, smtp_port: Number(s.smtp_port) || 587, smtp_user: s.smtp_user, smtp_pass: s.smtp_pass,
      smtp_secure: s.smtp_secure ?? "starttls",
      from_name: s.from_name, from_email: s.from_email, reply_to: s.reply_to,
      footer_text: s.footer_text, footer_address: s.footer_address,
      rate_per_minute: Number(s.rate_per_minute) || 60,
    }).eq("id", s.id);
    setSaving(false);
    if (error) toast.error("Fehler: " + error.message);
    else toast.success("Einstellungen gespeichert.");
  };

  const sendTest = async () => {
    if (!testEmail) return toast.error("Bitte E-Mail-Adresse eingeben.");
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("newsletter-test-smtp", { body: { to: testEmail } });
    setTesting(false);
    if (error || (data as any)?.error) toast.error("Fehler: " + (error?.message ?? (data as any)?.error));
    else toast.success("Test-Mail gesendet.");
  };

  const verifyConnection = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const { data, error } = await supabase.functions.invoke("newsletter-verify-smtp", {
      body: {
        smtp_host: s.smtp_host,
        smtp_port: Number(s.smtp_port) || undefined,
        smtp_user: s.smtp_user,
        smtp_pass: s.smtp_pass,
        smtp_secure: s.smtp_secure,
      },
    });
    setVerifying(false);
    const d = data as any;
    if (error) {
      setVerifyResult({ ok: false, message: error.message });
      toast.error("Verbindungsfehler: " + error.message);
      return;
    }
    if (d?.ok) {
      setVerifyResult({ ok: true, message: `Verbindung & Login erfolgreich (${d.host}:${d.port})`, latency: d.latency_ms });
      toast.success("SMTP-Verbindung OK");
    } else {
      const stepLabel = d?.step === "connect" ? "Verbindung" : d?.step === "auth" ? "Anmeldung" : "Prüfung";
      const msg = `${stepLabel} fehlgeschlagen: ${d?.error ?? "Unbekannter Fehler"}`;
      setVerifyResult({ ok: false, message: msg });
      toast.error(msg);
    }
  };

  if (loading) return <div className="p-6">Laden…</div>;

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl text-foreground">Newsletter – SMTP</h1>
        <p className="text-sm text-muted-foreground">Eigener SMTP-Server für den Newsletter-Versand. Diese Daten werden verschlüsselt gespeichert und nicht im Frontend angezeigt.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>SMTP-Verbindung</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>Host</Label>
              <Input value={s.smtp_host ?? ""} placeholder="smtp.deinanbieter.de" onChange={(e) => set("smtp_host", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Port</Label>
              <Input type="number" value={s.smtp_port ?? 587} onChange={(e) => set("smtp_port", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Verschlüsselung</Label>
            <Select value={s.smtp_secure ?? "starttls"} onValueChange={(v) => set("smtp_secure", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starttls">STARTTLS (Port 587, empfohlen)</SelectItem>
                <SelectItem value="ssl">SSL/TLS (Port 465)</SelectItem>
                <SelectItem value="none">Keine (nur intern)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Benutzername</Label>
              <Input value={s.smtp_user ?? ""} onChange={(e) => set("smtp_user", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Passwort</Label>
              <Input type="password" value={s.smtp_pass ?? ""} placeholder="••••••••" onChange={(e) => set("smtp_pass", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Absender</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Absender-Name</Label><Input value={s.from_name ?? ""} onChange={(e) => set("from_name", e.target.value)} placeholder="Santosha Yoga" /></div>
            <div className="space-y-2"><Label>Absender-Adresse</Label><Input type="email" value={s.from_email ?? ""} onChange={(e) => set("from_email", e.target.value)} placeholder="newsletter@deinedomain.de" /></div>
          </div>
          <div className="space-y-2"><Label>Antwort-an (Reply-To)</Label><Input type="email" value={s.reply_to ?? ""} onChange={(e) => set("reply_to", e.target.value)} placeholder="info@deinedomain.de" /></div>
          <div className="space-y-2"><Label>Versand-Limit (pro Minute)</Label><Input type="number" value={s.rate_per_minute ?? 60} onChange={(e) => set("rate_per_minute", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Footer (gesetzlich)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Footer-Text</Label><Textarea value={s.footer_text ?? ""} onChange={(e) => set("footer_text", e.target.value)} placeholder="Du erhältst diese E-Mail, weil du den Newsletter abonniert hast." /></div>
          <div className="space-y-2"><Label>Impressum / Adresse</Label><Textarea value={s.footer_address ?? ""} onChange={(e) => set("footer_address", e.target.value)} placeholder="Santosha Yoga, Musterstraße 1, 35037 Marburg" /></div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label>Test-Mail an</Label>
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="deine@mail.de"
                className="w-72"
              />
            </div>
            <Button variant="outline" onClick={verifyConnection} disabled={verifying}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              {verifying ? "Prüfe…" : "Verbindung prüfen"}
            </Button>
            <Button variant="outline" onClick={sendTest} disabled={testing}>
              <Send className="mr-2 h-4 w-4" />
              {testing ? "Sende…" : "Test-Mail senden"}
            </Button>
          </div>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Speichere…" : "Speichern"}
          </Button>
        </div>

        {verifyResult && (
          <div
            className={`rounded-md border px-4 py-3 text-sm ${
              verifyResult.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="font-medium">
              {verifyResult.ok ? "✓ SMTP-Verbindung OK" : "✗ SMTP-Verbindung fehlgeschlagen"}
            </div>
            <div className="mt-1 opacity-90">{verifyResult.message}</div>
            {verifyResult.ok && verifyResult.latency != null && (
              <div className="mt-1 text-xs opacity-70">Antwortzeit: {verifyResult.latency} ms</div>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          „Verbindung prüfen" testet Host, Port, Verschlüsselung und Login – ohne eine Mail zu versenden.
          „Test-Mail senden" sendet eine echte Test-Nachricht über deinen SMTP-Server.
        </p>
      </div>
    </div>
  );
}
