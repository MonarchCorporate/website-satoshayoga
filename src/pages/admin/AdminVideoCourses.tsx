import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Video, Pencil, Eye, EyeOff, Trash2, ListVideo } from "lucide-react";
import { toast } from "sonner";

type Course = {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  access_model: "one_time" | "subscription";
  price_once: number | null;
  price_monthly: number | null;
  price_yearly: number | null;
  cover_image_url: string | null;
  created_at: string;
};

export default function AdminVideoCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [counts, setCounts] = useState<Record<string, { lessons: number; access: number }>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("video_courses" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setCourses(((data as any) ?? []) as Course[]);

    const { data: lc } = await supabase.from("video_lessons" as any).select("course_id");
    const { data: ac } = await supabase
      .from("video_course_access" as any)
      .select("course_id, status")
      .in("status", ["active", "grace"]);
    const m: Record<string, { lessons: number; access: number }> = {};
    ((lc as any[]) ?? []).forEach((r) => {
      m[r.course_id] = m[r.course_id] || { lessons: 0, access: 0 };
      m[r.course_id].lessons++;
    });
    ((ac as any[]) ?? []).forEach((r) => {
      m[r.course_id] = m[r.course_id] || { lessons: 0, access: 0 };
      m[r.course_id].access++;
    });
    setCounts(m);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const togglePublish = async (c: Course) => {
    await supabase.from("video_courses" as any).update({ is_published: !c.is_published }).eq("id", c.id);
    fetchData();
  };

  const handleDelete = async (c: Course) => {
    if (!confirm(`Kurs „${c.title}" wirklich löschen? Alle Lektionen und Zugänge werden entfernt.`)) return;
    const { error } = await supabase.from("video_courses" as any).delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("Gelöscht"); fetchData(); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <Video className="h-7 w-7 text-primary" />
          Videokurse
        </h1>
        <Link to="/admin/video-courses/new">
          <Button><Plus className="h-4 w-4 mr-2" />Neuer Videokurs</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">Laden…</p>
          ) : courses.length === 0 ? (
            <p className="p-6 text-muted-foreground">Noch keine Videokurse.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Modell</TableHead>
                  <TableHead>Preis</TableHead>
                  <TableHead>Lektionen</TableHead>
                  <TableHead>Aktive Käufer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <Link to={`/admin/video-courses/${c.id}`} className="hover:underline">
                        {c.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">/{c.slug}</div>
                    </TableCell>
                    <TableCell>
                      {c.access_model === "one_time"
                        ? <Badge variant="outline">Einmalkauf</Badge>
                        : <Badge variant="outline">Abo</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.access_model === "one_time"
                        ? c.price_once ? `${Number(c.price_once).toFixed(2)} €` : "—"
                        : [
                            c.price_monthly ? `${Number(c.price_monthly).toFixed(2)} €/Mo` : null,
                            c.price_yearly ? `${Number(c.price_yearly).toFixed(2)} €/Jahr` : null,
                          ].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                    <TableCell>{counts[c.id]?.lessons ?? 0}</TableCell>
                    <TableCell>{counts[c.id]?.access ?? 0}</TableCell>
                    <TableCell>
                      {c.is_published
                        ? <Badge>Veröffentlicht</Badge>
                        : <Badge variant="outline">Entwurf</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => togglePublish(c)}>
                        {c.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Link to={`/admin/video-courses/${c.id}`}>
                        <Button size="sm" variant="outline" className="ml-1">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link to={`/admin/video-courses/${c.id}/lessons`}>
                        <Button size="sm" variant="outline" className="ml-1">
                          <ListVideo className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={() => handleDelete(c)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
