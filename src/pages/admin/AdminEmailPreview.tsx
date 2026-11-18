import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eye, Search } from "lucide-react";
import { EMAIL_TRIGGERS } from "@/lib/email-triggers";
import {
  EMAIL_PREVIEW_SAMPLES,
  renderEmailPreview,
  renderEmailSubject,
} from "@/lib/email-preview-samples";

interface Row {
  trigger_key: string | null;
  name: string;
  subject: string;
  body_html: string;
  is_active: boolean;
}

export default function AdminEmailPreview() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("email_templates")
        .select("trigger_key,name,subject,body_html,is_active");
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const order = EMAIL_TRIGGERS.map((t) => t.trigger_key);
    const sorted = [...rows].sort((a, b) => {
      const ai = order.indexOf(a.trigger_key || "");
      const bi = order.indexOf(b.trigger_key || "");
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    if (!q) return sorted;
    return sorted.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        (r.trigger_key || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const openRow = openKey
    ? rows.find((r) => r.trigger_key === openKey)
    : undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-semibold">
              Vorschau aller E-Mail-Vorlagen
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Alle Platzhalter werden mit Beispiel-Daten ersetzt. Nichts wird
              versendet.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lade Vorlagen …</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((r) => (
            <Card key={r.trigger_key || r.name} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium truncate">{r.name}</h3>
                      {!r.is_active && (
                        <Badge variant="outline" className="text-[10px]">
                          aus
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {renderEmailSubject(r.subject)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setOpenKey(r.trigger_key)}
                    disabled={!r.trigger_key}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Groß
                  </Button>
                </div>
                <div className="border-t bg-muted/30 h-64 overflow-hidden relative">
                  <iframe
                    title={r.name}
                    srcDoc={renderEmailPreview(r.body_html)}
                    sandbox=""
                    className="pointer-events-none origin-top-left"
                    style={{
                      width: "200%",
                      height: "512px",
                      transform: "scale(0.5)",
                      border: 0,
                      background: "#fff",
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          {list.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">
              Keine Vorlagen gefunden.
            </p>
          )}
        </div>
      )}

      <Dialog open={!!openKey} onOpenChange={(o) => !o && setOpenKey(null)}>
        <DialogContent className="max-w-4xl p-0">
          <DialogHeader className="p-5 pb-3">
            <DialogTitle className="font-display">
              {openRow?.name}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Betreff: {openRow ? renderEmailSubject(openRow.subject) : ""}
            </p>
          </DialogHeader>
          {openRow && (
            <iframe
              title={openRow.name}
              srcDoc={renderEmailPreview(openRow.body_html)}
              sandbox=""
              className="w-full h-[75vh] border-t bg-white"
            />
          )}
          <div className="p-4 border-t text-[11px] text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-medium">Beispiel-Daten:</span>
            {Object.entries(EMAIL_PREVIEW_SAMPLES)
              .slice(0, 8)
              .map(([k, v]) => (
                <span key={k} className="font-mono">
                  {k}={v}
                </span>
              ))}
            <span>…</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
