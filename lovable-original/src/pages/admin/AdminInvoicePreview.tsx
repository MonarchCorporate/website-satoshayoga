import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminInvoicePreview() {
  const [searchParams] = useSearchParams();
  const path = searchParams.get("path");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setPdfUrl(null);
    setError(null);

    if (!path) {
      setError("Keine Rechnung ausgewählt.");
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.storage.from("invoices").download(path);
        if (cancelled) return;
        if (error || !data) throw new Error(error?.message || "PDF konnte nicht geladen werden.");

        const head = new Uint8Array(await data.slice(0, 5).arrayBuffer());
        const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
        if (!isPdf) throw new Error("Die geladene Datei ist keine gültige PDF.");

        objectUrl = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
        setPdfUrl(objectUrl);
      } catch (e: any) {
        setError(e?.message || "Unbekannter Fehler beim Laden der Rechnung.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, reloadKey]);

  const downloadInvoice = async () => {
    if (!path) return;
    try {
      const { data, error } = await supabase.storage.from("invoices").download(path);
      if (error || !data) throw new Error(error?.message || "Download fehlgeschlagen");
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = path.split("/").pop() || "rechnung.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      toast.error(`Download fehlgeschlagen: ${e?.message ?? "Unbekannter Fehler"}`);
    }
  };

  return (
    <div className="p-6 space-y-4 min-h-screen">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/orders">
              <ArrowLeft className="h-4 w-4 mr-2" /> Zurück zu Bestellungen
            </Link>
          </Button>
          <h1 className="font-display text-3xl font-semibold">Rechnungsvorschau</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" /> Neu laden
          </Button>
          <Button onClick={downloadInvoice} disabled={!path || loading}>
            <Download className="h-4 w-4 mr-2" /> PDF herunterladen
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 min-h-[75vh] bg-background">
          {loading ? (
            <p className="p-6 text-muted-foreground">Rechnung wird geladen…</p>
          ) : error ? (
            <div className="p-6 space-y-3">
              <p className="font-medium text-destructive">Rechnung konnte nicht angezeigt werden.</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
                Erneut versuchen
              </Button>
            </div>
          ) : pdfUrl ? (
            <object
              data={pdfUrl}
              type="application/pdf"
              className="w-full h-[75vh] rounded-b-md bg-white"
              aria-label="Rechnungsvorschau"
            >
              <div className="p-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Dein Browser oder eine Erweiterung blockiert die Inline-Anzeige der PDF. Der Download funktioniert weiterhin.
                </p>
                <Button onClick={downloadInvoice}>
                  <Download className="h-4 w-4 mr-2" /> PDF herunterladen
                </Button>
              </div>
            </object>
          ) : (
            <p className="p-6 text-muted-foreground">Keine Vorschau verfügbar.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}