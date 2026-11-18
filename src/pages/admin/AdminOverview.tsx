import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  CalendarDays, BookOpen, CreditCard, Euro, UserCog, Palette, Plus, Users,
} from "lucide-react";
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";

interface Kpi { label: string; value: string; icon: any; sub?: string; }

export default function AdminOverview() {
  const { isAdmin, isTrainer, loading: authLoading, user } = useAuth();
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [recentBookings, setRecentBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      setLoading(true);
      setRecentError(null);
      const now = new Date();
      const dayStart = startOfDay(now).toISOString();
      const dayEnd = endOfDay(now).toISOString();
      const weekS = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const weekE = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
      const monthS = startOfMonth(now).toISOString();
      const monthE = endOfMonth(now).toISOString();

      const [todayBookings, weekCourses, activeCards, monthBookings, upcomingRes, recentRes] = await Promise.all([
        supabase.from("bookings").select("id", { count: "exact", head: true })
          .gte("created_at", dayStart).lte("created_at", dayEnd),
        supabase.from("courses").select("id, max_participants")
          .gte("start_time", weekS).lte("start_time", weekE).eq("is_cancelled", false),
        supabase.from("class_cards").select("id", { count: "exact", head: true })
          .gt("remaining_credits", 0),
        supabase.from("bookings").select("amount_paid")
          .gte("created_at", monthS).lte("created_at", monthE).eq("refunded", false),
        supabase.from("courses").select("id,title,start_time,max_participants,course_types(name,color),trainers(first_name,last_name)")
          .gte("start_time", new Date().toISOString()).eq("is_cancelled", false)
          .order("start_time").limit(5),
        supabase.from("bookings").select("id,created_at,amount_paid,status,user_id,course_id")
          .order("created_at", { ascending: false }).limit(5),
      ]);

      const weekCapacity = (weekCourses.data ?? []).reduce((s, c: any) => s + (c.max_participants ?? 0), 0);
      const monthRevenue = (monthBookings.data ?? []).reduce((s, b: any) => s + Number(b.amount_paid ?? 0), 0);

      setKpis([
        { label: "Buchungen heute", value: String(todayBookings.count ?? 0), icon: BookOpen },
        { label: "Plätze diese Woche", value: String(weekCapacity), icon: CalendarDays, sub: `${weekCourses.data?.length ?? 0} Kurse` },
        { label: "Aktive Karten", value: String(activeCards.count ?? 0), icon: CreditCard },
        { label: "Umsatz Monat", value: `${monthRevenue.toFixed(2)} €`, icon: Euro },
      ]);
      setUpcoming(upcomingRes.data ?? []);
      if (todayBookings.error || weekCourses.error || activeCards.error || monthBookings.error || upcomingRes.error || recentRes.error) {
        setRecentError("Buchungsdaten konnten nicht vollständig geladen werden.");
      }

      const recentRows = recentRes.data ?? [];
      const recentUserIds = Array.from(new Set(recentRows.map((r: any) => r.user_id).filter(Boolean)));
      const recentCourseIds = Array.from(new Set(recentRows.map((r: any) => r.course_id).filter(Boolean)));
      let recentProfileMap: Record<string, any> = {};
      let recentCourseMap: Record<string, any> = {};

      if (recentUserIds.length) {
        const { data: profs, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", recentUserIds);
        if (profilesError) {
          setRecentError("Kundendaten konnten nicht geladen werden.");
        }
        recentProfileMap = Object.fromEntries((profs ?? []).map((p: any) => [p.user_id, p]));
      }

      if (recentCourseIds.length) {
        const { data: courses, error: coursesError } = await supabase
          .from("courses")
          .select("id, title, start_time")
          .in("id", recentCourseIds);
        if (coursesError) {
          setRecentError("Kursdaten konnten nicht geladen werden.");
        }
        recentCourseMap = Object.fromEntries((courses ?? []).map((c: any) => [c.id, c]));
      }

      setRecentBookings(recentRows.map((r: any) => ({ ...r, profiles: recentProfileMap[r.user_id], courses: recentCourseMap[r.course_id] })));
      setLoading(false);
    })();
  }, [authLoading, user]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-foreground">Übersicht</h1>
          <p className="text-sm text-muted-foreground">Willkommen zurück im Backoffice.</p>
        </div>
        <div className="flex gap-2">
          {(isAdmin || isTrainer) && (
            <Link to="/admin/my-courses"><Button size="sm"><Plus className="h-4 w-4 mr-1" />Kurs erstellen</Button></Link>
          )}
          {isAdmin && (
            <>
              <Link to="/admin/trainers"><Button variant="outline" size="sm"><UserCog className="h-4 w-4 mr-1" />Trainer</Button></Link>
              <Link to="/admin/course-types"><Button variant="outline" size="sm"><Palette className="h-4 w-4 mr-1" />Kursarten</Button></Link>
            </>
          )}
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">{k.label}</p>
                  <p className="font-display text-3xl mt-2 text-foreground">{loading ? "–" : k.value}</p>
                  {k.sub && <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>}
                </div>
                <k.icon className="h-5 w-5 text-primary" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Nächste Kurse</CardTitle>
            <Link to="/admin/courses" className="text-xs text-primary hover:underline">alle ansehen</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-sm text-muted-foreground">Laden…</p> :
              upcoming.length === 0 ? <p className="text-sm text-muted-foreground">Keine kommenden Kurse.</p> :
              upcoming.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-border last:border-0 pb-2 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(c.start_time), "EEE, d. MMM · HH:mm", { locale: de })}
                      {c.trainers && ` · ${c.trainers.first_name} ${c.trainers.last_name}`}
                    </p>
                  </div>
                  {c.course_types && <Badge variant="secondary" className="text-xs">{c.course_types.name}</Badge>}
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Letzte Buchungen</CardTitle>
            {(isAdmin) && <Link to="/admin/bookings" className="text-xs text-primary hover:underline">alle ansehen</Link>}
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? <p className="text-sm text-muted-foreground">Laden…</p> :
              recentError ? <p className="text-sm text-destructive">{recentError}</p> :
              recentBookings.length === 0 ? <p className="text-sm text-muted-foreground">Noch keine Buchungen.</p> :
              recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b border-border last:border-0 pb-2 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">
                      {`${b.profiles?.first_name ?? ""} ${b.profiles?.last_name ?? ""}`.trim() || "Kunde"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {b.courses?.title ?? "Kurs"} · {format(parseISO(b.created_at), "d. MMM HH:mm", { locale: de })}
                    </p>
                  </div>
                  <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                    {Number(b.amount_paid).toFixed(2)} €
                  </Badge>
                </div>
              ))
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
