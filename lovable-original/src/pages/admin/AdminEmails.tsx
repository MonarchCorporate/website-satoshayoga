import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Send, Save, RotateCcw, Code2, Eye } from "lucide-react";
import { getPlaceholderMeta } from "@/lib/placeholder-meta";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EMAIL_TRIGGERS, type EmailTriggerDef } from "@/lib/email-triggers";
import { EmailVisualEditor } from "@/components/admin/EmailVisualEditor";
import AdminEmailLog from "./AdminEmailLog";
import AdminEmailPreview from "./AdminEmailPreview";
import { renderEmailPreview as renderPreview } from "@/lib/email-preview-samples";

interface DbTemplate {
  id: string;
  trigger_key: string | null;
  name: string;
  subject: string;
  body_html: string;
  is_active: boolean;
  description: string | null;
}


export default function AdminEmails() {
  const [templates, setTemplates] = useState<Record<string, DbTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string>(
    EMAIL_TRIGGERS[0].trigger_key,
  );
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [testEmail, setTestEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const selectedDef: EmailTriggerDef | undefined = useMemo(
    () => EMAIL_TRIGGERS.find((t) => t.trigger_key === selectedKey),
    [selectedKey],
  );

  const fetchTemplates = async () => {
    const { data } = await supabase.from("email_templates").select("*");
    const map: Record<string, DbTemplate> = {};
    (data ?? []).forEach((t: any) => {
      if (t.trigger_key) map[t.trigger_key] = t;
    });
    setTemplates(map);
    setLoading(false);
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Beim ersten Laden: fehlende Defaults seeden
  useEffect(() => {
    if (loading) return;
    const missing = EMAIL_TRIGGERS.filter((d) => !templates[d.trigger_key]);
    if (missing.length === 0) return;
    (async () => {
      const rows = missing.map((d) => ({
        trigger_key: d.trigger_key,
        name: d.display_name,
        subject: d.default_subject,
        body_html: d.default_body_html,
        description: d.description,
        is_active: true,
      }));
      const { error } = await supabase.from("email_templates").insert(rows);
      if (!error) fetchTemplates();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Wenn Template-Auswahl wechselt, Editor füllen
  useEffect(() => {
    const t = templates[selectedKey];
    const def = EMAIL_TRIGGERS.find((d) => d.trigger_key === selectedKey);
    if (t) {
      setSubject(t.subject);
      setBodyHtml(t.body_html);
      setIsActive(t.is_active);
    } else if (def) {
      setSubject(def.default_subject);
      setBodyHtml(def.default_body_html);
      setIsActive(true);
    }
  }, [selectedKey, templates]);

  const handleInsertPlaceholder = (placeholder: string) => {
    const tag = `{{${placeholder}}}`;
    const ta = bodyRef.current;
    if (!ta) {
      setBodyHtml((b) => b + tag);
      return;
    }
    const start = ta.selectionStart ?? bodyHtml.length;
    const end = ta.selectionEnd ?? bodyHtml.length;
    const next = bodyHtml.slice(0, start) + tag + bodyHtml.slice(end);
    setBodyHtml(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const handleSave = async () => {
    if (!selectedDef) return;
    setSaving(true);
    const existing = templates[selectedKey];
    const payload = {
      trigger_key: selectedKey,
      name: selectedDef.display_name,
      subject,
      body_html: bodyHtml,
      description: selectedDef.description,
      is_active: isActive,
    };
    const { error } = existing
      ? await supabase
          .from("email_templates")
          .update(payload)
          .eq("id", existing.id)
      : await supabase.from("email_templates").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Template gespeichert");
      fetchTemplates();
    }
  };

  const handleReset = () => {
    if (!selectedDef) return;
    setSubject(selectedDef.default_subject);
    setBodyHtml(selectedDef.default_body_html);
    toast.info("Auf Standard zurückgesetzt (noch nicht gespeichert)");
  };

  const handleSendTest = async () => {
    if (!testEmail) {
      toast.error("Bitte E-Mail-Adresse eingeben");
      return;
    }
    const { data, error } = await supabase.functions.invoke(
      "send-customer-email",
      {
        body: {
          trigger_key: selectedKey,
          recipient_email: testEmail,
          data: {},
        },
      },
    );
    if (error) toast.error(error.message);
    else if ((data as any)?.dispatch_error)
      toast.warning(
        "Sender-Domain noch nicht eingerichtet – Mail konnte nicht versendet werden.",
      );
    else toast.success("Test-Mail wurde an die Versand-Queue übergeben");
  };

  const grouped = useMemo(() => {
    const g: Record<string, EmailTriggerDef[]> = {};
    EMAIL_TRIGGERS.forEach((t) => {
      g[t.category] ??= [];
      g[t.category].push(t);
    });
    return g;
  }, []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold mb-1">
          E-Mail Benachrichtigungen
        </h1>
        <p className="text-muted-foreground text-sm">
          Inhalte aller automatischen E-Mails an Kunden. HTML frei anpassbar,
          Platzhalter werden beim Versand ersetzt.
        </p>
      </div>

      <Tabs defaultValue="templates" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="preview">Vorschau</TabsTrigger>
          <TabsTrigger value="log">Versand-Log</TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <AdminEmailPreview />
        </TabsContent>

        <TabsContent value="log">
          <AdminEmailLog />
        </TabsContent>


        <TabsContent value="templates">
      <div className="grid grid-cols-12 gap-6">
        {/* Trigger-Liste */}
        <div className="col-span-12 lg:col-span-3">
          <Card>
            <CardContent className="p-3 space-y-4">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat}>
                  <div className="px-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                    {cat}
                  </div>
                  <div className="space-y-1">
                    {items.map((t) => {
                      const stored = templates[t.trigger_key];
                      const active = stored?.is_active ?? true;
                      const isSel = selectedKey === t.trigger_key;
                      return (
                        <button
                          key={t.trigger_key}
                          onClick={() => setSelectedKey(t.trigger_key)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 transition-colors ${
                            isSel
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted"
                          }`}
                        >
                          <span className="truncate">{t.display_name}</span>
                          {!active && (
                            <Badge variant="outline" className="text-[10px]">
                              aus
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Editor */}
        <div className="col-span-12 lg:col-span-9 space-y-4">
          {selectedDef && (
            <>
              <Card>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-semibold">
                        {selectedDef.display_name}
                      </h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        {selectedDef.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Label htmlFor="active" className="text-xs">
                        Aktiv
                      </Label>
                      <Switch
                        id="active"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Betreff</Label>
                    <Input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="z.B. Buchung bestätigt"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Inhalt</Label>
                      <span className="text-xs text-muted-foreground">
                        {bodyHtml.length} Zeichen
                      </span>
                    </div>
                    <Tabs defaultValue="html" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="html" className="gap-1.5">
                          <Code2 className="h-3.5 w-3.5" /> HTML
                        </TabsTrigger>
                        <TabsTrigger value="visual" className="gap-1.5">
                          <Eye className="h-3.5 w-3.5" /> Visuell
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="html" className="mt-3">
                        <Textarea
                          ref={bodyRef}
                          value={bodyHtml}
                          onChange={(e) => setBodyHtml(e.target.value)}
                          rows={18}
                          className="font-mono text-xs"
                        />
                      </TabsContent>
                      <TabsContent value="visual" className="mt-3">
                        <EmailVisualEditor
                          value={bodyHtml}
                          onChange={setBodyHtml}
                          renderPreview={renderPreview}
                          placeholders={selectedDef.placeholders}
                        />
                      </TabsContent>

                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">
                      Platzhalter (zum Einfügen klicken)
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDef.placeholders.map((p) => {
                        const meta = getPlaceholderMeta(p);
                        const Icon = meta.icon;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleInsertPlaceholder(p)}
                            title={`{{${p}}}`}
                            className="group inline-flex items-center gap-1.5 text-xs pl-2 pr-2.5 py-1.5 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
                            <span>{meta.label}</span>
                            <span className="font-mono text-[10px] text-muted-foreground/70 group-hover:text-primary/70">
                              {`{{${p}}}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>


                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? "Speichert…" : "Speichern"}
                    </Button>
                    <Button variant="outline" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Auf Standard zurücksetzen
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5 space-y-3">
                  <Label className="text-sm">Test-E-Mail senden</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="meine@email.de"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                    <Button onClick={handleSendTest} variant="secondary">
                      <Send className="h-4 w-4 mr-1" />
                      Senden
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Funktioniert nur, wenn die Sender-Domain im System
                    eingerichtet wurde.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
        </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
