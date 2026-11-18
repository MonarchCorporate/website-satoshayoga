import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, startOfWeek, addDays, isBefore, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import CourseDetailDialog, { type CourseDetail } from "@/components/CourseDetailDialog";

type Course = Tables<"courses"> & {
  course_types?: { name: string; color: string | null; image_url?: string | null } | null;
  trainers?: { first_name: string; last_name: string } | null;
  participants_count?: number;
};

export default function Schedule() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const weekEnd = addDays(weekStart, 6);

  useEffect(() => {
    const fetchCourses = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("courses")
        .select("*, course_types(name, color, image_url), trainers(first_name, last_name)")
        .eq("is_cancelled", false)
        .gte("start_time", weekStart.toISOString())
        .lte("start_time", addDays(weekEnd, 1).toISOString())
        .order("start_time", { ascending: true });
      const list = (data as Course[]) ?? [];
      if (list.length) {
        const { data: countRows } = await supabase.rpc("get_course_participant_counts", {
          _course_ids: list.map((c) => c.id),
        });
        const countMap = new Map<string, number>(
          (countRows ?? []).map((r: any) => [r.course_id, r.participants_count ?? 0])
        );
        list.forEach((c) => (c.participants_count = countMap.get(c.id) ?? 0));
      }
      setCourses(list);
      setLoading(false);
    };
    fetchCourses();
  }, [weekStart]);

  const addToCart = async (courseId: string) => {
    if (!user) {
      toast.error("Bitte melde dich zuerst an.");
      return;
    }
    const { error } = await supabase.from("cart_items").insert({ user_id: user.id, course_id: courseId });
    if (error) {
      if (error.code === "23505") toast.info("Bereits im Warenkorb.");
      else toast.error("Fehler beim Hinzufügen.");
    } else {
      toast.success("Zum Warenkorb hinzugefügt!");
    }
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="container py-8">
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl font-semibold mb-2">Kursplan</h1>
        <p className="text-muted-foreground">Wähle deine Yoga-Stunden für die Woche</p>
      </div>

      <div className="flex items-center justify-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium min-w-[200px] text-center">
          {format(weekStart, "d. MMM", { locale: de })} – {format(weekEnd, "d. MMM yyyy", { locale: de })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-12">Lade Kursplan…</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-7">
          {days.map((day) => {
            const dayCourses = courses.filter(
              (c) => format(parseISO(c.start_time), "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
            );
            const isPast = isBefore(day, new Date()) && format(day, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");

            return (
              <div key={day.toISOString()} className={`space-y-3 ${isPast ? "opacity-50" : ""}`}>
                <h3 className="font-display text-lg font-semibold text-center border-b pb-2">
                  {format(day, "EEE", { locale: de })}
                  <br />
                  <span className="text-sm font-body text-muted-foreground">{format(day, "d. MMM", { locale: de })}</span>
                </h3>
                {dayCourses.length === 0 ? (
                  <p className="text-center text-xs text-muted-foreground py-4">Keine Kurse</p>
                ) : (
                  dayCourses.map((course) => {
                    const startTime = parseISO(course.start_time);
                    const endTime = parseISO(course.end_time);
                    const cleanTitle =
                      course.title.replace(/^\d{1,2}(:\d{2})?\s*Uhr\s*/i, "").trim() || course.title;
                    const typeName = course.course_types?.name ?? null;
                    const showBadge =
                      !!typeName && !cleanTitle.toLowerCase().includes(typeName.toLowerCase());
                    const free = course.max_participants - (course.participants_count ?? 0);
                    const full = free <= 0;
                    const opensAt =
                      course.booking_opens_immediately === false && course.booking_opens_at
                        ? parseISO(course.booking_opens_at)
                        : null;
                    const notYetOpen = !!(opensAt && opensAt > new Date());
                    return (
                      <Card
                        key={course.id}
                        className="animate-fade-in cursor-pointer transition-colors hover:border-primary"
                        onClick={() => {
                          setSelectedCourse(course);
                          setDialogOpen(true);
                        }}
                      >
                        <CardHeader className="p-3 pb-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold tracking-wide text-primary shrink-0">
                              {format(startTime, "HH:mm")} – {format(endTime, "HH:mm")}
                            </span>
                            {showBadge && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] shrink-0 max-w-[55%] truncate"
                              >
                                {typeName}
                              </Badge>
                            )}
                          </div>
                          <CardTitle
                            className="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]"
                            title={course.title}
                          >
                            {cleanTitle}
                          </CardTitle>
                          {course.trainers && (
                            <p className="text-xs text-muted-foreground truncate" title={`${course.trainers.first_name} ${course.trainers.last_name}`}>
                              {course.trainers.first_name} {course.trainers.last_name}
                            </p>
                          )}
                        </CardHeader>
                        <CardContent className="p-3 pt-0 space-y-2">
                          <p className="text-sm font-semibold text-foreground">
                            {Number(course.price).toFixed(2)} €
                          </p>
                          <p className={`text-xs ${full ? "text-destructive" : "text-muted-foreground"}`}>
                            {course.direct_trainer_booking ? "" : full ? "Ausgebucht" : `${free} von ${course.max_participants} Plätzen frei`}
                          </p>
                          {notYetOpen && opensAt && (
                            <p className="text-xs text-muted-foreground">
                              Buchbar ab {format(opensAt, "d. MMM yyyy, HH:mm", { locale: de })}
                            </p>
                          )}
                          {!isPast && course.direct_trainer_booking && (
                            <p className="text-xs text-primary">Termin direkt bei Trainer:in vereinbaren</p>
                          )}
                          {!isPast && !course.direct_trainer_booking && (
                            <Button
                              size="sm"
                              className="w-full text-xs h-7"
                              disabled={full || notYetOpen}
                              onClick={(e) => {
                                e.stopPropagation();
                                addToCart(course.id);
                              }}
                            >
                              <ShoppingCart className="h-3 w-3 mr-1" />
                              {notYetOpen ? "Noch nicht buchbar" : "Buchen"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      )}

      <CourseDetailDialog
        course={selectedCourse as CourseDetail | null}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onBook={addToCart}
      />
    </div>
  );
}
