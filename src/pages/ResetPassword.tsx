import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import logo from "@/assets/logo.webp";

type State = "checking" | "ready" | "invalid";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<State>("checking");
  const [firstName, setFirstName] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const isInvite = new URLSearchParams(window.location.search).get("invite") === "1";

  const loadName = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("first_name").eq("user_id", uid).maybeSingle();
    if (data?.first_name) setFirstName(data.first_name);
  };

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const hasError = /error_description|error_code/.test(hash + search);
    if (hasError) {
      setState("invalid");
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setState("ready");
        loadName(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { setState("ready"); loadName(data.session.user.id); }
    });

    // Falls nach kurzer Zeit keine Sitzung entsteht, ist der Link ungültig/abgelaufen
    const t = setTimeout(() => {
      setState((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      toast.error("Die Passwörter stimmen nicht überein.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }
    let target = "/dashboard";
    if (data.user) {
      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const roles = (roleRows ?? []).map((r) => r.role as string);
      if (roles.some((r) => ["admin", "staff", "trainer"].includes(r))) target = "/admin";
      if (roles.includes("trainer")) {
        const { data: ob } = await supabase.functions.invoke("trainer-onboarded", { body: {} });
        if ((ob as any)?.first || isInvite) target = "/admin/welcome";
      }
    }
    setLoading(false);
    toast.success("Passwort gespeichert – willkommen!");
    navigate(target);
  };

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResending(true);
    const { data, error } = await supabase.functions.invoke("request-password-reset", {
      body: { email: resendEmail, redirect_to: `${window.location.origin}/reset-password${isInvite ? "?invite=1" : ""}` },
    });
    setResending(false);
    if (error || (data as any)?.ok !== true) {
      toast.error("Der Link konnte nicht gesendet werden. Bitte melde dich unter info@yoga-heide.de.");
    } else {
      toast.success("Neuer Link ist unterwegs – bitte prüfe dein Postfach.");
    }
  };

  const inputCls =
    "border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] focus-visible:ring-[hsl(var(--primary))]";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-4">
      <img src={logo} alt="Santosha Yoga by Tessa" className="mb-8 h-24 w-auto opacity-80" />
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl tracking-wide text-[hsl(var(--foreground))]">{isInvite ? (firstName ? `Willkommen im Team, ${firstName}!` : "Willkommen im Team!") : "Passwort festlegen"}
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {state === "ready" ? (isInvite ? "Lege dein persönliches Passwort fest – danach bist du direkt im Backoffice." : "Lege jetzt dein persönliches Passwort fest.") : state === "checking" ? "Link wird geprüft…" : ""}
          </p>
        </div>

        {state === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-[hsl(var(--muted-foreground))]">Neues Passwort</Label>
              <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={inputCls} autoComplete="new-password" />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Mindestens 8 Zeichen.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password2" className="text-[hsl(var(--muted-foreground))]">Passwort wiederholen</Label>
              <Input id="new-password2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required minLength={8} className={inputCls} autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]" disabled={loading}>
              {loading ? "Wird gespeichert…" : "Passwort speichern"}
            </Button>
          </form>
        )}

        {state === "invalid" && (
          <form onSubmit={handleResend} className="space-y-4">
            <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">
              Dieser Link ist abgelaufen oder wurde bereits verwendet. Gib deine E-Mail-Adresse ein – wir schicken dir sofort einen neuen.
            </p>
            <Input type="email" required placeholder="deine@email.de" value={resendEmail} onChange={(e) => setResendEmail(e.target.value)} className={inputCls} />
            <Button type="submit" disabled={resending} className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]">
              {resending ? "Wird gesendet…" : "Neuen Link per E-Mail senden"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-[hsl(var(--muted-foreground))]" onClick={() => navigate("/auth")}>Zum Login</Button>
          </form>
        )}
      </div>
    </div>
  );
}
