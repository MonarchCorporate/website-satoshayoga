import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, Save, ListVideo, Upload } from "lucide-react";
import { toast } from "sonner";

const slugify = (s: string) =>
  s.toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function AdminVideoCourseEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<any>({
    title: "",
    slug: "",
    description: "",
    cover_image_url: "",
    is_published: false,
    access_model: "one_time",
    price_once: "",
    price_monthly: "",
    price_yearly: "",
    grace_days: 7,
  });

  useEffect(() => {
    if (isNew) return;
    (async () => {
      const { data } = await supabase.from("video_courses" as any).select("*").eq("id", id).maybeSingle();
      if (data) setForm(data);
      setLoading(false);
    })();
  }, [id, isNew]);

  const handleCover = async (file: File) => {
    setUploading(true);
    const path = `covers/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { error } = await supabase.storage.from("course-images").upload(path, file, { upsert: true });
    if (error) {
      toast.error("Upload fehlgeschlagen: " + error.message);
    } else {
      const { data } = supabase.storage.from("course-images").getPublicUrl(path);
      setForm({ ...form, cover_image_url: data.publicUrl });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!form.title?.trim()) return toast.error("Titel fehlt");
    const slug = form.slug?.trim() || slugify(form.title);
    if (form.access_model === "one_time" && !(Number(form.price_once) > 0)) {
      return toast.error("Einmalpreis fehlt");
    }
    if (form.access_model === "subscription" && !(Number(form.price_monthly) > 0) && !(Number(form.price_yearly) > 0)) {
      return toast.error("Mindestens ein Abopreis (monatlich oder jährlich) nötig");
    }
    setSaving(true);
    const payload: any = {
      title: form.title.trim(),
      slug,
      description: form.description || null,
      cover_image_url: form.cover_image_url || null,
      is_published: !!form.is_published,
      access_model: form.access_model,
      price_once: form.access_model === "one_time" ? Number(form.price_once) : null,
      price_monthly: form.access_model === "subscription" && form.price_monthly ? Number(form.price_monthly) : null,
      price_yearly: form.access_model === "subscription" && form.price_yearly ? Number(form.price_yearly) : null,
      grace_days: Number(form.grace_days) || 7,
    };
    let res;
    if (isNew) {
      res = await supabase.from("video_courses" as any).insert(payload).select().single();
    } else {
      res = await supabase.from("video_courses" as any).update(payload).eq("id", id).select().single();
    }
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Gespeichert");
    if (isNew) navigate(`/admin/video-courses/${(res.data as any).id}/lessons`);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Laden…</div>;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/admin/video-courses">
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Zurück</Button>
          </Link>
          <h1 className="font-display text-2xl font-semibold">
            {isNew ? "Neuer Videokurs" : "Videokurs bearbeiten"}
          </h1>
        </div>
        {!isNew && (
          <Link to={`/admin/video-courses/${id}/lessons`}>
            <Button variant="outline" size="sm"><ListVideo className="h-4 w-4 mr-2" />Lektionen</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Stammdaten</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Titel *</Label>
            <Input value={form.title} onChange={(e) => {
              const t = e.target.value;
              setForm({ ...form, title: t, slug: isNew && !form.slug ? slugify(t) : form.slug });
            }} />
          </div>
          <div className="space-y-2">
            <Label>URL-Slug</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label>Beschreibung</Label>
            <Textarea rows={5} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Cover-Bild</Label>
            <div className="flex items-center gap-3">
              {form.cover_image_url && (
                <img src={form.cover_image_url} alt="" className="h-20 w-32 object-cover rounded" />
              )}
              <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" />
                {uploading ? "Lädt hoch…" : "Bild hochladen"}
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleCover(e.target.files[0])} />
              </label>
              {form.cover_image_url && (
                <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, cover_image_url: "" })}>Entfernen</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Zugangsmodell & Preise</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={form.access_model} onValueChange={(v) => setForm({ ...form, access_model: v })}>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <RadioGroupItem value="one_time" id="m_once" />
              <div>
                <div className="font-medium">Einmalkauf — unbegrenzter Zugang</div>
                <div className="text-sm text-muted-foreground">Kunde zahlt einmal und behält den Zugang dauerhaft.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
              <RadioGroupItem value="subscription" id="m_sub" />
              <div>
                <div className="font-medium">Abo — monatlich und/oder jährlich</div>
                <div className="text-sm text-muted-foreground">Zugang läuft, solange das Abo bezahlt wird. Kündigung möglich.</div>
              </div>
            </label>
          </RadioGroup>

          {form.access_model === "one_time" ? (
            <div className="space-y-2">
              <Label>Preis (€) *</Label>
              <Input type="number" min="0" step="0.01" value={form.price_once ?? ""} onChange={(e) => setForm({ ...form, price_once: e.target.value })} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Monatlich (€)</Label>
                  <Input type="number" min="0" step="0.01" value={form.price_monthly ?? ""} onChange={(e) => setForm({ ...form, price_monthly: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Jährlich (€)</Label>
                  <Input type="number" min="0" step="0.01" value={form.price_yearly ?? ""} onChange={(e) => setForm({ ...form, price_yearly: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Kulanzfrist nach fehlgeschlagener Zahlung (Tage)</Label>
                <Input type="number" min="0" value={form.grace_days ?? 7} onChange={(e) => setForm({ ...form, grace_days: e.target.value })} />
                <p className="text-xs text-muted-foreground">Standard: 7 Tage. Bei fehlgeschlagener Zahlung behält der Kunde so viele Tage Zugang.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 flex items-center justify-between">
          <div>
            <div className="font-medium">Veröffentlicht</div>
            <div className="text-sm text-muted-foreground">Sichtbar im öffentlichen Katalog.</div>
          </div>
          <Switch checked={!!form.is_published} onCheckedChange={(c) => setForm({ ...form, is_published: c })} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Speichern…" : "Speichern"}
        </Button>
      </div>
    </div>
  );
}
