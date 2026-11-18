import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlayCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Lesson = {
  id: string; title: string; description: string | null;
  duration_seconds: number | null; sort_order: number; is_free_preview: boolean;
};

export default function VideoCoursePlayer() {
  const { slug } = useParams<{ slug: string }>();
  const [courseTitle, setCourseTitle] = useState("");
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [embedUrl, setEmbedUrl] = useState("");
  const [loadingEmbed, setLoadingEmbed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("video_courses" as any).select("id, title").eq("slug", slug).maybeSingle();
      if (!c) return;
      setCourseTitle((c as any).title);
      const { data: ls } = await supabase
        .from("video_lessons_public" as any)
        .select("*")
        .eq("course_id", (c as any).id)
        .order("sort_order");
      const arr = ((ls as any) ?? []) as Lesson[];
      setLessons(arr);
      if (arr[0]) selectLesson(arr[0]);
    })();
  }, [slug]);

  const selectLesson = async (l: Lesson) => {
    setCurrentLesson(l);
    setEmbedUrl("");
    setLoadingEmbed(true);
    const { data, error } = await supabase.functions.invoke("course-video-token", {
      body: { lesson_id: l.id },
    });
    setLoadingEmbed(false);
    if (error || (data as any)?.error) {
      toast.error((error?.message) || (data as any)?.error || "Kein Zugriff");
      return;
    }
    setEmbedUrl((data as any).embed_url);
  };

  return (
    <div className="container py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/meine-online-kurse">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Meine Kurse</Button>
        </Link>
        <h1 className="font-display text-2xl">{courseTitle}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-3">
          <Card className="overflow-hidden">
            <div
              className="relative aspect-video bg-black"
              onContextMenu={(e) => e.preventDefault()}
            >
              {loadingEmbed && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {embedUrl && !loadingEmbed && (
                <iframe
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full"
                  frameBorder={0}
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                />
              )}
              {/* transparent overlay to discourage right-click on iframe area edges */}
              <div className="absolute inset-x-0 top-0 h-8 pointer-events-none" />
            </div>
          </Card>
          {currentLesson && (
            <div>
              <h2 className="font-display text-xl">{currentLesson.title}</h2>
              {currentLesson.description && (
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{currentLesson.description}</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">Lektionen</h3>
          {lessons.map((l, i) => {
            const active = currentLesson?.id === l.id;
            return (
              <button
                key={l.id}
                onClick={() => selectLesson(l)}
                className={`w-full text-left rounded-md border p-3 flex items-center gap-3 hover:bg-muted transition-colors ${active ? "border-primary bg-muted" : ""}`}
              >
                <PlayCircle className={`h-5 w-5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{i + 1}. {l.title}</div>
                  {l.duration_seconds && (
                    <div className="text-xs text-muted-foreground">
                      {Math.floor(l.duration_seconds / 60)}:{String(l.duration_seconds % 60).padStart(2, "0")} min
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
