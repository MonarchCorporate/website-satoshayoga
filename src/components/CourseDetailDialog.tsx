import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { MapPin, User as UserIcon, ShoppingCart } from "lucide-react";
import WaitlistButton from "@/components/WaitlistButton";

export type CourseDetail = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  price: number;
  max_participants: number;
  description: string | null;
  image_url: string | null;
  location: string | null;
  booking_opens_immediately?: boolean | null;
  booking_opens_at?: string | null;
  direct_trainer_booking?: boolean | null;
  course_types?: { name?: string; color?: string | null; image_url?: string | null } | null;
  trainers?: { first_name: string; last_name: string } | null;
  participants_count?: number;
};

interface Props {
  course: CourseDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBook: (courseId: string) => void;
}

export default function CourseDetailDialog({ course, open, onOpenChange, onBook }: Props) {
  const [showMore, setShowMore] = useState(false);

  if (!course) return null;

  const start = parseISO(course.start_time);
  const end = parseISO(course.end_time);
  const free = course.max_participants - (course.participants_count ?? 0);
  const full = free <= 0;
  const isPast = start < new Date();
  const opensAt =
    course.booking_opens_immediately === false && course.booking_opens_at
      ? parseISO(course.booking_opens_at)
      : null;
  const notYetOpen = !!(opensAt && opensAt > new Date());

  const description = course.description ?? "";
  const isLong = description.length > 180;
  const shortDesc = isLong ? description.slice(0, 180) + "…" : description;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[calc(100dvh-1rem)] bg-card border-border/40 p-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y">
          {/* Image */}
          <div className="relative w-full h-64 bg-secondary">
            <img
              src={
                course.image_url ??
                course.course_types?.image_url ??
                "https://images.unsplash.com/photo-1545389336-cf090694435e?auto=format&fit=crop&w=1200&q=80"
              }
              alt={course.title}
              className="w-full h-full object-cover"
            />
          </div>

          <div className="p-6 space-y-4">
            <DialogHeader className="text-left space-y-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex gap-4 items-start">
                  <div className="text-center shrink-0">
                    <div className="font-display text-3xl text-foreground leading-none">
                      {format(start, "d")}
                    </div>
                    <div className="text-xs uppercase tracking-widest text-primary mt-1">
                      {format(start, "MMM", { locale: de })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(start, "HH:mm")}
                    </div>
                  </div>
                  <div>
                    <DialogTitle className="font-display text-2xl text-foreground">
                      {course.title}
                    </DialogTitle>
                    {course.location && (
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {course.location}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <Badge
                        variant="outline"
                        className={full ? "border-destructive text-destructive" : "border-primary/50 text-primary"}
                      >
                        {full ? "Ausgebucht" : "Offen"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {full ? "Keine Plätze frei" : `${free} Plätze frei`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-display text-3xl text-primary">
                    €{Number(course.price).toFixed(2)}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="border-b-2 border-primary/40 pb-2">
              <p className="font-display text-lg text-primary">Veranstaltungs-Informationen</p>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Zeitplan</p>
                <p className="text-foreground">
                  {format(start, "EEEE, d. MMMM yyyy · HH:mm", { locale: de })} – {format(end, "HH:mm")}
                </p>
              </div>

              {course.trainers && (
                <div>
                  <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Trainer:in</p>
                  <p className="text-foreground flex items-center gap-2">
                    <UserIcon className="h-3 w-3" />
                    {course.trainers.first_name} {course.trainers.last_name}
                  </p>
                </div>
              )}

              {description && (
                <div>
                  <p className="text-muted-foreground uppercase tracking-widest text-xs mb-1">Beschreibung</p>
                  <p className="text-foreground whitespace-pre-line">
                    {showMore ? description : shortDesc}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => setShowMore(!showMore)}
                      className="text-primary hover:underline text-xs mt-1"
                    >
                      {showMore ? "Weniger anzeigen" : "Mehr anzeigen"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/40 p-4 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          {!isPast && course.direct_trainer_booking && (
            <p className="text-sm text-primary self-center">
              Termin direkt bei {course.trainers ? `${course.trainers.first_name} ${course.trainers.last_name}` : "der Trainerin / dem Trainer"} vereinbaren
            </p>
          )}
          {!isPast && !course.direct_trainer_booking && full && <WaitlistButton courseId={course.id} />}
          {!isPast && !course.direct_trainer_booking && !full && (
            <Button
              disabled={full || notYetOpen}
              onClick={() => {
                onBook(course.id);
                onOpenChange(false);
              }}
            >
              <ShoppingCart className="h-4 w-4 mr-1" />
              {full
                ? "Ausgebucht"
                : notYetOpen && opensAt
                ? `Buchbar ab ${format(opensAt, "d. MMM HH:mm", { locale: de })}`
                : "Veranstaltung buchen"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
