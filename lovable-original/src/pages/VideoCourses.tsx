import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video } from "lucide-react";

type Course = {
  id: string; title: string; slug: string; description: string | null;
  cover_image_url: string | null;
  access_model: "one_time" | "subscription";
  price_once: number | null; price_monthly: number | null; price_yearly: number | null;
};

export default function VideoCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("video_courses" as any)
        .select("*")
        .eq("is_published", true)
        .order("sort_order");
      setCourses(((data as any) ?? []) as Course[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-4xl font-semibold flex items-center gap-2">
          <Video className="h-8 w-8 text-primary" /> Online-Kurse
        </h1>
        <p className="text-muted-foreground">Yoga & Pilates für zuhause — wann und wo du willst.</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : courses.length === 0 ? (
        <p className="text-muted-foreground">Aktuell sind keine Online-Kurse verfügbar.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((c) => (
            <Link key={c.id} to={`/online-kurse/${c.slug}`}>
              <Card className="overflow-hidden hover:border-primary transition-colors h-full">
                {c.cover_image_url ? (
                  <img src={c.cover_image_url} alt={c.title} className="aspect-video w-full object-cover" />
                ) : (
                  <div className="aspect-video w-full bg-muted flex items-center justify-center">
                    <Video className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-xl">{c.title}</h3>
                    <Badge variant="outline">
                      {c.access_model === "one_time" ? "Einmalkauf" : "Abo"}
                    </Badge>
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">{c.description}</p>
                  )}
                  <div className="text-sm font-medium text-primary">
                    {c.access_model === "one_time"
                      ? c.price_once ? `${Number(c.price_once).toFixed(2)} € einmalig` : "—"
                      : [
                          c.price_monthly ? `ab ${Number(c.price_monthly).toFixed(2)} €/Monat` : null,
                          c.price_yearly ? `${Number(c.price_yearly).toFixed(2)} €/Jahr` : null,
                        ].filter(Boolean).join(" · ")}
                  </div>
                  <Button variant="outline" className="w-full mt-2">Mehr erfahren</Button>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
