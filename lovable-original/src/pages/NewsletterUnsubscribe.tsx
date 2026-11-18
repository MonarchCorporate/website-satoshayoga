import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.webp";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-unsubscribe`;

export default function NewsletterUnsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Ungültiger Link.");
      setLoading(false);
      return;
    }
    fetch(`${FN_URL}?token=${encodeURIComponent(token)}`, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Fehler");
        setEmail(j.email);
        setAlready(!!j.alreadyUnsubscribed);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const r = await fetch(FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Fehler");
      setDone(true);
      toast.success("Du wurdest erfolgreich abgemeldet.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-4">
      <img src={logo} alt="Santosha Yoga" className="mb-8 h-20 w-auto opacity-80" />
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-8 text-center">
          <h1 className="font-display text-2xl text-foreground">Newsletter abmelden</h1>
          {loading && <p className="text-sm text-muted-foreground">Bitte warten…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && done && (
            <p className="text-sm text-muted-foreground">
              <strong>{email}</strong> wurde aus dem Verteiler entfernt. Du erhältst keine weiteren Newsletter mehr.
            </p>
          )}
          {!loading && !error && !done && already && (
            <p className="text-sm text-muted-foreground">
              <strong>{email}</strong> ist bereits abgemeldet. Es werden keine Newsletter versendet.
            </p>
          )}
          {!loading && !error && !done && !already && email && (
            <>
              <p className="text-sm text-muted-foreground">
                Möchtest du dich wirklich vom Newsletter für <strong>{email}</strong> abmelden?
              </p>
              <Button onClick={confirm} disabled={submitting} className="w-full">
                {submitting ? "Wird abgemeldet…" : "Abmeldung bestätigen"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
