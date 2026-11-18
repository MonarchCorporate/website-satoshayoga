import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function VideoCourseReturn() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = sessionStorage.getItem(`vc_purchase_${slug}`);
        if (!raw) { setStatus("error"); setMessage("Kauf-Daten fehlen."); return; }
        const info = JSON.parse(raw);
        const { data, error } = await supabase.functions.invoke("paypal-capture-course-purchase", {
          body: info,
        });
        if (error || (data as any)?.error) {
          setStatus("error");
          setMessage((error?.message) || (data as any)?.error || "Fehler beim Abschluss");
          return;
        }
        sessionStorage.removeItem(`vc_purchase_${slug}`);
        setStatus("ok");
        toast.success("Zugang aktiviert");
        setTimeout(() => navigate(`/meine-online-kurse/${slug}`), 1200);
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message);
      }
    })();
  }, [slug, navigate]);

  return (
    <div className="container py-20 flex flex-col items-center text-center gap-4">
      {status === "working" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p>Zahlung wird bestätigt…</p>
        </>
      )}
      {status === "ok" && (
        <>
          <p className="font-display text-2xl">Vielen Dank! Dein Zugang ist aktiv.</p>
          <p className="text-muted-foreground">Du wirst weitergeleitet…</p>
        </>
      )}
      {status === "error" && (
        <>
          <p className="font-display text-2xl text-destructive">Etwas ist schiefgelaufen</p>
          <p className="text-muted-foreground">{message}</p>
          <Link to={`/online-kurse/${slug}`} className="underline">Zurück zum Kurs</Link>
        </>
      )}
    </div>
  );
}
