import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Pencil, ChevronUp, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Lesson = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  provider: "vimeo" | "youtube";
  video_id: string;
  duration_seconds: number | null;
  sort_order: number;
  is_free_preview: boolean;
};

export default function AdminVideoCourseLessons() {
  const { id: courseId } = useParams<{ id: string }>();
  const [courseTitle, setCourseTitle] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [editing, setEditing] = useState<Partial<Lesson> | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    const [{ data: course }, { data: ls }] = await Promise.all([
      supabase.from("video_courses" as any).select("title").eq("id", courseId).maybeSingle(),
      supabase.from("video_lessons" as any).select("*").eq("course_id", courseId).order("sort_order"),
    ]);
    setCourseTitle((course as any)?.title ?? "");
    setLessons(((ls as any) ?? []) as Lesson[]);
  };

  useEffect(() => { fetchData(); }, [courseId]);

  const save = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) return toast.error("Titel fehlt");
    if (!editing.video_id?.trim()) return toast.error("Video-ID fehlt");
    setSaving(true);
    const payload: any = {
      course_id: courseId,
      title: editing.title.trim(),
      description: editing.description || null,
      provider: editing.provider ?? "vimeo",
      video_id: editing.video_id.trim(),
      duration_seconds: editing.duration_seconds ? Number(editing.duration_seconds) : null,
      sort_order: editing.id ? editing.sort_order : lessons.length,
      is_free_preview: !!editing.is_free_preview,
    };
    const res = editing.id
      ? await supabase.from("video_lessons" as any).update(payload).eq("id", editing.id)
      : await supabase.from("video_lessons" as any).insert(payload);
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success("Gespeichert");
    setEditing(null);
    fetchData();
  };

  const move = async (l: Lesson, dir: -1 | 1) => {
    const idx = lessons.findIndex((x) => x.id === l.id);
    const other = lessons[idx + dir];
    if (!other) return;
    await supabase.from("video_lessons" as any).update({ sort_order: other.sort_order }).eq("id", l.id);
    await supabase.from("video_lessons" as any).update({ sort_order: l.sort_order }).eq("id", other.id);
    fetchData();
  };

  const del = async (l: Lesson) => {
    if (!confirm(`Lektion „${l.title}" löschen?`)) return;
    await supabase.from("video_lessons" as any).delete().eq("id", l.id);
    fetchData();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link to={`/admin/video-courses/${courseId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Zurück</Button>
          </Link>
          <h1 className="font-display text-2xl font-semibold">Lektionen: {courseTitle}</h1>
        </div>
        <Button onClick={() => setEditing({ provider: "vimeo", is_free_preview: false })}>
          <Plus className="h-4 w-4 mr-2" />Lektion hinzufügen
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schutz-Hinweis</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Vimeo (empfohlen):</strong> Stelle das Video in deinem Vimeo-Account auf „Privat" und beschränke die
            Wiedergabe auf deine Domain (Privacy → „Where can this be embedded?"). So kann das Video nicht auf anderen Seiten abgespielt werden.
          </p>
          <p>
            <strong>YouTube:</strong> Stelle das Video auf „nicht gelistet". Der Schutz ist hier schwächer — wer die URL kennt, kann das Video sehen.
            100 %iger Download-Schutz ist im Web technisch nicht möglich (Bildschirmaufnahme bleibt immer möglich).
          </p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {lessons.length === 0 && (
          <Card><CardContent className="p-6 text-muted-foreground">Noch keine Lektionen.</CardContent></Card>
        )}
        {lessons.map((l, i) => (
          <Card key={l.id}>
            <CardContent className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex flex-col">
                <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(l, -1)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={i === lessons.length - 1} onClick={() => move(l, 1)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium flex items-center gap-2">
                  {i + 1}. {l.title}
                  {l.is_free_preview && <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">Vorschau</span>}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {l.provider === "vimeo" ? "Vimeo" : "YouTube"} · ID: {l.video_id}
                  <a
                    href={l.provider === "vimeo"
                      ? `https://vimeo.com/${l.video_id}`
                      : `https://youtu.be/${l.video_id}`}
                    target="_blank" rel="noreferrer"
                    className="hover:text-foreground"
                  ><ExternalLink className="h-3 w-3" /></a>
                  {l.duration_seconds ? ` · ${Math.floor(l.duration_seconds / 60)}:${String(l.duration_seconds % 60).padStart(2, "0")} min` : ""}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(l)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(l)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Lektion bearbeiten" : "Neue Lektion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Titel *</Label>
              <Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing!, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Beschreibung</Label>
              <Textarea rows={2} value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing!, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Anbieter</Label>
                <Select value={editing?.provider ?? "vimeo"} onValueChange={(v: any) => setEditing({ ...editing!, provider: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vimeo">Vimeo</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dauer (Sekunden)</Label>
                <Input type="number" min="0" value={editing?.duration_seconds ?? ""} onChange={(e) => setEditing({ ...editing!, duration_seconds: e.target.value ? Number(e.target.value) : null })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Video-ID *</Label>
              <Input
                value={editing?.video_id ?? ""}
                onChange={(e) => setEditing({ ...editing!, video_id: e.target.value })}
                placeholder={editing?.provider === "youtube" ? "z. B. dQw4w9WgXcQ" : "z. B. 76979871"}
              />
              <p className="text-xs text-muted-foreground">
                {editing?.provider === "youtube"
                  ? "Aus der URL: youtube.com/watch?v=DIESER_TEIL"
                  : "Aus der URL: vimeo.com/DIESER_TEIL"}
              </p>
            </div>
            <label className="flex items-center justify-between rounded-md border p-3 cursor-pointer">
              <div>
                <div className="font-medium text-sm">Kostenlose Vorschau</div>
                <div className="text-xs text-muted-foreground">Auch ohne Kauf abspielbar (als Trailer).</div>
              </div>
              <Switch checked={!!editing?.is_free_preview} onCheckedChange={(c) => setEditing({ ...editing!, is_free_preview: c })} />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Speichern…" : "Speichern"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
