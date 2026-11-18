import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComp } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, CalendarIcon, Filter, Plus, MoreHorizontal, ArrowUpDown, ShoppingCart, Ban, Trash2, Copy } from "lucide-react";
import { format, parseISO, addMonths, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import CourseFormDrawer from "./CourseFormDrawer";
import CourseDetailPanel from "./CourseDetailPanel";

interface Props {
  scope: "admin" | "trainer"; // admin = all, trainer = own only
  trainerId?: string | null;
  title?: string;
}

type SortKey = "course_no" | "start_time" | "title";

export default function CoursesTable({ scope, trainerId, title = "Kurse" }: Props) {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState<Date>(new Date());
  const [to, setTo] = useState<Date>(addMonths(new Date(), 12));
  const [filterOpen, setFilterOpen] = useState(false);
  const [courseTypes, setCourseTypes] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterTrainer, setFilterTrainer] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("start_time");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<any | null>(null);
  const [detailCourse, setDetailCourse] = useState<any | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("courses")
      .select("*, course_types(name, color, image_url)")
      .gte("start_time", startOfDay(from).toISOString())
      .lte("start_time", endOfDay(to).toISOString());
    if (scope === "trainer" && trainerId) q = q.eq("instructor_id", trainerId);
    if (scope === "trainer" && !trainerId) q = q.eq("instructor_id", "00000000-0000-0000-0000-000000000000");
    const { data } = await q.order("start_time");
    let list = data ?? [];

    // attach trainer info (no FK relationship in DB, so manual join)
    const trainerIds = Array.from(new Set(list.map((r: any) => r.instructor_id).filter(Boolean)));
    if (trainerIds.length) {
      const { data: tr } = await supabase
        .from("trainers")
        .select("id, first_name, last_name")
        .in("id", trainerIds);
      const map = new Map((tr ?? []).map((t: any) => [t.id, t]));
      list = list.map((c: any) => ({ ...c, trainers: map.get(c.instructor_id) ?? null }));
    }
    setRows(list);

    // booking counts
    const ids = list.map((r: any) => r.id);
    if (ids.length) {
      const { data: bk } = await supabase
        .from("bookings")
        .select("course_id, status")
        .in("course_id", ids);
      const map: Record<string, number> = {};
      (bk ?? []).forEach((b: any) => {
        if (b.status === "confirmed") map[b.course_id] = (map[b.course_id] ?? 0) + 1;
      });
      setCounts(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      const [t, tr] = await Promise.all([
        supabase.from("course_types").select("*").order("name"),
        supabase.from("trainers").select("*").eq("is_active", true).order("last_name"),
      ]);
      setCourseTypes(t.data ?? []);
      setTrainers(tr.data ?? []);
    })();
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, scope, trainerId]);

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(c => c.title?.toLowerCase().includes(s)
        || c.trainers?.first_name?.toLowerCase().includes(s)
        || c.trainers?.last_name?.toLowerCase().includes(s));
    }
    if (filterTypes.length) r = r.filter(c => filterTypes.includes(c.course_type_id));
    if (filterTrainer) r = r.filter(c => c.instructor_id === filterTrainer);
    if (filterStatus) {
      r = r.filter(c => {
        const cnt = counts[c.id] ?? 0;
        if (filterStatus === "cancelled") return c.is_cancelled;
        if (filterStatus === "full") return !c.is_cancelled && cnt >= c.max_participants;
        if (filterStatus === "open") return !c.is_cancelled && cnt < c.max_participants;
        return true;
      });
    }
    r = [...r].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });
    return r;
  }, [rows, search, filterTypes, filterTrainer, filterStatus, counts, sortKey, sortAsc]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(!sortAsc);
    else { setSortKey(k); setSortAsc(true); }
  };

  const cancelCourse = async (id: string) => {
    if (!confirm("Kurs absagen? Alle Buchungen werden storniert, Karten zurückgebucht und Kunden per E-Mail informiert.")) return;
    const { data, error } = await supabase.functions.invoke("cancel-course", { body: { course_id: id } });
    if (error) return toast.error(error.message);
    const n = data?.results?.[0]?.bookings?.length ?? 0;
    toast.success(`Kurs abgesagt. ${n} Buchung(en) storniert & Kunden benachrichtigt.`);
    load();
  };

  const deleteCourse = async (id: string) => {
    if (!confirm("Kurs unwiderruflich löschen?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Kurs gelöscht.");
    load();
  };

  const bulkCancel = async () => {
    if (!selected.size) return;
    if (!confirm(`${selected.size} Kurse absagen? Buchungen werden storniert, Karten zurückgebucht und Kunden per E-Mail informiert.`)) return;
    const { error } = await supabase.functions.invoke("cancel-course", { body: { course_ids: Array.from(selected) } });
    if (error) return toast.error(error.message);
    toast.success(`${selected.size} Kurse abgesagt & Kunden benachrichtigt.`);
    setSelected(new Set()); load();
  };

  const openDetail = (c: any) => { setDetailCourse(c); setDetailOpen(true); };
  const openEdit = (c: any) => { setEditingCourse(c); setEditOpen(true); setDetailOpen(false); };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl">{title}</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="outline" size="sm" onClick={bulkCancel}>
              <Ban className="h-4 w-4 mr-1" />{selected.size} absagen
            </Button>
          )}
          <Button onClick={() => { setEditingCourse(null); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Kurs erstellen
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kurse suchen…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(from, "d. MMM yyyy", { locale: de })} – {format(to, "d. MMM yyyy", { locale: de })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <CalendarComp
              mode="range"
              numberOfMonths={2}
              defaultMonth={from}
              selected={{ from, to } as DateRange}
              onSelect={(range: DateRange | undefined) => {
                if (range?.from) setFrom(range.from);
                if (range?.to) setTo(range.to);
              }}
              locale={de}
              className="p-3 pointer-events-auto"
            />
            <div className="flex items-center justify-between gap-2 p-3 border-t">
              <span className="text-xs text-muted-foreground">
                {format(from, "d. MMM yyyy", { locale: de })} – {format(to, "d. MMM yyyy", { locale: de })}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFrom(new Date()); setTo(addMonths(new Date(), 12)); }}
              >
                Zurücksetzen
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="icon" onClick={() => setFilterOpen(true)}>
          <Filter className="h-4 w-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 w-10">
                  <Checkbox
                    checked={paged.length > 0 && paged.every(r => selected.has(r.id))}
                    onCheckedChange={(v) => {
                      const next = new Set(selected);
                      if (v) paged.forEach(r => next.add(r.id));
                      else paged.forEach(r => next.delete(r.id));
                      setSelected(next);
                    }}
                  />
                </th>
                <th className="p-3 text-left cursor-pointer" onClick={() => toggleSort("course_no")}>
                  <span className="inline-flex items-center gap-1">ID <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="p-3 text-left cursor-pointer" onClick={() => toggleSort("start_time")}>
                  <span className="inline-flex items-center gap-1">Datum & Uhrzeit <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="p-3 text-left cursor-pointer" onClick={() => toggleSort("title")}>
                  <span className="inline-flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></span>
                </th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Gebucht</th>
                <th className="p-3 text-left">Trainer</th>
                <th className="p-3 text-left">Team</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Laden…</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} className="p-12 text-center text-muted-foreground">Keine Kurse im gewählten Zeitraum.</td></tr>
              ) : paged.map((c) => {
                const cnt = counts[c.id] ?? 0;
                const full = cnt >= c.max_participants;
                const status = c.is_cancelled
                  ? { label: "Abgesagt", className: "bg-destructive/15 text-destructive border-destructive/30" }
                  : full
                  ? { label: "Voll", className: "bg-primary/20 text-primary border-primary/40" }
                  : { label: "Offen", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
                return (
                  <tr key={c.id}
                    className={cn("border-t hover:bg-muted/30 cursor-pointer transition-colors", c.is_cancelled && "opacity-60")}
                    onClick={() => openDetail(c)}>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(c.id)} onCheckedChange={(v) => {
                        const next = new Set(selected);
                        if (v) next.add(c.id); else next.delete(c.id);
                        setSelected(next);
                      }} />
                    </td>
                    <td className="p-3 text-muted-foreground">{c.course_no ?? "–"}</td>
                    <td className="p-3">
                      <div>{format(parseISO(c.start_time), "d. MMM yyyy", { locale: de })}</div>
                      <div className="text-xs text-muted-foreground">{format(parseISO(c.start_time), "HH:mm")} Uhr</div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-8 w-8 rounded-full bg-cover bg-center border shrink-0"
                          style={{
                            backgroundImage: (c.image_url || c.course_types?.image_url) ? `url(${c.image_url ?? c.course_types?.image_url})` : undefined,
                            backgroundColor: c.color || c.course_types?.color || "hsl(var(--secondary))",
                          }}
                        />
                        <span className="font-medium">{c.title}</span>
                        {c.direct_trainer_booking && <Badge variant="outline" className="ml-2 text-[10px]">Direkt bei Trainer:in</Badge>}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded text-xs border", status.className)}>
                        <ShoppingCart className="h-3 w-3" />{status.label}
                      </span>
                    </td>
                    <td className="p-3">{cnt} / {c.max_participants}</td>
                    <td className="p-3">
                      {c.trainers ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px]">
                            {c.trainers.first_name?.[0]}{c.trainers.last_name?.[0]}
                          </span>
                          {c.trainers.first_name} {c.trainers.last_name?.[0]}.
                        </span>
                      ) : "–"}
                    </td>
                    <td className="p-3 text-muted-foreground">–</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(c)}>Bearbeiten</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openDetail(c)}>Details</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {!c.is_cancelled && (
                            <DropdownMenuItem onClick={() => cancelCourse(c.id)}>
                              <Ban className="h-4 w-4 mr-2" />Absagen
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => deleteCourse(c.id)} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />Löschen
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-t bg-secondary/20 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total {filtered.length}</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}/Seite</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹</Button>
            <span>Seite {page} / {totalPages}</span>
            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
          </div>
        </div>
      </div>

      {/* Filter sheet */}
      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader><SheetTitle>Filter</SheetTitle></SheetHeader>
          <div className="space-y-5 mt-6">
            <div>
              <p className="text-sm font-medium mb-2">Kursart</p>
              <div className="space-y-2">
                {courseTypes.map(ct => (
                  <label key={ct.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={filterTypes.includes(ct.id)} onCheckedChange={(v) => {
                      setFilterTypes(prev => v ? [...prev, ct.id] : prev.filter(x => x !== ct.id));
                    }} />
                    <span className="h-2 w-2 rounded-full" style={{ background: ct.color }} />
                    {ct.name}
                  </label>
                ))}
              </div>
            </div>
            {scope === "admin" && (
              <div>
                <p className="text-sm font-medium mb-2">Trainer</p>
                <Select value={filterTrainer || "__all"} onValueChange={(v) => setFilterTrainer(v === "__all" ? "" : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Alle</SelectItem>
                    {trainers.map(t => <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-2">Status</p>
              <Select value={filterStatus || "__all"} onValueChange={(v) => setFilterStatus(v === "__all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Alle</SelectItem>
                  <SelectItem value="open">Offen</SelectItem>
                  <SelectItem value="full">Voll</SelectItem>
                  <SelectItem value="cancelled">Abgesagt</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="w-full" onClick={() => {
              setFilterTypes([]); setFilterTrainer(""); setFilterStatus("");
            }}>Filter zurücksetzen</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create / Edit drawer */}
      <CourseFormDrawer
        open={createOpen || editOpen}
        onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditOpen(false); setEditingCourse(null); } }}
        course={editOpen ? editingCourse : null}
        defaultTrainerId={trainerId ?? null}
        isAdmin={isAdmin}
        onSaved={load}
      />

      {/* Detail panel */}
      <CourseDetailPanel
        open={detailOpen}
        onOpenChange={setDetailOpen}
        course={detailCourse}
        onEdit={() => detailCourse && openEdit(detailCourse)}
        onChanged={load}
      />
    </div>
  );
}
