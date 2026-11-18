import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, UserIcon, CalendarDays, Wallet, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const SEEN_KEY = "trainer-welcome-seen";

export default function TrainerWelcome() {
  const { user } = useAuth();
  const [trainer, setTrainer] = useState<any>(null);
  const [seen, setSeen] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("trainers").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => setTrainer(data));
  }, [user]);

  const markSeen = (k: string) => {
    const next = Array.from(new Set([...seen, k]));
    setSeen(next);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  };

  const profileDone = !!(trainer?.phone && trainer?.street && trainer?.city && trainer?.iban);

  const steps = [
    {
      key: "profile", done: profileDone, icon: UserIcon, title: "Profil vervollständigen",
      text: "Trage Telefon, Adresse und Bankdaten ein – die brauchen wir für deine Honorar-Abrechnung.",
      to: "/admin/my-profile", cta: "Zum Profil",
    },
    {
      key: "courses", done: seen.includes("courses"), icon: CalendarDays, title: "Deine Kurse ansehen",
      text: "Unter „Meine Kurse“ findest du alle deine Termine und siehst, wer angemeldet ist.",
      to: "/admin/my-courses", cta: "Zu meinen Kursen",
    },
    {
      key: "earnings", done: seen.includes("earnings"), icon: Wallet, title: "So funktioniert die Abrechnung",
      text: "Nach jedem Kurs wird dein Honorar automatisch berechnet. Unter „Mein Verdienst“ forderst du am Monatsende die Auszahlung an – die Abrechnung kommt als PDF.",
      to: "/admin/my-earnings", cta: "Zu meinem Verdienst",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const dismiss = async () => {
    await supabase.rpc("set_my_onboarding_dismissed" as any, { _dismissed: true });
    toast.success("Willkommensseite ausgeblendet. Du findest sie jederzeit unter „Mein Profil“.");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">
          Willkommen im Team{trainer?.first_name ? `, ${trainer.first_name}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Schön, dass du da bist. Drei kurze Schritte, dann kennst du dich im Backoffice aus.
        </p>
        <p className="text-sm text-primary mt-2">{doneCount} von 3 erledigt</p>
      </div>

      <div className="space-y-3">
        {steps.map((s, i) => (
          <Card key={s.key} className={s.done ? "border-primary/40" : ""}>
            <CardContent className="flex gap-4 p-5 items-start">
              {s.done ? <CheckCircle2 className="h-6 w-6 text-primary shrink-0" /> : <Circle className="h-6 w-6 text-muted-foreground shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-medium flex items-center gap-2"><s.icon className="h-4 w-4 text-primary" />{i + 1}. {s.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.text}</p>
              </div>
              <Button asChild variant={s.done ? "outline" : "default"} size="sm" onClick={() => s.key !== "profile" && markSeen(s.key)}>
                <Link to={s.to}>{s.cta}<ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-sm text-muted-foreground space-y-1">
        <p>Fragen? Schreib uns jederzeit an <a className="text-primary underline" href="mailto:info@yoga-heide.de">info@yoga-heide.de</a>.</p>
        <p>Anmelden kannst du dich künftig immer unter <span className="text-foreground">yoga-heide.de/auth</span> mit deiner E-Mail-Adresse.</p>
      </div>

      {!trainer?.onboarding_dismissed && (
        <Button variant="ghost" size="sm" onClick={dismiss}>Willkommensseite ausblenden</Button>
      )}
    </div>
  );
}
