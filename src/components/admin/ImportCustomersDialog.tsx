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

type ParsedRow = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  birthday?: string;
  note?: string;
  _valid: boolean;
  _reason?: string;
};

type ResultRow = {
  email: string;
  status: "created" | "updated" | "skipped" | "error";
  message?: string;
};

// Minimal RFC4180 CSV parser (handles quotes, commas, newlines inside quotes)
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
        } else {
          inQuotes = false;
        }
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

// Parse "September 25, 1986" or "1986-09-25" -> "YYYY-MM-DD"
function parseBirthday(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePhone(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.replace(/\s+/g, "").trim();
  return s || undefined;
}

function normalizeEmail(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v.trim().toLowerCase();
}

const HEADER_ALIASES: Record<string, keyof ParsedRow> = {
  vorname: "first_name",
  "first name": "first_name",
  firstname: "first_name",
  nachname: "last_name",
  "last name": "last_name",
  lastname: "last_name",
  "e-mail": "email",
  email: "email",
  mail: "email",
  telefon: "phone",
  phone: "phone",
  handy: "phone",
  geburtsdatum: "birthday",
  birthday: "birthday",
  notiz: "note",
  note: "note",
  notes: "note",
};

export default function ImportCustomersDialog({
  onDone,
}: {
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
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
    const idx: Partial<Record<keyof ParsedRow, number>> = {};
    header.forEach((h, i) => {
      const key = HEADER_ALIASES[h];
      if (key) idx[key] = i;
    });

    const parsed: ParsedRow[] = grid.slice(1).map((cols) => {
      const email = normalizeEmail(idx.email !== undefined ? cols[idx.email!] : undefined);
      const row: ParsedRow = {
        first_name: idx.first_name !== undefined ? cols[idx.first_name!]?.trim() : undefined,
        last_name: idx.last_name !== undefined ? cols[idx.last_name!]?.trim() : undefined,
        email,
        phone: normalizePhone(idx.phone !== undefined ? cols[idx.phone!] : undefined),
        birthday: parseBirthday(idx.birthday !== undefined ? cols[idx.birthday!] : undefined),
        note: idx.note !== undefined ? cols[idx.note!]?.trim() || undefined : undefined,
        _valid: !!email && email.includes("@"),
      };
      if (!row._valid) row._reason = "keine E-Mail";
      return row;
    });

    setRows(parsed);
  };

  const runImport = async () => {
    const payload = rows
      .filter((r) => r._valid)
      .map((r) => ({
        first_name: r.first_name ?? null,
        last_name: r.last_name ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        birthday: r.birthday ?? null,
        note: r.note ?? null,
      }));

    if (payload.length === 0) {
      toast.error("Keine gültigen Zeilen zum Importieren.");
      return;
    }

    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-customers", {
        body: { rows: payload, conflict },
      });
      if (error) throw error;
      const res = (data?.results as ResultRow[]) ?? [];
      setResults(res);
      const s = data?.summary ?? {};
      toast.success(
        `Import fertig: ${s.created ?? 0} angelegt, ${s.updated ?? 0} aktualisiert, ${
          s.skipped ?? 0
        } übersprungen, ${s.error ?? 0} Fehler`,
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
          <DialogTitle>Kunden aus CSV importieren</DialogTitle>
          <DialogDescription>
            Erwartete Spalten: <em>Vorname, Nachname, E-Mail, Telefon, Geburtsdatum</em>.
            Zeilen ohne E-Mail werden übersprungen. Accounts werden still angelegt –
            Kunden können sich per „Passwort vergessen" ein Passwort setzen.
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
              {fileName && (
                <p className="text-xs text-muted-foreground">{fileName}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Bei existierender E-Mail</Label>
              <Select value={conflict} onValueChange={(v: any) => setConflict(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">Überspringen</SelectItem>
                  <SelectItem value="update">
                    Profil aktualisieren (Name, Telefon, Geburtstag)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Zeilen: {stats.total}</Badge>
              <Badge>Gültig: {stats.valid}</Badge>
              {stats.invalid > 0 && (
                <Badge variant="destructive">Ohne E-Mail: {stats.invalid}</Badge>
              )}
            </div>
          )}

          {rows.length > 0 && !results && (
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Geburtstag</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 200).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "–"}
                      </TableCell>
                      <TableCell>{r.email || "–"}</TableCell>
                      <TableCell>{r.phone || "–"}</TableCell>
                      <TableCell>{r.birthday || "–"}</TableCell>
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
              {rows.length > 200 && (
                <p className="p-2 text-xs text-muted-foreground">
                  … {rows.length - 200} weitere Zeilen (Vorschau gekürzt)
                </p>
              )}
            </ScrollArea>
          )}

          {results && (
            <ScrollArea className="h-64 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Hinweis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.email}</TableCell>
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
              <Button
                onClick={runImport}
                disabled={running || stats.valid === 0}
              >
                {running ? "Importiere…" : `${stats.valid} Kunden importieren`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
