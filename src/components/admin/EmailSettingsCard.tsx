import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, PlugZap, Mail } from "lucide-react";
import { toast } from "sonner";

type EmailSettings = {
  id?: string;
  domain: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: "starttls" | "ssl" | "none";
  is_active: boolean;
};

const empty: EmailSettings = {
  domain: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_pass: "",
  smtp_secure: "starttls",
  is_active: false,
};

export default function EmailSettingsCard() {
  const [cfg, setCfg] = useState<EmailSettings>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [verifyResult, setVerifyResult] = useState<
    { ok: boolean; error?: string; step?: string } | null
  >(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("email_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (data) {
      setCfg({
        id: data.id,
        domain: data.domain ?? "",
        from_name: data.from_name ?? "",
        from_email: data.from_email ?? "",
        reply_to: data.reply_to ?? "",
        smtp_host: data.smtp_host ?? "",
        smtp_port: data.smtp_port ?? 587,
        smtp_user: data.smtp_user ?? "",
        smtp_pass: data.smtp_pass ?? "",
        smtp_secure: (data.smtp_secure as any) ?? "starttls",
        is_active: !!data.is_active,
      });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      domain: cfg.domain || null,
      from_name: cfg.from_name || null,
      from_email: cfg.from_email || null,
      reply_to: cfg.reply_to || null,
      smtp_host: cfg.smtp_host || null,
      smtp_port: cfg.smtp_port || 587,
      smtp_user: cfg.smtp_user || null,
      smtp_pass: cfg.smtp_pass || null,
      smtp_secure: cfg.smtp_secure,
      is_active: cfg.is_active,
    };
    let error;
    if (cfg.id) {
      ({ error } = await supabase.from("email_settings").update(payload).eq("id", cfg.id));
    } else {
      ({ error } = await supabase.from("email_settings").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("E-Mail-Einstellungen gespeichert.");
    load();
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const { data, error } = await supabase.functions.invoke("email-settings-verify", {
      body: {
        smtp_host: cfg.smtp_host,
        smtp_port: cfg.smtp_port,
        smtp_user: cfg.smtp_user,
        smtp_pass: cfg.smtp_pass,
        smtp_secure: cfg.smtp_secure,
        from_email: cfg.from_email,
        from_name: cfg.from_name,
      },
    });
    setVerifying(false);
    if (error) {
      setVerifyResult({ ok: false, error: error.message });
      return;
    }
    setVerifyResult(data as any);
  };

  const sendTest = async () => {
    if (!testTo) {
      toast.error("Bitte Empfänger-Adresse eingeben.");
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("email-settings-verify", {
      body: {
        smtp_host: cfg.smtp_host,
        smtp_port: cfg.smtp_port,
        smtp_user: cfg.smtp_user,
        smtp_pass: cfg.smtp_pass,
        smtp_secure: cfg.smtp_secure,
        from_email: cfg.from_email,
        from_name: cfg.from_name,
        test_to: testTo,
      },
    });
    setTesting(false);
    if (error || !(data as any)?.ok) {
      toast.error("Testmail fehlgeschlagen: " + ((data as any)?.error ?? error?.message ?? ""));
      return;
    }
    toast.success(`Testmail an ${testTo} gesendet.`);
  };

  const statusBadge = () => {
    if (!cfg.smtp_host || !cfg.from_email) {
      return <Badge variant="secondary">Nicht konfiguriert</Badge>;
    }
    if (!cfg.is_active) return <Badge variant="secondary">Deaktiviert</Badge>;
    if (verifyResult?.ok)
      return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Verbunden</Badge>;
    if (verifyResult && !verifyResult.ok)
      return <Badge variant="destructive">Verbindung fehlgeschlagen</Badge>;
    return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Aktiv</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <CardTitle className="text-lg">Absender & SMTP</CardTitle>
            <CardDescription>
              Zentrale Konfiguration für alle System-E-Mails (Buchungen, Bestellungen, Karten, Rechnungen, Trainer).
            </CardDescription>
          </div>
          {statusBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Absender-Domain</Label>
                <Input
                  value={cfg.domain}
                  onChange={(e) => setCfg({ ...cfg, domain: e.target.value })}
                  placeholder="yoga-heide.de"
                />
                <p className="text-xs text-muted-foreground">
                  Nur informativ – für SPF/DKIM sorgt dein Hoster.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Absender-Name</Label>
                <Input
                  value={cfg.from_name}
                  onChange={(e) => setCfg({ ...cfg, from_name: e.target.value })}
                  placeholder="Santosha Yoga"
                />
              </div>
              <div className="space-y-2">
                <Label>Absender-Adresse *</Label>
                <Input
                  type="email"
                  value={cfg.from_email}
                  onChange={(e) => setCfg({ ...cfg, from_email: e.target.value })}
                  placeholder="info@yoga-heide.de"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Antwort an (optional)</Label>
                <Input
                  type="email"
                  value={cfg.reply_to}
                  onChange={(e) => setCfg({ ...cfg, reply_to: e.target.value })}
                  placeholder="tessa@yoga-heide.de"
                />
              </div>
            </div>

            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-sm font-medium">SMTP-Zugang</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Host *</Label>
                  <Input
                    value={cfg.smtp_host}
                    onChange={(e) => setCfg({ ...cfg, smtp_host: e.target.value })}
                    placeholder="smtp.ionos.de"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port *</Label>
                  <Input
                    type="number"
                    value={cfg.smtp_port}
                    onChange={(e) => setCfg({ ...cfg, smtp_port: Number(e.target.value) || 587 })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Benutzer *</Label>
                  <Input
                    value={cfg.smtp_user}
                    onChange={(e) => setCfg({ ...cfg, smtp_user: e.target.value })}
                    autoComplete="off"
                    placeholder="info@yoga-heide.de"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Verschlüsselung *</Label>
                  <Select
                    value={cfg.smtp_secure}
                    onValueChange={(v) => setCfg({ ...cfg, smtp_secure: v as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starttls">STARTTLS (Port 587)</SelectItem>
                      <SelectItem value="ssl">SSL/TLS (Port 465)</SelectItem>
                      <SelectItem value="none">Keine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label>Passwort *</Label>
                  <Input
                    type="password"
                    value={cfg.smtp_pass}
                    onChange={(e) => setCfg({ ...cfg, smtp_pass: e.target.value })}
                    autoComplete="new-password"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {verifyResult && (
                <div
                  className={`text-xs rounded-md p-2 ${
                    verifyResult.ok
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {verifyResult.ok
                    ? "Verbindung ok."
                    : `Fehler (${verifyResult.step ?? "?"}): ${verifyResult.error}`}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={verify} disabled={verifying}>
                  {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlugZap className="h-4 w-4 mr-2" />}
                  Verbindung testen
                </Button>
                <Input
                  type="email"
                  placeholder="Testmail an…"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="max-w-xs"
                />
                <Button variant="outline" onClick={sendTest} disabled={testing || !testTo}>
                  {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Testmail senden
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">E-Mail-Versand aktiv</p>
                <p className="text-xs text-muted-foreground">
                  Wenn deaktiviert, verschickt das System keine E-Mails.
                </p>
              </div>
              <Switch
                checked={cfg.is_active}
                onCheckedChange={(v) => setCfg({ ...cfg, is_active: v })}
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Speichern
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Hinweis: Auth-Mails von Supabase (Signup-Bestätigung, Passwort-Reset, Magic Link, E-Mail-Wechsel)
              laufen weiterhin über Supabase Auth. Um auch diese über deinen SMTP zu senden, kann in Cloud →
              Auth „Custom SMTP" mit den gleichen Zugangsdaten aktiviert werden.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
