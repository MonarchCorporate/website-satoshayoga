import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, UserCheck, UserX, Mail, KeyRound, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface Trainer {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  bio: string | null;
  is_active: boolean;
  created_at: string;
  invited_at?: string | null;
  onboarded_at?: string | null;
}

const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "";

export default function AdminTrainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [createLogin, setCreateLogin] = useState(false);
  const [lastLogin, setLastLogin] = useState<Record<string, string | null>>({});
  const [inviting, setInviting] = useState<string | null>(null);

  const fetchTrainers = async () => {
    setLoading(true);
    const { data } = await supabase.from("trainers").select("*").order("last_name");
    setTrainers((data as any) ?? []);
    const { data: ls } = await supabase.rpc("trainer_login_status" as any);
    const map: Record<string, string | null> = {};
    ((ls as any[]) ?? []).forEach((r) => { map[r.trainer_id] = r.last_sign_in_at; });
    setLastLogin(map);
    setLoading(false);
  };

  useEffect(() => { fetchTrainers(); }, []);

  const resetForm = () => {
    setFirstName(""); setLastName(""); setEmail(""); setPhone(""); setBio("");
    setCreateLogin(false); setEditingTrainer(null);
  };

  const openEdit = (trainer: Trainer) => {
    setEditingTrainer(trainer);
    setFirstName(trainer.first_name);
    setLastName(trainer.last_name);
    setEmail(trainer.email ?? "");
    setPhone(trainer.phone ?? "");
    setBio(trainer.bio ?? "");
    setCreateLogin(false);
    setDialogOpen(true);
  };

  const inviteForLogin = async (trainer: Trainer) => {
    if (!trainer.email) {
      toast.error(`Für ${trainer.first_name} ist noch keine E-Mail-Adresse hinterlegt. Bitte zuerst eintragen.`);
      openEdit(trainer);
      return;
    }
    setInviting(trainer.id);
    const { data, error } = await supabase.functions.invoke("invite-trainer", {
      body: { trainer_id: trainer.id, email: trainer.email },
    });
    setInviting(null);
    const msg = (data as any)?.error;
    if (error || msg) toast.error(msg || "Die Einladung konnte nicht verschickt werden. Bitte versuche es gleich noch einmal.");
    else toast.success(`Einladung an ${trainer.email} verschickt. ${trainer.first_name} bekommt jetzt eine E-Mail zum Einrichten des Zugangs.`);
    fetchTrainers();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      first_name: firstName, last_name: lastName,
      email: email || null, phone: phone || null, bio: bio || null,
    };

    let trainerId = editingTrainer?.id;
    if (editingTrainer) {
      const { error } = await supabase.from("trainers").update(payload).eq("id", editingTrainer.id);
      if (error) { toast.error("Fehler: " + error.message); return; }
      toast.success("Trainer aktualisiert!");
    } else {
      const { data, error } = await supabase.from("trainers").insert(payload).select("id").single();
      if (error) { toast.error("Fehler: " + error.message); return; }
      trainerId = data.id;
      toast.success("Trainer erstellt!");
    }

    if (createLogin && trainerId && email) {
      const { error: invErr } = await supabase.functions.invoke("invite-trainer", {
        body: { trainer_id: trainerId, email },
      });
      if (invErr) toast.error("Einladung fehlgeschlagen: " + invErr.message);
      else toast.success("Login-Einladung versendet.");
    }

    setDialogOpen(false);
    resetForm();
    fetchTrainers();
  };

  const toggleActive = async (trainer: Trainer) => {
    const { error } = await supabase.from("trainers").update({ is_active: !trainer.is_active }).eq("id", trainer.id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success(trainer.is_active ? "Trainer deaktiviert." : "Trainer aktiviert.");
    fetchTrainers();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl text-foreground">Trainer</h1>
          <p className="text-sm text-muted-foreground">Verwalte Trainerprofile und vergib Login-Zugänge.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Trainer anlegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTrainer ? "Trainer bearbeiten" : "Neuen Trainer anlegen"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vorname</Label>
                  <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Nachname</Label>
                  <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio / Beschreibung</Label>
                <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
              </div>
              {editingTrainer && (
                <p className="text-xs text-muted-foreground">
                  Adresse, Steuer- und Bankdaten kann der Trainer in „Mein Profil" ergänzen — sie sind für Honorarrechnungen erforderlich.
                </p>
              )}
              {!editingTrainer && (
                <label className="flex items-center gap-2 text-sm border border-border rounded-md p-3 bg-secondary/30">
                  <input type="checkbox" checked={createLogin} onChange={e => setCreateLogin(e.target.checked)} />
                  <span>Login-Zugang erstellen und Einladung an die E-Mail senden</span>
                </label>
              )}
              <Button type="submit" className="w-full">{editingTrainer ? "Speichern" : "Anlegen"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">Laden…</p>
      ) : trainers.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Noch keine Trainer angelegt.</p>
      ) : (
        <div className="space-y-3">
          {trainers.map((trainer) => (
            <Card key={trainer.id} className={!trainer.is_active ? "opacity-60" : ""}>
              <CardContent className="flex items-center justify-between p-4 flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{trainer.first_name} {trainer.last_name}</p>
                    <Badge variant={trainer.is_active ? "default" : "secondary"} className="text-xs">
                      {trainer.is_active ? "Aktiv" : "Inaktiv"}
                    </Badge>
                    {trainer.onboarded_at || lastLogin[trainer.id] ? (
                      <Badge variant="outline" className="text-xs border-primary/50 text-primary">
                        <KeyRound className="h-3 w-3 mr-1" />Zugang aktiv{lastLogin[trainer.id] ? ` · zuletzt angemeldet ${fmt(lastLogin[trainer.id])}` : ""}
                      </Badge>
                    ) : trainer.invited_at ? (
                      <Badge variant="outline" className="text-xs">
                        <Mail className="h-3 w-3 mr-1" />Eingeladen am {fmt(trainer.invited_at)} · wartet auf Einrichtung
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Nicht eingeladen</Badge>
                    )}
                  </div>
                  {trainer.email && <p className="text-sm text-muted-foreground">{trainer.email}</p>}
                  {trainer.bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{trainer.bio}</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {!(trainer.onboarded_at || lastLogin[trainer.id]) && (
                    <Button variant="outline" size="sm" disabled={inviting === trainer.id} onClick={() => inviteForLogin(trainer)}>
                      <Mail className="h-4 w-4 mr-1" />
                      {inviting === trainer.id ? "Wird gesendet…" : trainer.invited_at || trainer.user_id ? "Erneut einladen" : "Einladen"}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/admin/trainers/${trainer.id}/compensation`}><Wallet className="h-4 w-4 mr-1" />Vergütung</Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(trainer)}>Bearbeiten</Button>
                  <Button variant={trainer.is_active ? "destructive" : "default"} size="sm" onClick={() => toggleActive(trainer)}>
                    {trainer.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
