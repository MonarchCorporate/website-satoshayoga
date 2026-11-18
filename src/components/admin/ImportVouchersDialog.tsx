import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";

type ScopeKind = "five" | "ten" | "course" | "unknown";

type ParsedRow = {
  code: string;
  discount_percent: number;
  discount_amount_fixed: number | null;
  max_total_uses: number | null;
  times_used: number;
  scope: ScopeKind;
  raw_service: string;
  _valid: boolean;
  _reason?: string;
};

type ResultRow = {
  code: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
};

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

function detectScope(service: string): ScopeKind {
  const s = service.toLowerCase();
  if (s.includes("10")) return "ten";
  if (s.includes("5")) return "five";
  if (s.includes("yoga")) return "course";
  return "unknown";
}

const HEADERS = {
  code: ["code"],
  percent: ["rabatt (%)", "rabatt", "discount", "percent"],
  fixed: ["reduktion", "amount", "betrag"],
  service: ["dienstleistungen", "dienstleistung", "service", "services"],
  limit: ["begrenzung", "limit", "max"],
  used: ["verwendet", "used"],
};

function findIdx(header: string[], names: string[]): number {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

export default function ImportVouchersDialog({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [conflict, setConflict] = useState<"skip" | "update">("skip");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r._valid).length;
    return { total: rows.length, valid, invalid: rows.length - valid };
  }, [rows]);

  const handleFile = async (file: File) => {
    setResults(null);
    setFileName(file.name);
    const text = await file.text();
    const grid = parseCSV(text);
    if (grid.length < 2) {
      toast.error("CSV enthält keine Datenzeilen.");
      setRows([]);
      return;
    }
    const header = grid[0].map((h) => h.trim().toLowerCase());
    const iCode = findIdx(header, HEADERS.code);
    const iPct = findIdx(header, HEADERS.percent);
    const iFix = findIdx(header, HEADERS.fixed);
    const iSvc = findIdx(header, HEADERS.service);
    const iLim = findIdx(header, HEADERS.limit);
    const iUsed = findIdx(header, HEADERS.used);

    const parsed: ParsedRow[] = grid.slice(1).map((cols) => {
      const code = (iCode >= 0 ? cols[iCode] : "").trim();
      const pct = iPct >= 0 ? Number((cols[iPct] || "0").replace(",", ".")) : 0;
      const fix = iFix >= 0 ? Number((cols[iFix] || "0").replace(",", ".")) : 0;
      const service = iSvc >= 0 ? cols[iSvc] : "";
      const lim = iLim >= 0 ? Number((cols[iLim] || "0").replace(",", ".")) : 0;
      const used = iUsed >= 0 ? Number((cols[iUsed] || "0").replace(",", ".")) : 0;
      // Fixbetrag-Gutscheine gelten immer für Kursbuchungen (unabhängig vom CSV-Feld).
      const scope: ScopeKind = fix > 0 ? "course" : detectScope(service);
      const hasDiscount = pct > 0 || fix > 0;
      const valid = !!code && hasDiscount && scope !== "unknown";
      let reason: string | undefined;
      if (!code) reason = "kein Code";
      else if (!hasDiscount) reason = "kein Rabatt";
      else if (scope === "unknown") reason = "Dienstleistung unklar";
      return {
        code,
        discount_percent: pct,
        discount_amount_fixed: fix > 0 ? fix : null,
        max_total_uses: lim > 0 ? lim : null,
        times_used: used || 0,
        scope,
        raw_service: service,
        _valid: valid,
        _reason: reason,
      };
    });

    setRows(parsed);
  };

  const runImport = async () => {
    const payload = rows.filter((r) => r._valid).map((r) => ({
      code: r.code,
      discount_percent: r.discount_percent,
      discount_amount_fixed: r.discount_amount_fixed,
      max_total_uses: r.max_total_uses,
      times_used: r.times_used,
      scope: r.scope,
    }));
    if (payload.length === 0) {
      toast.error("Keine gültigen Zeilen zum Importieren.");
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-vouchers", {
        body: { rows: payload, conflict },
      });
      if (error) throw error;
      const res = (data?.results as ResultRow[]) ?? [];
      setResults(res);
      const s = data?.summary ?? {};
      toast.success(
        `Import fertig: ${s.created ?? 0} angelegt, ${s.updated ?? 0} aktualisiert, ${s.skipped ?? 0} übersprungen, ${s.error ?? 0} Fehler`,
      );
      onDone?.();
    } catch (e: any) {
      toast.error("Import fehlgeschlagen: " + (e?.message ?? String(e)));
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setRows([]);
    setResults(null);
    setFileName("");
  };

  const scopeLabel = (s: ScopeKind) =>
    s === "five" ? "5er-Karte" : s === "ten" ? "10er-Karte" : s === "course" ? "Kursbuchung" : "?";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-2" />
        CSV importieren
      </Button>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gutscheincodes aus CSV importieren</DialogTitle>
          <DialogDescription>
            Erwartete Spalten: <em>Code, Rabatt (%), Reduktion, Dienstleistungen, Begrenzung, Verwendet</em>.
            5er/10er-Karten-Codes gelten für die entsprechenden Karten im Shop, „1x Yoga" für Kursbuchungen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>CSV-Datei</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
            </div>
            <div className="space-y-2">
              <Label>Bei existierendem Code</Label>
              <Select value={conflict} onValueChange={(v: any) => setConflict(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Überspringen</SelectItem>
                  <SelectItem value="update">Aktualisieren</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Zeilen: {stats.total}</Badge>
              <Badge>Gültig: {stats.valid}</Badge>
              {stats.invalid > 0 && (
                <Badge variant="destructive">Ungültig: {stats.invalid}</Badge>
              )}
            </div>
          )}

          {rows.length > 0 && !results && (
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Rabatt</TableHead>
                    <TableHead>Gilt für</TableHead>
                    <TableHead>Nutzungen</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{r.code || "–"}</TableCell>
                      <TableCell>
                        {r.discount_amount_fixed
                          ? `${r.discount_amount_fixed.toFixed(2)} €`
                          : `${r.discount_percent}%`}
                      </TableCell>
                      <TableCell>{scopeLabel(r.scope)}</TableCell>
                      <TableCell className="text-sm">
                        {r.times_used}
                        {r.max_total_uses ? ` / ${r.max_total_uses}` : " / ∞"}
                      </TableCell>
                      <TableCell>
                        {r._valid ? (
                          <Badge variant="secondary">ok</Badge>
                        ) : (
                          <Badge variant="destructive">{r._reason}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {results && (
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hinweis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "created"
                              ? "default"
                              : r.status === "updated"
                                ? "secondary"
                                : r.status === "error"
                                  ? "destructive"
                                  : "outline"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.message || ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          {results ? (
            <Button onClick={() => setOpen(false)}>Fertig</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={runImport} disabled={running || stats.valid === 0}>
                {running ? "Importiere…" : `${stats.valid} Gutscheine importieren`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
