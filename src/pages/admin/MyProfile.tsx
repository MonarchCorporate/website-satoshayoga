import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export default function MyProfile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trainer, setTrainer] = useState<any>(null);
  const [f, setF] = useState<any>({});

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("trainers").select("*").eq("user_id", user.id).maybeSingle();
      if (data) {
        setTrainer(data);
        setF({
          first_name: data.first_name ?? "", last_name: data.last_name ?? "",
          email: data.email ?? user.email ?? "", phone: data.phone ?? "", bio: data.bio ?? "",
          street: data.street ?? "", postal_code: data.postal_code ?? "", city: data.city ?? "",
          country: data.country ?? "Deutschland",
          tax_id: data.tax_id ?? "", tax_number: data.tax_number ?? "",
          iban: data.iban ?? "", bic: data.bic ?? "", bank_name: data.bank_name ?? "",
          is_small_business: data.is_small_business ?? true,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const upd = (k: string) => (e: any) => setF((p: any) => ({ ...p, [k]: e.target ? e.target.value : e }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainer) return;
    const { error } = await supabase.from("trainers").update(f).eq("id", trainer.id);
    if (error) toast.error("Fehler: " + error.message);
    else toast.success("Profil gespeichert.");
  };

  if (loading) return <div className="p-6">Laden…</div>;
  if (!trainer) return (
    <div className="p-6 max-w-2xl">
      <Card><CardHeader><CardTitle>Kein Trainerprofil verknüpft</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">
          Bitte wende dich an einen Admin, damit dein Profil verknüpft wird.
        </p></CardContent>
      </Card>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Mein Profil</h1>
        <Link to="/admin/welcome" className="text-sm text-primary hover:underline">Erste Schritte erneut ansehen →</Link>
        <p className="text-sm text-muted-foreground">Diese Daten erscheinen auf deinen Honorarrechnungen.</p>
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card><CardHeader><CardTitle className="text-base">Persönliche Daten</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Vorname</Label><Input value={f.first_name} onChange={upd("first_name")} required /></div>
              <div><Label>Nachname</Label><Input value={f.last_name} onChange={upd("last_name")} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>E-Mail</Label><Input type="email" value={f.email} onChange={upd("email")} /></div>
              <div><Label>Telefon</Label><Input value={f.phone} onChange={upd("phone")} /></div>
            </div>
            <div><Label>Bio</Label><Textarea value={f.bio} onChange={upd("bio")} rows={3} /></div>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base">Rechnungsadresse</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Straße & Hausnr.</Label><Input value={f.street} onChange={upd("street")} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>PLZ</Label><Input value={f.postal_code} onChange={upd("postal_code")} /></div>
              <div className="col-span-2"><Label>Ort</Label><Input value={f.city} onChange={upd("city")} /></div>
            </div>
            <div><Label>Land</Label><Input value={f.country} onChange={upd("country")} /></div>
          </CardContent>
        </Card>

        <Card><CardHeader><CardTitle className="text-base">Steuer & Bank</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={f.is_small_business} onCheckedChange={(v) => setF((p: any) => ({ ...p, is_small_business: !!v }))} />
              <span>Kleinunternehmer gemäß §19 UStG (keine USt ausweisen)</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>USt-IdNr.</Label><Input value={f.tax_id} onChange={upd("tax_id")} /></div>
              <div><Label>Steuernummer</Label><Input value={f.tax_number} onChange={upd("tax_number")} /></div>
            </div>
            <div><Label>Bank</Label><Input value={f.bank_name} onChange={upd("bank_name")} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>IBAN</Label><Input value={f.iban} onChange={upd("iban")} /></div>
              <div><Label>BIC</Label><Input value={f.bic} onChange={upd("bic")} /></div>
            </div>
          </CardContent>
        </Card>

        <Button type="submit">Speichern</Button>
      </form>
    </div>
  );
}
