import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";

type Row = {
  id: string;
  course_id: string;
  access_type: "one_time" | "subscription";
  status: string;
  current_period_end: string | null;
  grace_until: string | null;
  paypal_subscription_id: string | null;
  video_courses: { id: string; title: string; slug: string; cover_image_url: string | null };
};

export default function MyVideoCourses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("video_course_access" as any)
      .select("*, video_courses(id, title, slug, cover_image_url)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setRows(((data as any) ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const cancelSub = async (r: Row) => {
    if (!confirm("Abo wirklich kündigen? Zugang bleibt bis zum Ende der bezahlten Periode bestehen.")) return;
    setCancelling(r.id);
    const { data, error } = await supabase.functions.invoke("paypal-cancel-course-subscription", {
      body: { access_id: r.id },
    });
    setCancelling(null);
    if (error || (data as any)?.error) {
      toast.error((error?.message) || (data as any)?.error);
      return;
    }
    toast.success("Abo gekündigt");
    fetchData();
  };

  const statusBadge = (r: Row) => {
    const now = Date.now();
    if (r.status === "pending_payment") return <Badge variant="secondary">Warte auf Zahlungseingang</Badge>;
    if (r.status === "active") return <Badge>Aktiv</Badge>;
    if (r.status === "grace") {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">Kulanz bis {r.grace_until && format(new Date(r.grace_until), "dd.MM.yy", { locale: de })}</Badge>;
    }
    if (r.status === "cancelled" && r.current_period_end && new Date(r.current_period_end).getTime() > now) {
      return <Badge variant="outline">Läuft bis {format(new Date(r.current_period_end), "dd.MM.yy", { locale: de })}</Badge>;
    }
    return <Badge variant="outline" className="text-muted-foreground">Abgelaufen</Badge>;
  };


  return (
    <div className="container py-10 space-y-6">
      <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
        <Video className="h-7 w-7 text-primary" /> Meine Online-Kurse
      </h1>

      {loading ? (
        <p className="text-muted-foreground">Laden…</p>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-muted-foreground">Du hast noch keine Online-Kurse gekauft.
          <Link to="/online-kurse" className="ml-2 underline">Zum Katalog</Link>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              {r.video_courses.cover_image_url && (
                <img src={r.video_courses.cover_image_url} alt="" className="aspect-video w-full object-cover" />
              )}
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg">{r.video_courses.title}</h3>
                  {statusBadge(r)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.access_type === "one_time" ? "Einmalkauf" : "Abo"}
                  {r.access_type === "subscription" && r.current_period_end && r.status === "active" &&
                    ` · Verlängerung: ${format(new Date(r.current_period_end), "dd.MM.yyyy", { locale: de })}`}
                </div>
                <div className="flex gap-2">
                  {r.status === "pending_payment" ? (
                    <Button className="w-full" size="sm" disabled variant="outline">
                      Nach Zahlungseingang verfügbar
                    </Button>
                  ) : (
                    <Link to={`/meine-online-kurse/${r.video_courses.slug}`} className="flex-1">
                      <Button className="w-full" size="sm">Ansehen</Button>
                    </Link>
                  )}
                  {r.access_type === "subscription" && r.paypal_subscription_id && r.status !== "cancelled" && r.status !== "expired" && r.status !== "pending_payment" && (
                    <Button size="sm" variant="outline" onClick={() => cancelSub(r)} disabled={cancelling === r.id}>
                      <X className="h-4 w-4 mr-1" />Kündigen
                    </Button>
                  )}
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
