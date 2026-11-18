import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2, ArrowLeft } from "lucide-react";

export default function AdminTrainerCompensation() {
  const { id } = useParams();
  const [trainer, setTrainer] = useState<any>(null);
  const [courseTypes, setCourseTypes] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: t }, { data: ct }, { data: tr }] = await Promise.all([
      supabase.from("trainers").select("*").eq("id", id).maybeSingle(),
      supabase.from("course_types").select("*").order("name"),
      supabase.from("trainer_compensation_tiers").select("*").eq("trainer_id", id).order("min_participants"),
    ]);
    setTrainer(t);
    setCourseTypes(ct ?? []);
    setTiers(tr ?? []);
    setLoading(false);
  };

  useEffect(() => { if (id) load(); }, [id]);

  const addTier = async (courseTypeId: string) => {
    const { error } = await supabase.from("trainer_compensation_tiers").insert({
      trainer_id: id, course_type_id: courseTypeId,
      min_participants: 0, max_participants: 9, amount: 0,
    });
    if (error) toast.error(error.message); else load();
  };

  const updateTier = async (tierId: string, patch: any) => {
    const { error } = await supabase.from("trainer_compensation_tiers").update(patch).eq("id", tierId);
    if (error) toast.error(error.message);
  };

  const deleteTier = async (tierId: string) => {
    if (!confirm("Stufe löschen?")) return;
    const { error } = await supabase.from("trainer_compensation_tiers").delete().eq("id", tierId);
    if (error) toast.error(error.message); else load();
  };

  if (loading) return <div className="p-6">Laden…</div>;
  if (!trainer) return <div className="p-6">Trainer nicht gefunden.</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link to="/admin/trainers" className="text-sm text-muted-foreground inline-flex items-center mb-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Zurück zu Trainer
        </Link>
        <h1 className="font-display text-3xl">Vergütung: {trainer.first_name} {trainer.last_name}</h1>
        <p className="text-sm text-muted-foreground">
          Vergütungs-Stufen pro Kursart. Die passende Stufe wird anhand der Teilnehmerzahl bei Kursende ermittelt.
        </p>
      </div>

      {courseTypes.map((ct) => {
        const ctTiers = tiers.filter((t) => t.course_type_id === ct.id);
        return (
          <Card key={ct.id}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: ct.color }} />
                {ct.name}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={() => addTier(ct.id)}>
                <Plus className="h-4 w-4 mr-1" />Stufe
              </Button>
            </CardHeader>
            <CardContent>
              {ctTiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Stufen definiert. Diese Kursart wird mit 0 € vergütet.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                    <div className="col-span-3">Min. TN</div>
                    <div className="col-span-3">Max. TN</div>
                    <div className="col-span-4">Vergütung (€)</div>
                    <div className="col-span-2"></div>
                  </div>
                  {ctTiers.map((t) => (
                    <div key={t.id} className="grid grid-cols-12 gap-2 items-center">
                      <Input type="number" className="col-span-3" defaultValue={t.min_participants}
                        onBlur={(e) => updateTier(t.id, { min_participants: parseInt(e.target.value) || 0 })} />
                      <Input type="number" className="col-span-3" defaultValue={t.max_participants}
                        onBlur={(e) => updateTier(t.id, { max_participants: parseInt(e.target.value) || 0 })} />
                      <Input type="number" step="0.01" className="col-span-4" defaultValue={t.amount}
                        onBlur={(e) => updateTier(t.id, { amount: parseFloat(e.target.value) || 0 })} />
                      <Button size="icon" variant="ghost" className="col-span-2" onClick={() => deleteTier(t.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
