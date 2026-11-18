import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Upload, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { HexColorPicker } from "react-colorful";

interface CourseType {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  image_url: string | null;
  created_at: string;
}

const COLOR_PRESETS = [
  "#C8A97E", "#8B5E3C", "#A3B18A", "#588157", "#3A5A40",
  "#BC6C25", "#DDA15E", "#606C38", "#283618", "#6B705C",
  "#B7B7A4", "#A5A58D", "#CB997E", "#DDBEA9", "#FFE8D6",
];

export default function AdminCourseTypes() {
  const [types, setTypes] = useState<CourseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourseType | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#C8A97E");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    const { data } = await supabase.from("course_types").select("*").order("name");
    setTypes((data ?? []) as CourseType[]);
    setLoading(false);
  };

  useEffect(() => { fetchTypes(); }, []);

  const resetForm = () => {
    setName(""); setDescription(""); setColor("#C8A97E");
    setImageUrl(null); setEditing(null);
  };

  const openEdit = (ct: CourseType) => {
    setEditing(ct);
    setName(ct.name);
    setDescription(ct.description ?? "");
    setColor(ct.color ?? "#C8A97E");
    setImageUrl(ct.image_url ?? null);
    setDialogOpen(true);
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `types/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("course-images").upload(path, file, { upsert: false });
    if (error) { toast.error("Upload fehlgeschlagen: " + error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("course-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, description: description || null, color, image_url: imageUrl };

    if (editing) {
      const { error } = await supabase.from("course_types").update(payload).eq("id", editing.id);
      if (error) { toast.error("Fehler: " + error.message); return; }
      toast.success("Kursart aktualisiert!");
    } else {
      const { error } = await supabase.from("course_types").insert(payload);
      if (error) { toast.error("Fehler: " + error.message); return; }
      toast.success("Kursart erstellt!");
    }
    setDialogOpen(false);
    resetForm();
    fetchTypes();
  };

  const deleteType = async (id: string) => {
    if (!confirm("Kursart wirklich löschen?")) return;
    const { error } = await supabase.from("course_types").delete().eq("id", id);
    if (error) { toast.error("Fehler: " + error.message); return; }
    toast.success("Kursart gelöscht.");
    fetchTypes();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="font-display text-3xl font-semibold">Kursarten</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Kursart erstellen</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Kursart bearbeiten" : "Neue Kursart"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="z.B. Hatha Yoga" />
              </div>
              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>Standard-Bild</Label>
                <p className="text-xs text-muted-foreground">
                  Wird für alle Kurse dieser Art verwendet – kann pro Kurs individuell überschrieben werden.
                </p>
                <div className="flex items-start gap-3">
                  <label className="relative w-28 h-28 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 overflow-hidden bg-secondary/30 shrink-0">
                    {imageUrl ? (
                      <>
                        <img src={imageUrl} alt="Kursart-Bild" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setImageUrl(null); }}
                          className="absolute top-1 right-1 bg-background/80 hover:bg-background rounded-full p-1"
                          aria-label="Bild entfernen"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">
                          {uploading ? "Lädt…" : "Bild hochladen"}
                        </span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleImageUpload(f);
                      }}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground pt-2">
                    Empfohlen: 800×600px oder größer, JPG/PNG.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Farbe</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 h-10 px-2 rounded-md border border-input bg-background hover:bg-accent/40 transition"
                      >
                        <span
                          className="w-7 h-7 rounded-md border border-border shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-mono uppercase text-muted-foreground">
                          {color}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-3 space-y-3"
                      align="start"
                      onOpenAutoFocus={(e) => e.preventDefault()}
                    >
                      <HexColorPicker color={color} onChange={setColor} />
                      <Input
                        value={color}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setColor(v);
                        }}
                        className="h-8 font-mono text-xs uppercase"
                        maxLength={7}
                      />
                    </PopoverContent>
                  </Popover>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${color.toLowerCase() === c.toLowerCase() ? "border-foreground scale-110" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={uploading}>
                {editing ? "Speichern" : "Erstellen"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground">Laden…</p>
      ) : types.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Noch keine Kursarten angelegt.</p>
      ) : (
        <div className="space-y-3">
          {types.map((ct) => (
            <Card key={ct.id} className="animate-fade-in">
              <CardContent className="flex items-center justify-between p-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-14 rounded-lg border overflow-hidden bg-secondary shrink-0 flex items-center justify-center">
                    {ct.image_url ? (
                      <img src={ct.image_url} alt={ct.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="w-4 h-4 rounded-full border shrink-0" style={{ backgroundColor: ct.color ?? "#C8A97E" }} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{ct.name}</p>
                    {ct.description && <p className="text-sm text-muted-foreground line-clamp-1">{ct.description}</p>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openEdit(ct)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => deleteType(ct.id)}>
                    <Trash2 className="h-4 w-4" />
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
