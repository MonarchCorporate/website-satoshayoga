import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, X, Image as ImageIcon, Calendar, Euro, Repeat, Settings as SettingsIcon, Plus, Trash2, Upload } from "lucide-react";
import { addWeeks, isBefore, isEqual } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "details", label: "Details", icon: ImageIcon },
  { id: "pricing", label: "Preisgestaltung", icon: Euro },
  { id: "recurring", label: "Wiederkehrend", icon: Repeat },
  { id: "settings", label: "Einstellungen", icon: SettingsIcon },
] as const;
type TabId = typeof TABS[number]["id"];

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  course?: any | null;
  defaultTrainerId?: string | null;
  isAdmin: boolean;
  onSaved: () => void;
}

export default function CourseFormDrawer({ open, onOpenChange, course, defaultTrainerId, isAdmin, onSaved }: Props) {
  const [tab, setTab] = useState<TabId>("details");
  const [saving, setSaving] = useState(false);
  const [courseTypes, setCourseTypes] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);

  // form state
  const [title, setTitle] = useState("");
  const [courseTypeId, setCourseTypeId] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [color, setColor] = useState("#C8A97E");
  const [isVisible, setIsVisible] = useState(true);
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [startClock, setStartClock] = useState("");
  const [durationMin, setDurationMin] = useState("60");
  const [customDuration, setCustomDuration] = useState(false);
  const [bookingOpensImmediately, setBookingOpensImmediately] = useState(true);
  const [bookingOpensDate, setBookingOpensDate] = useState("");
  const [bookingOpensClock, setBookingOpensClock] = useState("");
  const [bookingClosesAtStart, setBookingClosesAtStart] = useState(true);
  // pricing
  const [price, setPrice] = useState("16");
  const [classCardsAllowed, setClassCardsAllowed] = useState(true);
  const [directTrainer, setDirectTrainer] = useState(false);
  // settings
  const [maxParticipants, setMaxParticipants] = useState("8");
  const [minParticipants, setMinParticipants] = useState("");
  const [instructorId, setInstructorId] = useState<string>("");
  const [coInstructorId, setCoInstructorId] = useState<string>("");
  const [internalNotes, setInternalNotes] = useState("");
  const [description, setDescription] = useState("");
  // recurring
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [interval, setIntervalWeeks] = useState("1");

  const isEdit = !!course;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [typesRes, trainersRes] = await Promise.all([
        supabase.from("course_types").select("*").order("name"),
        supabase.from("trainers").select("*").eq("is_active", true).order("last_name"),
      ]);
      setCourseTypes(typesRes.data ?? []);
      setTrainers(trainersRes.data ?? []);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setTab("details");
    if (course) {
      setTitle(course.title ?? "");
      setCourseTypeId(course.course_type_id ?? "");
      setImageUrl(course.image_url ?? null);
      setColor(course.color ?? course.course_types?.color ?? "#C8A97E");
      setIsVisible(course.is_visible ?? true);
      setLocation(course.location ?? "");
      const s = course.start_time ? new Date(course.start_time) : null;
      const e = course.end_time ? new Date(course.end_time) : null;
      setDate(s ? toDateInput(s) : "");
      setStartClock(s ? toTimeInput(s) : "");
      const dur = s && e ? Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)) : 60;
      setDurationMin(String(dur));
      setCustomDuration(![30, 45, 60, 75, 90, 120].includes(dur));
      setBookingOpensImmediately(course.booking_opens_immediately ?? true);
      const bo = course.booking_opens_at ? new Date(course.booking_opens_at) : null;
      setBookingOpensDate(bo ? toDateInput(bo) : "");
      setBookingOpensClock(bo ? toTimeInput(bo) : "");
      setBookingClosesAtStart(course.booking_closes_at_start ?? true);
      setPrice(String(course.price ?? "16"));
      setClassCardsAllowed(course.class_cards_allowed ?? true);
      setDirectTrainer(course.direct_trainer_booking ?? false);
      setMaxParticipants(String(course.max_participants ?? "8"));
      setMinParticipants(course.min_participants ? String(course.min_participants) : "");
      setInstructorId(course.instructor_id ?? defaultTrainerId ?? "");
      setCoInstructorId(course.co_instructor_id ?? "");
      setInternalNotes(course.internal_notes ?? "");
      setDescription(course.description ?? "");
      setRecurring(false);
      setEndDate("");
    } else {
      setTitle(""); setCourseTypeId(""); setImageUrl(null); setColor("#C8A97E");
      setDate(""); setStartClock(""); setDurationMin("60"); setCustomDuration(false);
      setBookingOpensImmediately(true); setBookingOpensDate(""); setBookingOpensClock(""); setBookingClosesAtStart(true);
      setPrice("16"); setMaxParticipants("8"); setMinParticipants(""); setClassCardsAllowed(true); setDirectTrainer(false);
      setInstructorId(defaultTrainerId ?? ""); setCoInstructorId("");
      setInternalNotes(""); setDescription("");
      setRecurring(false); setEndDate(""); setIntervalWeeks("1");
    }
  }, [open, course, defaultTrainerId]);

  const handleImageUpload = async (file: File) => {
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("course-images").upload(path, file, { upsert: false });
    if (error) { toast.error("Upload fehlgeschlagen: " + error.message); return; }
    const { data } = supabase.storage.from("course-images").getPublicUrl(path);
    setImageUrl(data.publicUrl);
  };

  const durationNum = Math.max(1, parseInt(durationMin || "0") || 0);
  const computedStart = date && startClock ? new Date(`${date}T${startClock}`) : null;
  const computedEnd = computedStart && durationNum > 0
    ? new Date(computedStart.getTime() + durationNum * 60000)
    : null;

  const save = async () => {
    if (!title || !courseTypeId || !date || !startClock || !durationNum) {
      toast.error("Bitte Pflichtfelder ausfüllen.");
      setTab("details");
      return;
    }
    const start = computedStart!;
    const end = computedEnd!;
    const tid = instructorId || defaultTrainerId;
    if (!tid) { toast.error("Bitte einen Trainer wählen."); return; }

    let bookingOpensAtIso: string | null = null;
    if (!bookingOpensImmediately) {
      if (!bookingOpensDate || !bookingOpensClock) {
        toast.error("Bitte Datum und Uhrzeit für den Buchungsstart angeben.");
        setTab("details");
        return;
      }
      const bo = new Date(`${bookingOpensDate}T${bookingOpensClock}`);
      if (bo >= start) {
        toast.error("Der Buchungsstart muss vor dem Kursbeginn liegen.");
        setTab("details");
        return;
      }
      bookingOpensAtIso = bo.toISOString();
    }

    setSaving(true);

    const base = {
      title, course_type_id: courseTypeId, image_url: imageUrl, color,
      is_visible: isVisible, location: location || null,
      booking_opens_immediately: bookingOpensImmediately,
      booking_opens_at: bookingOpensAtIso,
      booking_closes_at_start: bookingClosesAtStart,
      price: parseFloat(price), max_participants: parseInt(maxParticipants),
      min_participants: minParticipants ? parseInt(minParticipants) : null,
      instructor_id: tid, co_instructor_id: coInstructorId || null,
      internal_notes: internalNotes || null, description: description || null,
      class_cards_allowed: classCardsAllowed,
      direct_trainer_booking: directTrainer,
    };


    if (isEdit) {
      const { error } = await supabase
        .from("courses")
        .update({ ...base, start_time: start.toISOString(), end_time: end.toISOString() })
        .eq("id", course.id);
      setSaving(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Kurs gespeichert.");
      onOpenChange(false); onSaved();
      return;
    }

    const occurrences = [{ start, end }];
    if (recurring) {
      if (!endDate) { setSaving(false); toast.error("Enddatum für Wiederholung wählen."); setTab("recurring"); return; }
      const lastDay = new Date(endDate + "T23:59:59");
      const step = Math.max(1, parseInt(interval || "1"));
      let next = addWeeks(start, step), nextEnd = addWeeks(end, step);
      while (isBefore(next, lastDay) || isEqual(next, lastDay)) {
        occurrences.push({ start: new Date(next), end: new Date(nextEnd) });
        next = addWeeks(next, step); nextEnd = addWeeks(nextEnd, step);
      }
    }
    const seriesId = recurring ? crypto.randomUUID() : null;
    const rows = occurrences.map(o => ({
      ...base,
      start_time: o.start.toISOString(),
      end_time: o.end.toISOString(),
      series_id: seriesId,
    }));
    const { error } = await supabase.from("courses").insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} Kurs${rows.length > 1 ? "e" : ""} erstellt.`);
    onOpenChange(false); onSaved();
  };

  const recurringPreviewCount = (() => {
    if (!recurring || !computedStart || !endDate) return 1;
    const lastDay = new Date(endDate + "T23:59:59");
    const step = Math.max(1, parseInt(interval || "1"));
    let count = 1, next = addWeeks(computedStart, step);
    while (isBefore(next, lastDay) || isEqual(next, lastDay)) { count++; next = addWeeks(next, step); }
    return count;
  })();



  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Kurse</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className="font-display text-lg text-primary">
              {isEdit ? course.title : "Neuer Kurs"}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[220px_1fr] overflow-hidden">
          {/* Sidebar tabs */}
          <aside className="border-r bg-secondary/30 p-3 space-y-1 overflow-y-auto">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
                    active ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </aside>

          {/* Content */}
          <div className="overflow-y-auto p-6 space-y-6">
            {tab === "details" && (
              <>
                <div className="border rounded-lg p-5 grid grid-cols-1 md:grid-cols-[140px_1fr_180px] gap-5 items-start">
                  {(() => {
                    const typeImage = courseTypes.find(c => c.id === courseTypeId)?.image_url ?? null;
                    const displayed = imageUrl ?? typeImage;
                    return (
                      <div className="space-y-2">
                        <label className="relative aspect-square rounded-full border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 overflow-hidden bg-secondary/30">
                          {displayed ? (
                            <>
                              <img src={displayed} alt="Kursbild" className="w-full h-full object-cover" />
                              {!imageUrl && typeImage && (
                                <span className="absolute bottom-0 inset-x-0 bg-background/85 text-[9px] uppercase tracking-wider text-center py-0.5 text-muted-foreground">
                                  Kursart-Bild
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                              <span className="text-xs text-muted-foreground">Bild hochladen</span>
                              <span className="text-[10px] text-muted-foreground">PNG, JPG</span>
                            </>
                          )}
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                            const f = e.target.files?.[0]; if (f) handleImageUpload(f);
                          }} />
                        </label>
                        {imageUrl && (
                          <button
                            type="button"
                            onClick={() => setImageUrl(null)}
                            className="text-[11px] text-muted-foreground hover:text-destructive underline w-full text-center"
                          >
                            Eigenes Bild entfernen
                          </button>
                        )}
                        <p className="text-[10px] text-muted-foreground text-center leading-tight">
                          Optional – überschreibt das Kursart-Bild
                        </p>
                      </div>
                    );
                  })()}

                  <div className="space-y-3">
                    <div>
                      <Label>Name *</Label>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z.B. 18:00 Vinyasa Flow" />
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={isVisible} onCheckedChange={setIsVisible} />
                      <Label className="m-0">Auf Website anzeigen</Label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Farbe *</Label>
                    <div className="flex items-center gap-2">
                      <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                        className="h-9 w-9 rounded border cursor-pointer" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Kursart *</Label>
                  <Select value={courseTypeId} onValueChange={(v) => {
                    setCourseTypeId(v);
                    const ct = courseTypes.find(c => c.id === v);
                    if (ct?.color && color === "#C8A97E") setColor(ct.color);
                    if (ct?.description && !description.trim()) setDescription(ct.description);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                    <SelectContent>
                      {courseTypes.map(ct => (
                        <SelectItem key={ct.id} value={ct.id}>
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: ct.color }} />
                            {ct.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Datum *</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>Startzeit *</Label>
                    <Input type="time" value={startClock} onChange={(e) => setStartClock(e.target.value)} />
                  </div>
                  <div>
                    <Label>Dauer *</Label>
                    {customDuration ? (
                      <div className="flex gap-2">
                        <Input type="number" min="1" value={durationMin}
                          onChange={(e) => setDurationMin(e.target.value)} />
                        <span className="self-center text-sm text-muted-foreground">Min</span>
                        <Button type="button" variant="ghost" size="sm"
                          onClick={() => { setCustomDuration(false); setDurationMin("60"); }}>
                          Presets
                        </Button>
                      </div>
                    ) : (
                      <Select value={durationMin} onValueChange={(v) => {
                        if (v === "__custom") { setCustomDuration(true); return; }
                        setDurationMin(v);
                      }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 Min</SelectItem>
                          <SelectItem value="45">45 Min</SelectItem>
                          <SelectItem value="60">60 Min</SelectItem>
                          <SelectItem value="75">75 Min</SelectItem>
                          <SelectItem value="90">90 Min</SelectItem>
                          <SelectItem value="120">120 Min</SelectItem>
                          <SelectItem value="__custom">Andere…</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                {computedEnd && (
                  <p className="text-xs text-muted-foreground -mt-2">
                    Endet um {String(computedEnd.getHours()).padStart(2, "0")}:{String(computedEnd.getMinutes()).padStart(2, "0")} Uhr
                  </p>
                )}

                <div className="space-y-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={bookingOpensImmediately}
                      onChange={(e) => setBookingOpensImmediately(e.target.checked)} className="accent-primary" />
                    <span className="text-sm">Die Buchungsmöglichkeit startet sofort</span>
                  </label>
                  {!bookingOpensImmediately && (
                    <div className="ml-6 grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-secondary/30 p-3">
                      <div>
                        <Label className="text-xs">Buchbar ab Datum *</Label>
                        <Input type="date" value={bookingOpensDate}
                          onChange={(e) => setBookingOpensDate(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Uhrzeit *</Label>
                        <Input type="time" value={bookingOpensClock}
                          onChange={(e) => setBookingOpensClock(e.target.value)} />
                      </div>
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Vor diesem Zeitpunkt kann der Kurs nicht gebucht werden.
                      </p>
                    </div>
                  )}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={bookingClosesAtStart}
                      onChange={(e) => setBookingClosesAtStart(e.target.checked)} className="accent-primary" />
                    <span className="text-sm">Die Buchung wird geschlossen, wenn der Kurs startet</span>
                  </label>
                </div>

                <div>
                  <Label>Ort</Label>
                  <Input value={location} onChange={(e) => setLocation(e.target.value)}
                    placeholder="Studio Heide / Online-Link / …" />
                </div>

                <div>
                  <Label>Beschreibung (optional)</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
                </div>
              </>
            )}

            {tab === "pricing" && (
              <div className="space-y-4 max-w-md">
                <div>
                  <Label>Preis pro Teilnehmer (€)</Label>
                  <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div className="flex items-center justify-between border rounded p-4 bg-secondary/30">
                  <div>
                    <Label className="m-0">Buchung mit Gruppenkarten (5er/10er) erlauben</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {classCardsAllowed
                        ? "Kunden können 5er-/10er-Karten für diesen Kurs einlösen."
                        : "Kunden können diesen Kurs nur per Bezahlung oder Geschenkgutschein buchen."}
                    </p>
                  </div>
                  <Switch checked={classCardsAllowed} onCheckedChange={setClassCardsAllowed} />
                </div>
                <div className="flex items-center justify-between border rounded p-4 bg-secondary/30">
                  <div>
                    <Label className="m-0">Direkt beim Trainer buchbar</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Kurs erscheint im Kalender, ist aber nicht online buchbar. Kund:innen vereinbaren den Termin direkt mit der Trainerin / dem Trainer.
                    </p>
                  </div>
                  <Switch checked={directTrainer} onCheckedChange={setDirectTrainer} />
                </div>
              </div>
            )}


            {tab === "recurring" && (
              <div className="space-y-4 max-w-xl">
                {isEdit ? (
                  <p className="text-sm text-muted-foreground">
                    Wiederholungen werden nur beim Erstellen erzeugt. Um eine Serie zu ändern, lege bitte eine neue an.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between border rounded p-4 bg-secondary/30">
                      <div className="flex items-center gap-2">
                        <Repeat className="h-4 w-4 text-primary" />
                        <Label className="m-0">Wöchentlich wiederholen</Label>
                      </div>
                      <Switch checked={recurring} onCheckedChange={setRecurring} />
                    </div>
                    {recurring && (
                      <div className="border rounded p-4 space-y-4">
                        {computedStart && (
                          <p className="text-sm">
                            Wochentag: <span className="font-medium">{WEEKDAY_LABELS[(computedStart.getDay() + 6) % 7]}</span>
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Enddatum</Label>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                          </div>
                          <div>
                            <Label>Jede X. Woche</Label>
                            <Input type="number" min="1" max="12" value={interval} onChange={(e) => setIntervalWeeks(e.target.value)} />
                          </div>
                        </div>
                        <p className="text-sm text-primary">
                          {recurringPreviewCount} Termin{recurringPreviewCount !== 1 ? "e" : ""} werden erstellt.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "settings" && (
              <div className="space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Max. Teilnehmer</Label>
                    <Input type="number" min="1" value={maxParticipants}
                      onChange={(e) => setMaxParticipants(e.target.value)} />
                  </div>
                  <div>
                    <Label>Min. Teilnehmer</Label>
                    <Input type="number" min="0" value={minParticipants}
                      onChange={(e) => setMinParticipants(e.target.value)} placeholder="optional" />
                  </div>
                </div>
                {isAdmin && (
                  <>
                    <div>
                      <Label>Trainer</Label>
                      <Select value={instructorId} onValueChange={setInstructorId}>
                        <SelectTrigger><SelectValue placeholder="Wählen…" /></SelectTrigger>
                        <SelectContent>
                          {trainers.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Co-Trainer / Team (optional)</Label>
                      <Select value={coInstructorId || "__none"} onValueChange={(v) => setCoInstructorId(v === "__none" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Keiner" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Keiner</SelectItem>
                          {trainers.filter(t => t.id !== instructorId).map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                <div>
                  <Label>Interne Notizen (nur Backoffice)</Label>
                  <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={3} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Schließen</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Speichern…" : "Speichern"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
