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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  FlaskConical,
  Building2,
  Trash2,
  ShieldCheck,
  UserPlus,
  Mail,
} from "lucide-react";
import EmailSettingsCard from "@/components/admin/EmailSettingsCard";
import PayPalConnectWizard from "@/components/admin/PayPalConnectWizard";

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

type Company = {
  id?: string;
  company_name: string;
  owner_name: string;
  street: string;
  postal_code: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  tax_id: string;
  tax_number: string;
  bank_name: string;
  iban: string;
  bic: string;
  invoice_footer: string;
  logo_url: string;
};

const emptyCompany: Company = {
  company_name: "",
  owner_name: "",
  street: "",
  postal_code: "",
  city: "",
  country: "Deutschland",
  email: "",
  phone: "",
  website: "",
  tax_id: "",
  tax_number: "",
  bank_name: "",
  iban: "",
  bic: "",
  invoice_footer: "",
  logo_url: "",
};

export default function AdminSettings() {
  
  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    mode: "sandbox" as "sandbox" | "live",
    client_id: "",
    client_secret: "",
    webhook_id: "",
    is_active: true,
  });

  // Dev-Mode
  const [devMode, setDevMode] = useState(false);
  const [devModeSaving, setDevModeSaving] = useState(false);

  // Company settings
  const [company, setCompany] = useState<Company>(emptyCompany);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Admins
  type AdminRow = {
    user_id: string;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    is_self: boolean;
  };
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminFirst, setNewAdminFirst] = useState("");
  const [newAdminLast, setNewAdminLast] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoadingStatus(true);
    const { data, error } = await supabase.functions.invoke("paypal-status");
    if (error) {
      toast.error("Status konnte nicht geladen werden");
    } else if (data) {
      setStatus(data as Status);
      setForm((f) => ({
        ...f,
        mode: data.mode ?? "sandbox",
        is_active: data.is_active ?? true,
      }));
    }
    setLoadingStatus(false);
  };

  const loadCompany = async () => {
    setCompanyLoading(true);
    const { data } = await supabase
      .from("company_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (data) {
      setCompany({
        id: data.id,
        company_name: data.company_name ?? "",
        owner_name: data.owner_name ?? "",
        street: data.street ?? "",
        postal_code: data.postal_code ?? "",
        city: data.city ?? "",
        country: data.country ?? "Deutschland",
        email: data.email ?? "",
        phone: data.phone ?? "",
        website: data.website ?? "",
        tax_id: data.tax_id ?? "",
        tax_number: data.tax_number ?? "",
        bank_name: data.bank_name ?? "",
        iban: data.iban ?? "",
        bic: data.bic ?? "",
        invoice_footer: data.invoice_footer ?? "",
        logo_url: data.logo_url ?? "",
      });
    }
    setCompanyLoading(false);
  };

  useEffect(() => {
    loadStatus();
    loadCompany();
    loadDevMode();
    loadAdmins();
  }, []);

  const loadDevMode = async () => {
    const { data } = await supabase.functions.invoke("dev-mode-status");
    setDevMode(!!(data as any)?.enabled);
  };

  const toggleDevMode = async (enabled: boolean) => {
    setDevModeSaving(true);
    const { data, error } = await supabase.functions.invoke("set-dev-mode", {
      body: { enabled },
    });
    setDevModeSaving(false);
    if (error || !data?.ok) {
      toast.error("Speichern fehlgeschlagen: " + (error?.message ?? data?.error ?? ""));
      return;
    }
    setDevMode(enabled);
    toast.success(enabled ? "Entwicklermodus aktiviert" : "Entwicklermodus deaktiviert");
  };

  const loadAdmins = async () => {
    setAdminsLoading(true);
    const { data, error } = await supabase.functions.invoke("manage-admins", {
      body: { action: "list" },
    });
    setAdminsLoading(false);
    if (error) {
      toast.error("Admins konnten nicht geladen werden: " + error.message);
      return;
    }
    setAdmins(((data as any)?.admins ?? []) as AdminRow[]);
  };

  const addAdmin = async () => {
    const email = newAdminEmail.trim();
    if (!email) {
      toast.error("Bitte E-Mail eingeben.");
      return;
    }
    if (newAdminPassword.length < 8) {
      toast.error("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setAddingAdmin(true);
    const { data, error } = await supabase.functions.invoke("manage-admins", {
      body: {
        action: "add",
        email,
        password: newAdminPassword,
        first_name: newAdminFirst.trim() || null,
        last_name: newAdminLast.trim() || null,
      },
    });
    setAddingAdmin(false);
    if (error || (!data?.ok && !data?.user_id)) {
      toast.error("Fehlgeschlagen: " + (error?.message ?? (data as any)?.error ?? ""));
      return;
    }
    if ((data as any)?.already) {
      toast.info("Diese Person ist bereits Admin – Passwort wurde aktualisiert.");
    } else if ((data as any)?.created) {
      toast.success("Admin-Account erstellt – Login sofort möglich.");
    } else {
      toast.success("Admin hinzugefügt – Passwort wurde aktualisiert.");
    }
    setNewAdminEmail("");
    setNewAdminFirst("");
    setNewAdminLast("");
    setNewAdminPassword("");
    loadAdmins();
  };

  const removeAdmin = async (row: AdminRow) => {
    const label = row.email ?? row.user_id;
    if (!window.confirm(`Admin-Rechte für ${label} entziehen?`)) return;
    setRemovingId(row.user_id);
    const { data, error } = await supabase.functions.invoke("manage-admins", {
      body: { action: "remove", user_id: row.user_id },
    });
    setRemovingId(null);
    if (error || !data?.ok) {
      toast.error("Fehlgeschlagen: " + (error?.message ?? (data as any)?.error ?? ""));
      return;
    }
    toast.success("Admin entfernt.");
    loadAdmins();
  };


  const save = async () => {
    if (!form.client_id || !form.client_secret) {
      toast.error("Client ID und Secret sind erforderlich.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke(
      "save-paypal-credentials",
      { body: form },
    );
    setSaving(false);
    if (error || !data?.ok) {
      toast.error("Speichern fehlgeschlagen: " + (error?.message ?? data?.error ?? ""));
      return;
    }
    toast.success("PayPal-Zugang gespeichert");
    setForm((f) => ({ ...f, client_secret: "" }));
    loadStatus();
  };


  const saveCompany = async () => {
    setCompanySaving(true);
    const { error } = await supabase
      .from("company_settings")
      .update({
        company_name: company.company_name || "Santosha Yoga by Tessa",
        owner_name: company.owner_name || null,
        street: company.street || null,
        postal_code: company.postal_code || null,
        city: company.city || null,
        country: company.country || null,
        email: company.email || null,
        phone: company.phone || null,
        website: company.website || null,
        tax_id: company.tax_id || null,
        tax_number: company.tax_number || null,
        bank_name: company.bank_name || null,
        iban: company.iban || null,
        bic: company.bic || null,
        invoice_footer: company.invoice_footer || null,
        logo_url: company.logo_url || null,
      })
      .eq("singleton", true);
    setCompanySaving(false);
    if (error) {
      toast.error("Speichern fehlgeschlagen: " + error.message);
      return;
    }
    toast.success("Firmendaten gespeichert");
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("branding")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setLogoUploading(false);
      toast.error("Upload fehlgeschlagen: " + upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    setCompany((c) => ({ ...c, logo_url: pub.publicUrl }));
    setLogoUploading(false);
    toast.success("Logo hochgeladen – nicht vergessen zu speichern.");
  };

  const statusBadge = () => {
    if (!status) return null;
    if (!status.configured) return <Badge variant="secondary">Nicht konfiguriert</Badge>;
    if (!status.is_active) return <Badge variant="secondary">Deaktiviert</Badge>;
    if (status.connected)
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
          Verbunden ({status.mode})
        </Badge>
      );
    return <Badge variant="destructive">Verbindung fehlgeschlagen</Badge>;
  };

  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Einstellungen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte Zahlungsanbieter, Testkäufe und Rechnungs-Stammdaten.
        </p>
      </div>

      {devMode && (
        <div className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <FlaskConical className="h-5 w-5 mt-0.5 text-amber-600 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Entwicklermodus aktiv</p>
            <p className="text-muted-foreground">
              Käufe im Shop werden simuliert – es findet keine echte Zahlung statt. Bestellungen,
              Buchungen, Karten, Rechnungen und E-Mails werden trotzdem regulär erzeugt.
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="paypal" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="paypal" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">PayPal</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">E-Mail</span>
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Selbsttest</span>
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Rechnungsdaten</span>
          </TabsTrigger>
          <TabsTrigger value="admins" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Admins</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-0">
          <EmailSettingsCard />
        </TabsContent>


        <TabsContent value="paypal" className="mt-0">
          <PayPalConnectWizard />
        </TabsContent>


        <TabsContent value="test" className="mt-0 space-y-6">
      {/* Entwicklermodus-Schalter */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <FlaskConical className="h-6 w-6 text-amber-600" />
            <div className="flex-1">
              <CardTitle className="text-lg">Entwicklermodus</CardTitle>
              <CardDescription>
                Globaler Schalter: Wenn aktiv, simuliert der Shop alle Zahlungen (PayPal & Karte) –
                ohne echte Geldbewegung. Bestellungen, Buchungen, Karten, Rechnungen und E-Mails laufen
                trotzdem ganz normal.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="font-medium">Zahlungen simulieren</p>
              <p className="text-xs text-muted-foreground">
                Im Checkout erscheinen „PayPal (Test)" und „Kreditkarte (Test)" als Zahlmethoden.
              </p>
            </div>
            <Switch
              checked={devMode}
              disabled={devModeSaving}
              onCheckedChange={toggleDevMode}
            />
          </div>
          {devMode && (
            <p className="text-xs text-muted-foreground mt-3">
              Tipp: Lege etwas in den Warenkorb und gehe zur Kasse – die Simulation läuft den
              kompletten Workflow durch.
            </p>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="company" className="mt-0">
      {/* Firmen- & Rechnungsdaten */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <CardTitle className="text-lg">Firmen- & Rechnungsdaten</CardTitle>
              <CardDescription>
                Diese Angaben erscheinen als Absender und im Footer auf jeder Rechnung.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {companyLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-4">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt="Logo"
                      className="h-16 w-16 object-contain rounded border bg-background"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      kein Logo
                    </div>
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    disabled={logoUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                    }}
                  />
                  {company.logo_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setCompany({ ...company, logo_url: "" })}
                      title="Logo entfernen"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Firmenname *</Label>
                  <Input
                    value={company.company_name}
                    onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Inhaber:in</Label>
                  <Input
                    value={company.owner_name}
                    onChange={(e) => setCompany({ ...company, owner_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Straße & Hausnummer</Label>
                  <Input
                    value={company.street}
                    onChange={(e) => setCompany({ ...company, street: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>PLZ</Label>
                  <Input
                    value={company.postal_code}
                    onChange={(e) => setCompany({ ...company, postal_code: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ort</Label>
                  <Input
                    value={company.city}
                    onChange={(e) => setCompany({ ...company, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Land</Label>
                  <Input
                    value={company.country}
                    onChange={(e) => setCompany({ ...company, country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Website</Label>
                  <Input
                    value={company.website}
                    onChange={(e) => setCompany({ ...company, website: e.target.value })}
                    placeholder="https://"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Steuernummer</Label>
                  <Input
                    value={company.tax_number}
                    onChange={(e) => setCompany({ ...company, tax_number: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>USt-IdNr.</Label>
                  <Input
                    value={company.tax_id}
                    onChange={(e) => setCompany({ ...company, tax_id: e.target.value })}
                    placeholder="DE…"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Bank</Label>
                  <Input
                    value={company.bank_name}
                    onChange={(e) => setCompany({ ...company, bank_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input
                    value={company.iban}
                    onChange={(e) => setCompany({ ...company, iban: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>BIC</Label>
                  <Input
                    value={company.bic}
                    onChange={(e) => setCompany({ ...company, bic: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Footer-Text auf Rechnung</Label>
                  <Textarea
                    value={company.invoice_footer}
                    onChange={(e) => setCompany({ ...company, invoice_footer: e.target.value })}
                    rows={2}
                    placeholder="z. B. Geschäftsführer:in, Registergericht …"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={saveCompany} disabled={companySaving}>
                  {companySaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Speichern
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="admins" className="mt-0">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <div className="flex-1">
                  <CardTitle className="text-lg">Admin-Accounts</CardTitle>
                  <CardDescription>
                    Lege neue Admin-Accounts mit E-Mail und Passwort an. Die Person kann sich sofort
                    einloggen – keine Einladung nötig.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border p-4 space-y-3">
                <p className="font-medium text-sm">Neuen Admin anlegen</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Vorname</Label>
                    <Input
                      value={newAdminFirst}
                      onChange={(e) => setNewAdminFirst(e.target.value)}
                      placeholder="Vorname"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nachname</Label>
                    <Input
                      value={newAdminLast}
                      onChange={(e) => setNewAdminLast(e.target.value)}
                      placeholder="Nachname"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">E-Mail *</Label>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Passwort * (min. 8 Zeichen)</Label>
                    <Input
                      type="text"
                      placeholder="Passwort setzen"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={addAdmin}
                    disabled={addingAdmin || !newAdminEmail.trim() || newAdminPassword.length < 8}
                  >
                    {addingAdmin ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Admin anlegen
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Existiert die E-Mail bereits, wird der Person die Admin-Rolle zugewiesen und das
                  angegebene Passwort gesetzt.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Aktuelle Admins ({admins.length})</Label>
                  <Button variant="ghost" size="sm" onClick={loadAdmins} disabled={adminsLoading}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-2 ${adminsLoading ? "animate-spin" : ""}`} />
                    Aktualisieren
                  </Button>
                </div>
                <div className="rounded-md border divide-y">
                  {adminsLoading && admins.length === 0 ? (
                    <div className="p-6 flex justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : admins.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground text-center">
                      Keine Admins gefunden.
                    </p>
                  ) : (
                    admins.map((a) => {
                      const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
                      return (
                        <div key={a.user_id} className="flex items-center justify-between gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">
                                {name || a.email || a.user_id}
                              </span>
                              {a.is_self && (
                                <Badge variant="secondary" className="text-xs">Du</Badge>
                              )}
                            </div>
                            {name && a.email && (
                              <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={a.is_self || removingId === a.user_id}
                            onClick={() => removeAdmin(a)}
                            className="text-destructive shrink-0"
                            title={a.is_self ? "Du kannst dich nicht selbst entfernen" : "Admin-Rechte entziehen"}
                          >
                            {removingId === a.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
