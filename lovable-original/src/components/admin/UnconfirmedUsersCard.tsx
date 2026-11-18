import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { MailWarning, RefreshCw } from "lucide-react";

type Row = {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
  confirmation_sent_at: string | null;
};

const fmt = (d: string | null) =>
  d ? format(parseISO(d), "dd.MM.yyyy HH:mm", { locale: de }) : "–";

export default function UnconfirmedUsersCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("account-confirmation", {
      body: { action: "admin_list" },
    });
    setLoading(false);
    if (error) { toast.error("Unbestätigte Konten konnten nicht geladen werden."); return; }
    setRows((data as any)?.users ?? []);
  };

  useEffect(() => { load(); }, []);

  const act = async (row: Row, action: "admin_resend" | "admin_confirm") => {
    setBusy(row.user_id + action);
    const { data, error } = await supabase.functions.invoke("account-confirmation", {
      body: { action, user_id: row.user_id },
    });
    setBusy(null);
    if (error || (data as any)?.ok !== true) {
      toast.error(action === "admin_resend" ? "E-Mail konnte nicht gesendet werden." : "Bestätigung fehlgeschlagen.");
      return;
    }
    if (action === "admin_resend") {
      toast.success(`Bestätigungs-E-Mail an ${row.email} gesendet.`);
    } else {
      toast.success(`${row.email} ist jetzt bestätigt und kann sich anmelden.`);
      setRows((r) => r.filter((x) => x.user_id !== row.user_id));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MailWarning className="h-5 w-5 text-primary" />
          Unbestätigte Konten
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Laden…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Alle Konten sind bestätigt.</p>
        ) : (
          rows.map((r) => (
            <div key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[r.first_name, r.last_name].filter(Boolean).join(" ") || "–"}{" "}
                  <span className="text-muted-foreground font-normal">· {r.email}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Registriert {fmt(r.created_at)} · letzte Mail {fmt(r.confirmation_sent_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(r, "admin_resend")}>
                  {busy === r.user_id + "admin_resend" ? "Sendet…" : "E-Mail erneut senden"}
                </Button>
                <Button size="sm" disabled={!!busy} onClick={() => act(r, "admin_confirm")}>
                  Manuell bestätigen
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
