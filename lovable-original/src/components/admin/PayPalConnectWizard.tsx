import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Copy,
  Plug,
  Unplug,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";

type Status = {
  configured: boolean;
  connected: boolean;
  mode: "sandbox" | "live";
  is_active: boolean;
  has_webhook?: boolean;
  updated_at?: string;
  error?: string | null;
};

type WizardStep = "overview" | "mode" | "credentials";

export default function PayPalConnectWizard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [step, setStep] = useState<WizardStep>("overview");
  const [mode, setMode] = useState<"sandbox" | "live">("sandbox");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [webhookId, setWebhookId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-webhook-courses`;

  const loadStatus = async () => {
    setLoadingStatus(true);
    const { data, error } = await supabase.functions.invoke("paypal-status");
    if (error) {
      toast.error("Status konnte nicht geladen werden");
    } else if (data) {
      setStatus(data as Status);
      setMode((data.mode as any) ?? "sandbox");
    }
    setLoadingStatus(false);
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const testConnection = async () => {
    setTesting(true);
    await loadStatus();
    setTesting(false);
    toast.success("Verbindung erneut geprüft");
  };

  const disconnect = async () => {
    if (!window.confirm("PayPal-Verbindung wirklich trennen? Kunden können danach nicht mehr mit PayPal bezahlen.")) return;
    setDisconnecting(true);
    const { data, error } = await supabase.functions.invoke("save-paypal-credentials", {
      body: {
        mode: status?.mode ?? "sandbox",
        client_id: "",
        client_secret: "",
        webhook_id: null,
        is_active: false,
      },
    });
    setDisconnecting(false);
    if (error || !data?.ok) {
      toast.error("Trennen fehlgeschlagen: " + (error?.message ?? data?.error ?? ""));
      return;
    }
    toast.success("PayPal-Verbindung getrennt");
    loadStatus();
  };

  const saveAndTest = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Client ID und Secret sind erforderlich.");
      return;
    }
    setSaving(true);

    // 1. Speichern (zunächst inaktiv)
    const saveRes = await supabase.functions.invoke("save-paypal-credentials", {
      body: {
        mode,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        webhook_id: webhookId.trim() || null,
        is_active: false,
      },
    });
    if (saveRes.error || !saveRes.data?.ok) {
      setSaving(false);
      toast.error(
        "Speichern fehlgeschlagen: " +
          (saveRes.error?.message ?? saveRes.data?.error ?? ""),
      );
      return;
    }

    // 2. Verbindung testen
    const statusRes = await supabase.functions.invoke("paypal-status");
    const s = statusRes.data as Status | undefined;
    if (statusRes.error || !s?.connected) {
      setSaving(false);
      setStatus(s ?? null);
      toast.error(
        "PayPal-Verbindung fehlgeschlagen: " +
          (s?.error ?? statusRes.error?.message ?? "Prüfe Client ID, Secret und Modus."),
      );
      return;
    }

    // 3. Aktivieren
    const activateRes = await supabase.functions.invoke("save-paypal-credentials", {
      body: {
        mode,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        webhook_id: webhookId.trim() || null,
        is_active: true,
      },
    });
    setSaving(false);
    if (activateRes.error || !activateRes.data?.ok) {
      toast.error("Aktivieren fehlgeschlagen: " + (activateRes.error?.message ?? ""));
      return;
    }

    toast.success("PayPal erfolgreich verbunden und aktiviert 🎉");
    setClientId("");
    setClientSecret("");
    setWebhookId("");
    setStep("overview");
    loadStatus();
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook-URL kopiert");
  };

  const paypalConsoleUrl =
    mode === "live"
      ? "https://developer.paypal.com/dashboard/applications/live"
      : "https://developer.paypal.com/dashboard/applications/sandbox";

  const renderStatusBadge = () => {
    if (!status) return null;
    if (status.is_active && status.connected)
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Verbunden ({status.mode === "live" ? "Live" : "Sandbox"})
        </Badge>
      );
    if (status.configured && !status.connected)
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Verbindung fehlgeschlagen
        </Badge>
      );
    if (status.configured && !status.is_active)
      return <Badge variant="secondary">Deaktiviert</Badge>;
    return <Badge variant="secondary">Nicht verbunden</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <CardTitle className="text-lg">PayPal-Integration</CardTitle>
            <CardDescription>
              Verbinde dein Studio mit PayPal, damit Kunden im Checkout bezahlen können.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loadingStatus ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : step === "overview" ? (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                {status?.updated_at && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Zuletzt geprüft: {new Date(status.updated_at).toLocaleString("de-DE")}
                  </p>
                )}
                {status?.error && (
                  <p className="text-xs text-destructive mt-1">{status.error}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {renderStatusBadge()}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={testConnection}
                  disabled={testing}
                  title="Erneut prüfen"
                >
                  {testing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {status?.is_active && status?.connected ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setMode(status.mode);
                    setStep("mode");
                  }}
                  className="gap-2"
                >
                  <Plug className="h-4 w-4" />
                  Neu verbinden / Zugang wechseln
                </Button>
                <Button
                  variant="outline"
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="gap-2 text-destructive hover:text-destructive"
                >
                  {disconnecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="h-4 w-4" />
                  )}
                  Verbindung trennen
                </Button>
              </div>
            ) : (
              <Button onClick={() => setStep("mode")} className="w-full gap-2" size="lg">
                <Plug className="h-4 w-4" />
                Mit PayPal verbinden
              </Button>
            )}
          </div>
        ) : step === "mode" ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Schritt 1 · Modus wählen</h3>
              <p className="text-sm text-muted-foreground">
                Sandbox zum Testen ohne echtes Geld. Live für echte Kundenzahlungen.
              </p>
            </div>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="space-y-2">
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <RadioGroupItem value="sandbox" id="w_sandbox" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="w_sandbox" className="font-medium">Sandbox (Test)</Label>
                  <p className="text-sm text-muted-foreground">
                    Verwende PayPal-Testkonten, keine echten Zahlungen. Empfohlen zum Ausprobieren.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <RadioGroupItem value="live" id="w_live" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="w_live" className="font-medium">Live (Echt)</Label>
                  <p className="text-sm text-muted-foreground">
                    Echte Zahlungen an dein PayPal-Geschäftskonto.
                  </p>
                </div>
              </div>
            </RadioGroup>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep("overview")} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Abbrechen
              </Button>
              <Button onClick={() => setStep("credentials")}>Weiter</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Schritt 2 · Anmeldedaten von PayPal</h3>
              <p className="text-sm text-muted-foreground">
                Öffne dein PayPal Developer Dashboard und erstelle eine REST-App
                {mode === "live" ? " (Live)" : " (Sandbox)"}.
              </p>
            </div>

            <ol className="space-y-2 text-sm rounded-lg border p-4 bg-muted/30">
              <li>
                1.{" "}
                <a
                  href={paypalConsoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  PayPal Developer Dashboard öffnen
                  <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>2. Melde dich mit deinem PayPal-Geschäftskonto an.</li>
              <li>3. Erstelle eine neue App (oder öffne eine bestehende) und kopiere <strong>Client ID</strong> und <strong>Secret</strong>.</li>
              <li>4. Trage sie unten ein und klicke „Verbinden & aktivieren".</li>
            </ol>

            <div className="space-y-2">
              <Label>Client ID *</Label>
              <Input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="AXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Client Secret *</Label>
              <Input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="EOxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="new-password"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Webhook-URL (in PayPal eintragen)
              </Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyWebhook} title="Kopieren">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Optional: Trage diese URL in PayPal unter „Webhooks" ein, um Zahlungsstatus-Änderungen automatisch zu empfangen.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Webhook ID (optional)</Label>
              <Input
                value={webhookId}
                onChange={(e) => setWebhookId(e.target.value)}
                placeholder="z. B. 1AB23456CD789012E"
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep("mode")} className="gap-1" disabled={saving}>
                <ArrowLeft className="h-4 w-4" />
                Zurück
              </Button>
              <Button onClick={saveAndTest} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Verbinden & aktivieren
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
