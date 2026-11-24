import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

interface LogRow {
  id: string;
  trigger_key: string | null;
  recipient_email: string;
  subject: string | null;
  body_html: string | null;
  status: string;
  error_message: string | null;
  source: string;
  metadata: Record<string, unknown> | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

const RANGES: { key: string; label: string; hours: number | null }[] = [
  { key: "24h", label: "24 Std.", hours: 24 },
  { key: "7d", label: "7 Tage", hours: 24 * 7 },
  { key: "30d", label: "30 Tage", hours: 24 * 30 },
  { key: "all", label: "Alle", hours: null },
];

const PAGE_SIZE = 50;

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string; icon: JSX.Element }> = {
    sent: {
      label: "Zugestellt",
      cls: "bg-green-500/15 text-green-600 border-green-500/30",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    pending: {
      label: "Ausstehend",
      cls: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
      icon: <Clock className="h-3 w-3" />,
    },
    failed: {
      label: "Fehlgeschlagen",
      cls: "bg-red-500/15 text-red-600 border-red-500/30",
      icon: <XCircle className="h-3 w-3" />,
    },
    bounced: {
      label: "Bounce",
      cls: "bg-orange-500/15 text-orange-600 border-orange-500/30",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
  };
  const e = map[status] ?? {
    label: status,
    cls: "bg-muted text-muted-foreground border-border",
    icon: <Clock className="h-3 w-3" />,
  };
  return (
    <Badge variant="outline" className={`gap-1 ${e.cls}`}>
      {e.icon}
      {e.label}
    </Badge>
  );
};

export default function AdminEmailLog() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState("all");
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE); // 0 = alle
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const range = RANGES.find((r) => r.key === rangeKey);
    let query = supabase
      .from("email_send_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (pageSize > 0) query = query.range(page * pageSize, page * pageSize + pageSize - 1);

    if (range?.hours) {
      const since = new Date(Date.now() - range.hours * 3600 * 1000).toISOString();
      query = query.gte("created_at", since);
    }
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (sourceFilter !== "all") query = query.eq("source", sourceFilter);
    if (search.trim()) query = query.ilike("recipient_email", `%${search.trim()}%`);

    const { data, count } = await query;
    setRows((data ?? []) as LogRow[]);
    setTotal(count ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey, statusFilter, sourceFilter, page, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [rangeKey, statusFilter, sourceFilter, search]);

  const stats = useMemo(() => {
    const s = { total: rows.length, sent: 0, failed: 0, pending: 0 };
    rows.forEach((r) => {
      if (r.status === "sent") s.sent++;
      else if (r.status === "failed" || r.status === "bounced") s.failed++;
      else if (r.status === "pending") s.pending++;
    });
    return s;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Auf dieser Seite" value={stats.total} />
        <StatCard label="Zugestellt" value={stats.sent} tone="success" />
        <StatCard label="Fehler" value={stats.failed} tone="danger" />
        <StatCard label="Gesamt (Filter)" value={total} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <Button
                  key={r.key}
                  size="sm"
                  variant={rangeKey === r.key ? "default" : "outline"}
                  onClick={() => setRangeKey(r.key)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="sent">Zugestellt</SelectItem>
                <SelectItem value="pending">Ausstehend</SelectItem>
                <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                <SelectItem value="bounced">Bounce</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Quellen</SelectItem>
                <SelectItem value="transactional">Transaktional</SelectItem>
                <SelectItem value="newsletter">Newsletter</SelectItem>
                <SelectItem value="auth">Auth</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Empfänger suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
              className="w-[220px]"
            />
            <Button size="sm" variant="outline" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4 mr-1" /> Aktualisieren
            </Button>
          </div>

          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Zeitpunkt</TableHead>
                  <TableHead>Empfänger</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead className="w-[120px]">Trigger</TableHead>
                  <TableHead className="w-[110px]">Quelle</TableHead>
                  <TableHead className="w-[140px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Lade…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      Keine Einträge im gewählten Zeitraum.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setSelected(r)}
                    >
                      <TableCell className="text-xs">
                        {new Date(r.created_at).toLocaleString("de-DE")}
                      </TableCell>
                      <TableCell className="text-sm">{r.recipient_email}</TableCell>
                      <TableCell className="text-sm truncate max-w-[300px]">
                        {r.subject}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.trigger_key ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">{r.source}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                {pageSize > 0
                  ? `Seite ${page + 1} / ${Math.max(1, Math.ceil(total / pageSize))} — ${total} Einträge`
                  : `Alle ${total} Einträge`}
              </span>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(0); }}>
                <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[50, 100, 500].map((n) => <SelectItem key={n} value={String(n)}>{n}/Seite</SelectItem>)}
                  <SelectItem value="0">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pageSize === 0 || page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Zurück
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pageSize === 0 || (page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Weiter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.subject || "(kein Betreff)"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Status"><StatusBadge status={selected.status} /></Field>
                  <Field label="Quelle">{selected.source}</Field>
                  <Field label="Empfänger">{selected.recipient_email}</Field>
                  <Field label="Trigger">{selected.trigger_key ?? "—"}</Field>
                  <Field label="Erstellt">
                    {new Date(selected.created_at).toLocaleString("de-DE")}
                  </Field>
                  <Field label="Zugestellt">
                    {selected.sent_at
                      ? new Date(selected.sent_at).toLocaleString("de-DE")
                      : "—"}
                  </Field>
                </div>
                {selected.error_message && (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-400">
                    <div className="font-medium mb-1">Fehler</div>
                    {selected.error_message}
                  </div>
                )}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Metadaten
                    </div>
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.body_html && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      E-Mail-Inhalt
                    </div>
                    <div
                      className="border rounded p-3 bg-white text-black text-sm overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: selected.body_html }}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

const StatCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          tone === "success"
            ? "text-green-600"
            : tone === "danger"
            ? "text-red-600"
            : ""
        }`}
      >
        {value}
      </div>
    </CardContent>
  </Card>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-sm mt-0.5">{children}</div>
  </div>
);
