import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  addMonths,
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight, CalendarDays, List, Clock, MapPin, User, CalendarX, SlidersHorizontal } from "lucide-react";
import CourseBookingDialog from "./CourseBookingDialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";

type CourseRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  price: number;
  max_participants: number;
  description: string | null;
  image_url: string | null;
  location: string | null;
  instructor_id: string | null;
  course_type_id: string | null;
  booking_opens_immediately?: boolean | null;
  booking_opens_at?: string | null;
  class_cards_allowed?: boolean | null;
  direct_trainer_booking?: boolean | null;
  course_types?: { name: string; color: string | null; image_url?: string | null } | null;
  trainers?: { first_name: string; last_name: string } | null;
  participants_count?: number;
};

type CourseType = { id: string; name: string; color: string | null };

const DAY_LABELS = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];

export default function PublicCalendar() {
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()));
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CourseRow | null>(null);
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [courseTypes, setCourseTypes] = useState<CourseType[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const dayStripRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("course_types")
      .select("id, name, color")
      .order("name", { ascending: true })
      .then(({ data }) => setCourseTypes((data ?? []) as CourseType[]));
  }, []);

  const gridStart = useMemo(
    () => startOfWeek(monthStart, { weekStartsOn: 1 }),
    [monthStart]
  );
  const gridEnd = useMemo(
    () => endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 }),
    [monthStart]
  );

  const days = useMemo(() => {
    const arr: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      arr.push(d);
      d = addDays(d, 1);
    }
    return arr;
  }, [gridStart, gridEnd]);

  useEffect(() => {
    let cancelled = false;
    const fetchCourses = async () => {
      setLoading(true);
      const from = startOfMonth(monthStart).toISOString();
      const to = endOfMonth(monthStart).toISOString();
      const { data: rawCourses } = await supabase
        .from("courses")
        .select(
          "id, title, start_time, end_time, price, max_participants, description, image_url, location, instructor_id, course_type_id, booking_opens_immediately, booking_opens_at, class_cards_allowed, direct_trainer_booking, course_types(name, color, image_url)"
        )
        .eq("is_visible", true)
        .eq("is_cancelled", false)
        .gte("start_time", from)
        .lte("start_time", to)
        .order("start_time", { ascending: true });

      const list = (rawCourses ?? []) as any as CourseRow[];

      // load trainers
      const trainerIds = Array.from(
        new Set(list.map((c) => c.instructor_id).filter(Boolean) as string[])
      );
      let trainerMap = new Map<string, { first_name: string; last_name: string }>();
      if (trainerIds.length > 0) {
        const { data: trainers } = await supabase
          .from("public_trainers" as any)
          .select("id, first_name, last_name")
          .in("id", trainerIds);
        (trainers ?? []).forEach((t: any) =>
          trainerMap.set(t.id, { first_name: t.first_name, last_name: t.last_name })
        );
      }

      // load participant counts via SECURITY DEFINER function (RLS blocks anon/customer from counting bookings directly)
      const { data: countRows } = await supabase.rpc("get_course_participant_counts", {
        _course_ids: list.map((c) => c.id),
      });
      const countMap = new Map<string, number>(
        (countRows ?? []).map((r: any) => [r.course_id, r.participants_count ?? 0])
      );

      const enriched = list.map((c) => ({
        ...c,
        trainers: c.instructor_id ? trainerMap.get(c.instructor_id) : undefined,
        participants_count: countMap.get(c.id) ?? 0,
      }));

      if (!cancelled) {
        setCourses(enriched);
        setLoading(false);
      }
    };
    fetchCourses();
    return () => {
      cancelled = true;
    };
  }, [monthStart]);

  // Reset day filter and scroll strip when month changes
  useEffect(() => {
    setSelectedDay(null);
    // scroll to today or first day
    requestAnimationFrame(() => {
      const el = dayStripRef.current?.querySelector<HTMLElement>("[data-day-scroll='true']");
      if (el && dayStripRef.current) {
        dayStripRef.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
      }
    });
  }, [monthStart]);

  const today = new Date();
  const now = new Date();

  const notYetOpenLabel = (c: CourseRow): string | null => {
    if (c.direct_trainer_booking) return "Termin direkt bei Trainer:in";
    if (c.booking_opens_immediately === false && c.booking_opens_at) {
      const opens = parseISO(c.booking_opens_at);
      if (opens > now) return `Buchbar ab ${format(opens, "d. MMM HH:mm", { locale: de })}`;
    }
    return null;
  };


  const coursesForDay = (day: Date) =>
    courses
      .filter((c) => isSameDay(parseISO(c.start_time), day))
      .filter((c) => parseISO(c.start_time) >= now) // hide past
      .filter(
        (c) =>
          selectedTypes.size === 0 ||
          (c.course_type_id ? selectedTypes.has(c.course_type_id) : false)
      );

  const toggleType = (id: string) =>
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {/* Month nav + view toggle */}
      <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-8 relative">
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonthStart(addMonths(monthStart, -1))}
            className="text-[hsl(var(--primary))]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h3 className="font-display text-2xl md:text-3xl font-light text-[hsl(var(--foreground))] min-w-[220px] text-center">
            {format(monthStart, "MMMM yyyy", { locale: de })}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMonthStart(addMonths(monthStart, 1))}
            className="text-[hsl(var(--primary))]"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="hidden md:inline-flex md:absolute md:right-0 rounded-full border border-[hsl(var(--border))]/60 p-1 bg-[hsl(var(--card))]/40">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-colors ${
              view === "calendar"
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--background))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Kalender
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider transition-colors ${
              view === "list"
                ? "bg-[hsl(var(--primary))] text-[hsl(var(--background))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Liste
          </button>
        </div>
      </div>




      {courseTypes.length > 0 && (
        <>
          {/* Desktop chips */}
          <div className="hidden md:flex mb-6 flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedTypes(new Set())}
              className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-wider border transition-colors whitespace-nowrap ${
                selectedTypes.size === 0
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--background))] border-[hsl(var(--primary))]"
                  : "border-[hsl(var(--border))]/60 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              Alle
            </button>
            {courseTypes.map((t) => {
              const active = selectedTypes.has(t.id);
              const color = t.color ?? "hsl(var(--primary))";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs uppercase tracking-wider border transition-colors whitespace-nowrap ${
                    active
                      ? "text-[hsl(var(--foreground))]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                  style={{
                    borderColor: active ? color : "hsl(var(--border) / 0.6)",
                    backgroundColor: active ? `${color}25` : "transparent",
                  }}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>

          {/* Mobile filter drawer */}
          <div className="md:hidden mb-6 flex justify-center">
            <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-wider border border-[hsl(var(--border))]/60 text-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))]/40 transition-colors"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filter
                  {selectedTypes.size > 0 && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] text-[10px] font-medium">
                      {selectedTypes.size}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] bg-[hsl(var(--background))] border-[hsl(var(--border))] rounded-t-2xl">
                <SheetHeader className="text-left pb-2">
                  <SheetTitle className="text-[hsl(var(--foreground))]">Kurse filtern</SheetTitle>
                </SheetHeader>
                <div className="pb-2">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {selectedTypes.size === 0 ? "Alle Kurstypen" : `${selectedTypes.size} ausgewählt`}
                    </span>
                    {selectedTypes.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedTypes(new Set())}
                        className="text-xs text-[hsl(var(--primary))] uppercase tracking-wider"
                      >
                        Zurücksetzen
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {courseTypes.map((t) => {
                      const active = selectedTypes.has(t.id);
                      const color = t.color ?? "hsl(var(--primary))";
                      return (
                        <label
                          key={t.id}
                          className="flex items-center gap-3 cursor-pointer"
                        >
                          <Checkbox
                            checked={active}
                            onCheckedChange={() => toggleType(t.id)}
                          />
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className={`text-sm ${active ? "text-[hsl(var(--foreground))] font-medium" : "text-[hsl(var(--muted-foreground))]"}`}>
                            {t.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <SheetFooter className="pt-2">
                  <SheetClose asChild>
                    <button
                      type="button"
                      className="w-full py-3 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--background))] text-sm font-medium uppercase tracking-wider"
                    >
                      Fertig
                    </button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </>
      )}


      {view === "calendar" && (
        <>
          {/* Weekday header */}
          <div className="hidden md:grid grid-cols-7 gap-2 mb-2">
            {DAY_LABELS.map((d) => (
              <div
                key={d}
                className="text-center text-xs uppercase tracking-[0.25em] text-[hsl(var(--muted-foreground))] py-2"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid (desktop) */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {days.map((day) => {
              const inMonth = isSameMonth(day, monthStart);
              const dayCourses = coursesForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[120px] border border-[hsl(var(--border))]/40 p-2 transition-colors ${
                    inMonth
                      ? "bg-[hsl(var(--card))]/40"
                      : "bg-[hsl(var(--background))]/40 opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-end mb-1">
                    <span
                      className={`text-sm ${
                        isToday
                          ? "bg-[hsl(var(--primary))] text-[hsl(var(--background))] rounded-full h-6 w-6 inline-flex items-center justify-center font-medium"
                          : "text-[hsl(var(--muted-foreground))]"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayCourses.map((c) => {
                      const free = c.max_participants - (c.participants_count ?? 0);
                      const full = free <= 0;
                      const color = c.course_types?.color ?? "hsl(var(--primary))";
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="w-full text-left px-2 py-1.5 rounded border-l-2 hover:bg-[hsl(var(--secondary))] transition-colors group"
                          style={{ borderLeftColor: color, backgroundColor: `${color}15` }}
                        >
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-tight">
                            {format(parseISO(c.start_time), "HH:mm")}
                          </p>
                          <p className="text-xs font-medium text-[hsl(var(--foreground))] leading-tight truncate group-hover:text-[hsl(var(--primary))]">
                            {c.title}
                          </p>
                          {c.trainers && (
                            <p
                              className="text-[10px] leading-tight text-[hsl(var(--muted-foreground))] truncate"
                              title={`${c.trainers.first_name} ${c.trainers.last_name}`}
                            >
                              {c.trainers.first_name} {c.trainers.last_name.charAt(0)}.
                            </p>
                          )}
                          {(() => {
                            const notOpen = notYetOpenLabel(c);
                            if (notOpen) {
                              return (
                                <p className="text-[10px] leading-tight text-[hsl(var(--primary))]">
                                  {notOpen}
                                </p>
                              );
                            }
                            return (
                              <p
                                className={`text-[10px] leading-tight ${
                                  full
                                    ? "text-destructive"
                                    : "text-[hsl(var(--muted-foreground))]"
                                }`}
                              >
                                {full ? "Ausgebucht" : `${free} Plätze frei`}
                              </p>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>


          {/* Mobile: day strip */}
          <div className="md:hidden -mx-4 mb-4">
            <div
              ref={dayStripRef}
              className="flex items-stretch gap-1.5 px-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ touchAction: "pan-x" }}
            >
              {days
                .filter((d) => isSameMonth(d, monthStart))
                .map((day) => {
                  const dayCourses = coursesForDay(day);
                  const hasCourses = dayCourses.length > 0;
                  const isToday = isSameDay(day, today);
                  const isActive = selectedDay && isSameDay(day, selectedDay);
                  const shouldScrollTo =
                    isToday || (!selectedDay && !isToday && false);
                  const dotColors = Array.from(
                    new Set(
                      dayCourses
                        .map((c) => c.course_types?.color ?? "hsl(var(--primary))")
                    )
                  ).slice(0, 3);
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      data-day-scroll={shouldScrollTo ? "true" : undefined}
                      onClick={() =>
                        setSelectedDay((prev) =>
                          prev && isSameDay(prev, day) ? null : day
                        )
                      }
                      className={`shrink-0 w-12 rounded-xl py-2 flex flex-col items-center gap-0.5 border transition-colors ${
                        isActive
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15"
                          : isToday
                          ? "border-[hsl(var(--primary))]/60 bg-[hsl(var(--card))]/60"
                          : hasCourses
                          ? "border-[hsl(var(--border))]/60 bg-[hsl(var(--card))]/40"
                          : "border-transparent bg-transparent opacity-50"
                      }`}
                    >
                      <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                        {format(day, "EEEEEE", { locale: de })}
                      </span>
                      <span
                        className={`text-base font-medium ${
                          isToday
                            ? "text-[hsl(var(--primary))]"
                            : "text-[hsl(var(--foreground))]"
                        }`}
                      >
                        {format(day, "d")}
                      </span>
                      <span className="flex items-center gap-0.5 h-1.5 mt-0.5">
                        {dotColors.map((c, i) => (
                          <span
                            key={i}
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
            </div>
            {selectedDay && (
              <div className="px-4 pt-2 flex items-center justify-between">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  Gefiltert: {format(selectedDay, "EEEE, d. MMMM", { locale: de })}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="text-xs uppercase tracking-wider text-[hsl(var(--primary))]"
                >
                  Alle Tage
                </button>
              </div>
            )}
          </div>

          {/* Mobile list */}
          <div className="md:hidden space-y-5">
            {(() => {
              const visibleDays = days
                .filter((d) => isSameMonth(d, monthStart))
                .filter((d) => (selectedDay ? isSameDay(d, selectedDay) : true))
                .map((day) => ({ day, dayCourses: coursesForDay(day) }))
                .filter(({ dayCourses }) => dayCourses.length > 0);

              if (visibleDays.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-[hsl(var(--border))]/60 py-10 px-6 flex flex-col items-center text-center gap-3">
                    <CalendarX className="h-6 w-6 text-[hsl(var(--muted-foreground))]" />
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">
                      {selectedDay
                        ? "An diesem Tag sind keine Kurse geplant."
                        : "Keine Kurse in diesem Monat."}
                    </p>
                    {selectedDay ? (
                      <button
                        type="button"
                        onClick={() => setSelectedDay(null)}
                        className="text-xs uppercase tracking-wider text-[hsl(var(--primary))]"
                      >
                        Alle Tage anzeigen
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMonthStart(addMonths(monthStart, 1))}
                        className="text-xs uppercase tracking-wider text-[hsl(var(--primary))]"
                      >
                        Nächster Monat →
                      </button>
                    )}
                  </div>
                );
              }

              return visibleDays.map(({ day, dayCourses }) => (
                <div key={day.toISOString()}>
                  <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[hsl(var(--background))]/95 backdrop-blur-sm">
                    <h4 className="text-sm uppercase tracking-[0.2em] text-[hsl(var(--primary))] flex items-baseline gap-2">
                      <span className="text-lg font-bold">{format(day, "EEEE", { locale: de })}</span>
                      <span className="text-[hsl(var(--muted-foreground))] normal-case tracking-normal text-sm font-semibold">
                        {format(day, "d. MMMM", { locale: de })}
                      </span>
                    </h4>
                  </div>
                  <div className="space-y-2 mt-2">
                    {dayCourses.map((c) => {
                      const free = c.max_participants - (c.participants_count ?? 0);
                      const full = free <= 0;
                      const almostFull = !full && free <= 2;
                      const color = c.course_types?.color ?? "hsl(var(--primary))";
                      const trainerName = c.trainers
                        ? `${c.trainers.first_name} ${c.trainers.last_name.charAt(0)}.`
                        : null;
                      const startD = parseISO(c.start_time);
                      const endD = parseISO(c.end_time);
                      const durationMin = Math.round(
                        (endD.getTime() - startD.getTime()) / 60000
                      );
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="w-full text-left rounded-lg overflow-hidden border border-[hsl(var(--border))]/40 bg-[hsl(var(--card))]/50 active:bg-[hsl(var(--secondary))] transition-colors flex items-stretch"
                          style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                        >
                          <div
                            className="flex flex-col items-center justify-center px-3 py-3 min-w-[64px]"
                            style={{ backgroundColor: `${color}18` }}
                          >
                            <span className="text-sm font-semibold text-[hsl(var(--foreground))] leading-none">
                              {format(startD, "HH:mm")}
                            </span>
                            <span className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">
                              {durationMin} min
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 py-2.5 px-3 flex flex-col justify-center gap-1">
                            <p className="text-sm font-medium text-[hsl(var(--foreground))] leading-tight truncate">
                              {c.title}
                            </p>
                            <div className="flex items-center gap-x-2 gap-y-0.5 text-[11px] text-[hsl(var(--muted-foreground))] flex-wrap">
                              {trainerName && (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {trainerName}
                                </span>
                              )}
                              {c.location && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3" />
                                  <span className="truncate">{c.location}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-center px-3 py-2 gap-1 min-w-[76px]">
                            <span className="text-xs font-medium text-[hsl(var(--foreground))]">
                              {Number(c.price).toLocaleString("de-DE", {
                                style: "currency",
                                currency: "EUR",
                                maximumFractionDigits: 0,
                              })}
                            </span>
                            {(() => {
                              const notOpen = notYetOpenLabel(c);
                              if (notOpen) {
                                return (
                                  <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--primary))] text-right">
                                    {notOpen}
                                  </span>
                                );
                              }
                              return (
                                <span
                                  className={`text-[10px] uppercase tracking-wider ${
                                    full
                                      ? "text-destructive"
                                      : almostFull
                                      ? "text-[hsl(var(--primary))]"
                                      : "text-[hsl(var(--muted-foreground))]"
                                  }`}
                                >
                                  {full ? "Voll" : `${free} frei`}
                                </span>
                              );
                            })()}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </>
      )}


      {view === "list" && (
        <div className="space-y-6 max-w-3xl mx-auto">
          {days
            .filter((d) => isSameMonth(d, monthStart))
            .map((day) => {
              const dayCourses = coursesForDay(day);
              if (dayCourses.length === 0) return null;
              return (
                <div key={day.toISOString()}>
                  <h4 className="font-display text-xl text-[hsl(var(--primary))] mb-3 border-b border-[hsl(var(--border))]/40 pb-2">
                    {format(day, "EEEE, d. MMMM yyyy", { locale: de })}
                  </h4>
                  <div className="space-y-2">
                    {dayCourses.map((c) => {
                      const free = c.max_participants - (c.participants_count ?? 0);
                      const full = free <= 0;
                      const color = c.course_types?.color ?? "hsl(var(--primary))";
                      const trainerName = c.trainers
                        ? `${c.trainers.first_name} ${c.trainers.last_name}`
                        : null;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setSelected(c)}
                          className="w-full text-left p-4 rounded border-l-4 hover:bg-[hsl(var(--secondary))] transition-colors group flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                          style={{ borderLeftColor: color, backgroundColor: `${color}10` }}
                        >
                          <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] sm:min-w-[140px] shrink-0">
                            <Clock className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                            <span className="font-medium text-[hsl(var(--foreground))]">
                              {format(parseISO(c.start_time), "HH:mm")} –{" "}
                              {format(parseISO(c.end_time), "HH:mm")}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-display text-lg text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors leading-tight">
                              {c.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                              {trainerName && (
                                <span className="inline-flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {trainerName}
                                </span>
                              )}
                              {c.location && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {c.location}
                                </span>
                              )}
                              <span className="text-[hsl(var(--foreground))]/80">
                                {Number(c.price).toLocaleString("de-DE", {
                                  style: "currency",
                                  currency: "EUR",
                                })}
                              </span>
                            </div>
                          </div>

                          {(() => {
                            const notOpen = notYetOpenLabel(c);
                            if (notOpen) {
                              return (
                                <div className="text-xs uppercase tracking-wider sm:text-right sm:min-w-[110px] text-[hsl(var(--primary))]">
                                  {notOpen}
                                </div>
                              );
                            }
                            return (
                              <div
                                className={`text-xs uppercase tracking-wider sm:text-right sm:min-w-[110px] ${
                                  full
                                    ? "text-destructive"
                                    : "text-[hsl(var(--primary))]"
                                }`}
                              >
                                {full ? "Ausgebucht" : `${free} Plätze frei`}
                              </div>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {loading && (
        <p className="text-center text-[hsl(var(--muted-foreground))] mt-6 text-sm">
          Lade Kursplan…
        </p>
      )}
      {!loading && courses.length === 0 && (
        <p className="text-center text-[hsl(var(--muted-foreground))] mt-6 text-sm">
          Aktuell sind keine Kurse für diesen Monat eingeplant.
        </p>
      )}

      {selected && (
        <CourseBookingDialog
          course={selected}
          open={!!selected}
          onOpenChange={(o) => !o && setSelected(null)}
        />
      )}
    </div>
  );
}
