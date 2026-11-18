import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/logo.webp";
import { PrivacyConsent } from "@/components/PrivacyConsent";

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const [resetEmail, setResetEmail] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });
    if (error) {
      setLoading(false);
      const code = (error as any).code as string | undefined;
      if (code === "email_not_confirmed" || (error.message || "").toLowerCase().includes("not confirmed")) {
        setPendingConfirmEmail(loginEmail);
        toast.error("Deine E-Mail-Adresse ist noch nicht bestätigt. Wir können dir den Link erneut senden.");
        return;
      }
      if (code === "invalid_credentials") {
        toast.error("E-Mail oder Passwort ist falsch.");
        return;
      }
      toast.error(error.message);
      return;
    }
    // Determine landing route based on roles
    let target = "/dashboard";
    if (data.user) {
      const { data: roleRows } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id);
      const roles = (roleRows ?? []).map(r => r.role as string);
      if (roles.includes("admin") || roles.includes("trainer") || roles.includes("staff")) {
        target = "/admin";
      }
    }
    setLoading(false);
    toast.success("Willkommen zurück!");
    navigate(target);
  };

  const showAlreadyRegistered = () => {
    toast.error('Du bist schon registriert – nutze die „Passwort vergessen"-Option.', {
      action: {
        label: "Passwort zurücksetzen",
        onClick: () => {
          setResetEmail(signupEmail);
          setShowReset(true);
        },
      },
      duration: 10000,
    });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privacyAccepted) {
      toast.error("Bitte stimme der Datenschutzerklärung zu.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("account-confirmation", {
      body: {
        action: "signup",
        email: signupEmail,
        password: signupPassword,
        first_name: firstName,
        last_name: lastName,
        newsletter_opt_in: newsletterOptIn,
      },
    });
    setLoading(false);

    let code = (data as any)?.error as string | undefined;
    if (error && !code) {
      try {
        const ctx = await (error as any).context?.json?.();
        code = ctx?.error;
      } catch { /* ignore */ }
    }
    if (code === "already_registered") { showAlreadyRegistered(); return; }
    if (code === "weak_password") {
      toast.error("Dieses Passwort ist zu unsicher. Bitte wähle ein längeres/komplexeres Passwort.");
      return;
    }
    if (code === "invalid_email") { toast.error("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    if (error || code || (data as any)?.ok !== true) {
      toast.error("Die Bestätigungs-E-Mail konnte nicht versendet werden. Bitte versuche es erneut oder melde dich unter info@yoga-heide.de.");
      return;
    }

    if (!(data as any)?.resent) {
      supabase.functions
        .invoke("send-customer-email", {
          body: {
            trigger_key: "welcome",
            recipient_email: signupEmail,
            data: {
              customer_first_name: firstName,
              customer_last_name: lastName,
              dashboard_url: `${window.location.origin}/dashboard`,
            },
            idempotency_key: `welcome-${signupEmail}`,
          },
        })
        .catch(() => {});
    }
    setPendingConfirmEmail(signupEmail);
    toast.success("Fast geschafft! Bitte klicke auf den Bestätigungs-Link in deiner E-Mail.");
  };

  const handleResendConfirmation = async () => {
    if (!pendingConfirmEmail) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("account-confirmation", {
      body: { action: "resend", email: pendingConfirmEmail },
    });
    setLoading(false);
    if (error || (data as any)?.ok !== true) {
      toast.error("Die E-Mail konnte nicht versendet werden. Bitte melde dich unter info@yoga-heide.de.");
    } else {
      toast.success("Bestätigungs-E-Mail wurde erneut gesendet. Bitte prüfe auch den Spam-Ordner.");
    }
  };


  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("request-password-reset", {
      body: {
        email: resetEmail,
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    setLoading(false);
    if (error || (data as any)?.error || (data as any)?.ok !== true) {
      toast.error(
        "Die E-Mail konnte nicht versendet werden. Bitte versuche es später erneut oder melde dich bei uns.",
      );
    } else {
      toast.success("Link zum Zurücksetzen wurde gesendet! Bitte prüfe dein Postfach.");
      setShowReset(false);
    }
  };

  if (showReset) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-4">
        <div className="mb-8">
          <img src={logo} alt="Santosha Yoga by Tessa" className="h-24 w-auto opacity-80" />
        </div>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="font-display text-2xl tracking-wide text-[hsl(var(--foreground))]">
              Passwort zurücksetzen
            </h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Gib deine E-Mail-Adresse ein</p>
          </div>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-[hsl(var(--muted-foreground))]">E-Mail</Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
              />
            </div>
            <Button type="submit" className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]" disabled={loading}>
              {loading ? "Wird gesendet…" : "Link senden"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" onClick={() => setShowReset(false)}>
              Zurück zum Login
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="mb-8">
        <img src={logo} alt="Santosha Yoga by Tessa" className="h-32 w-auto opacity-80" />
      </div>

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="font-display text-3xl tracking-wide text-[hsl(var(--foreground))]">
            Kunden-Portal
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Melde dich an oder erstelle ein Konto
          </p>
        </div>

        {pendingConfirmEmail && (
          <div className="rounded-md border border-[hsl(var(--primary))]/40 bg-[hsl(var(--secondary))] p-4 text-sm text-[hsl(var(--foreground))] space-y-3">
            <p>
              Bitte bestätige deine E-Mail-Adresse <strong>{pendingConfirmEmail}</strong> über den Link in unserer E-Mail
              (Absender info@yoga-heide.de). Schau bitte auch im Spam-Ordner nach.
            </p>
            <Button type="button" variant="outline" className="w-full" disabled={loading} onClick={handleResendConfirmation}>
              Bestätigungs-E-Mail erneut senden
            </Button>
          </div>
        )}
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-[hsl(var(--secondary))]">
            <TabsTrigger value="login" className="data-[state=active]:bg-[hsl(var(--primary))] data-[state=active]:text-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]">
              Anmelden
            </TabsTrigger>
            <TabsTrigger value="signup" className="data-[state=active]:bg-[hsl(var(--primary))] data-[state=active]:text-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]">
              Registrieren
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-[hsl(var(--muted-foreground))]">E-Mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password" className="text-[hsl(var(--muted-foreground))]">Passwort</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                />
              </div>
              <Button type="submit" className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]" disabled={loading}>
                {loading ? "Wird angemeldet…" : "Anmelden"}
              </Button>
              <button
                type="button"
                className="text-sm text-[hsl(var(--primary))] hover:text-[hsl(var(--sand-light))] hover:underline w-full text-center transition-colors"
                onClick={() => setShowReset(true)}
              >
                Passwort vergessen?
              </button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first-name" className="text-[hsl(var(--muted-foreground))]">Vorname</Label>
                  <Input
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name" className="text-[hsl(var(--muted-foreground))]">Nachname</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-[hsl(var(--muted-foreground))]">E-Mail</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  required
                  className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-[hsl(var(--muted-foreground))]">Passwort</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  required
                  minLength={6}
                  className="border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:ring-[hsl(var(--primary))]"
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-[hsl(var(--muted-foreground))] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newsletterOptIn}
                  onChange={(e) => setNewsletterOptIn(e.target.checked)}
                  className="mt-0.5 accent-[hsl(var(--primary))]"
                />
                <span>Ich möchte den Newsletter mit Studio-News, neuen Kursen und Aktionen erhalten. Abmeldung jederzeit möglich.</span>
              </label>
              <PrivacyConsent checked={privacyAccepted} onChange={setPrivacyAccepted} id="signup-privacy" />
              <Button type="submit" className="w-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--sand-dark))]" disabled={loading || !privacyAccepted}>
                {loading ? "Wird registriert…" : "Konto erstellen"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
