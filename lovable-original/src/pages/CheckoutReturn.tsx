import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2, Download } from "lucide-react";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [result, setResult] = useState<{
    order_number?: string;
    invoice_pdf_url?: string;
    error?: string;
  }>({});

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setResult({ error: "Kein PayPal-Token in der URL." });
      return;
    }
    (async () => {
      let guestToken: string | null = null;
      try { guestToken = sessionStorage.getItem("guest_booking_token"); } catch {}
      const { data, error } = await supabase.functions.invoke("capture-paypal-order", {
        body: { paypal_order_id: token },
        ...(guestToken ? { headers: { "x-guest-token": guestToken } } : {}),
      });
      if (guestToken) { try { sessionStorage.removeItem("guest_booking_token"); } catch {} }
      if (error || !data?.ok) {
        setState("error");
        setResult({ error: error?.message ?? data?.error ?? "Zahlung konnte nicht bestätigt werden." });
        return;
      }
      try { localStorage.removeItem("appliedVoucher"); } catch {}
      setResult({
        order_number: data.order_number,
        invoice_pdf_url: data.invoice_pdf_url,
      });
      setState("ok");
    })();
  }, [params]);

  return (
    <div className="container max-w-xl py-16">
      <Card>
        <CardContent className="text-center py-12 space-y-4">
          {state === "loading" && (
            <>
              <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
              <h2 className="font-display text-2xl">Zahlung wird bestätigt…</h2>
              <p className="text-muted-foreground text-sm">
                Bitte schließe dieses Fenster nicht.
              </p>
            </>
          )}
          {state === "ok" && (
            <>
              <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
              <h2 className="font-display text-2xl font-semibold">
                Zahlung erfolgreich!
              </h2>
              {result.order_number && (
                <p className="text-muted-foreground">
                  Bestellnummer:{" "}
                  <span className="font-mono font-semibold">{result.order_number}</span>
                </p>
              )}
              {result.invoice_pdf_url && (
                <Button asChild variant="outline">
                  <a href={result.invoice_pdf_url} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-2" />
                    Rechnung herunterladen
                  </a>
                </Button>
              )}
              <div className="flex justify-center gap-2 pt-4">
                <Button onClick={() => navigate("/dashboard")}>Zum Dashboard</Button>
              </div>
            </>
          )}
          {state === "error" && (
            <>
              <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
              <h2 className="font-display text-2xl">Zahlung nicht bestätigt</h2>
              <p className="text-muted-foreground text-sm">{result.error}</p>
              <Button asChild variant="outline">
                <Link to="/checkout">Zurück zur Kasse</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
