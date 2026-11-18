import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Video, PlayCircle, Lock, Ticket } from "lucide-react";
import { toast } from "sonner";


type Course = {
  id: string; title: string; slug: string; description: string | null;
  cover_image_url: string | null;
  access_model: "one_time" | "subscription";
  price_once: number | null; price_monthly: number | null; price_yearly: number | null;
};

type Lesson = {
  id: string; title: string; description: string | null;
  provider: string; duration_seconds: number | null;
  sort_order: number; is_free_preview: boolean;
};

export default function VideoCourseDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherInfo, setVoucherInfo] = useState<
    { code: string; discount_percent: number; discount_amount: number; applicable_amount: number } | null
  >(null);
  const [voucherChecking, setVoucherChecking] = useState(false);


  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("video_courses" as any).select("*").eq("slug", slug).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCourse(c as any);
      const { data: ls } = await supabase
        .from("video_lessons_public" as any)
        .select("*")
        .eq("course_id", (c as any).id)
        .order("sort_order");
      setLessons(((ls as any) ?? []) as Lesson[]);
      if (user) {
        const { data: ac } = await supabase
          .from("video_course_access" as any)
          .select("status, current_period_end, grace_until")
          .eq("course_id", (c as any).id).eq("user_id", user.id).maybeSingle();
        if (ac) {
          const a = ac as any;
          const now = Date.now();
          setHasAccess(
            a.status === "active" ||
            (a.status === "grace" && a.grace_until && new Date(a.grace_until).getTime() > now) ||
            (a.status === "cancelled" && a.current_period_end && new Date(a.current_period_end).getTime() > now),
          );
        }
      }
      setLoading(false);
    })();
  }, [slug, user]);

  const priceForMode = (mode: "one_time" | "monthly" | "yearly") => {
    if (!course) return 0;
    if (mode === "one_time") return Number(course.price_once ?? 0);
    if (mode === "monthly") return Number(course.price_monthly ?? 0);
    return Number(course.price_yearly ?? 0);
  };

  const applyVoucher = async (mode: "one_time" | "monthly" | "yearly") => {
    if (!course || !voucherCode.trim()) return;
    setVoucherChecking(true);
    const amount = priceForMode(mode);
    const { data, error } = await supabase.rpc("validate_voucher_cart" as any, {
      _code: voucherCode.trim(),
      _cart: [{ type: "video_course", ref_id: course.id, amount }],
    });
    setVoucherChecking(false);
    if (error) { toast.error(error.message); setVoucherInfo(null); return; }
    const r = data as any;
    if (!r?.ok) { toast.error(r?.error || "Code ungültig"); setVoucherInfo(null); return; }
    setVoucherInfo({
      code: r.code,
      discount_percent: Number(r.discount_percent),
      discount_amount: Number(r.discount_amount),
      applicable_amount: Number(r.applicable_amount),
    });
    toast.success(`Code akzeptiert: ${r.discount_percent}% Rabatt`);
  };

  const buy = async (mode: "one_time" | "monthly" | "yearly") => {
    if (!user) { navigate("/portal"); return; }
    if (!course) return;
    setBuying(mode);
    const { data, error } = await supabase.functions.invoke("paypal-create-course-purchase", {
      body: {
        course_id: course.id,
        mode,
        voucher_code: voucherInfo?.code || undefined,
        return_url: `${window.location.origin}/online-kurse/${course.slug}/return`,
        cancel_url: `${window.location.origin}/online-kurse/${course.slug}`,
      },
    });
    setBuying(null);
    if (error || (data as any)?.error) {
      toast.error((error?.message) || (data as any)?.error || "Fehler");
      return;
    }
    sessionStorage.setItem(
      `vc_purchase_${course.slug}`,
      JSON.stringify({
        kind: (data as any).kind,
        paypal_id: (data as any).paypal_order_id ?? (data as any).paypal_subscription_id,
        course_id: course.id,
      }),
    );
    window.location.href = (data as any).approve_url;
  };


  if (loading) return <div className="container py-10 text-muted-foreground">Laden…</div>;
  if (!course) return <div className="container py-10">Kurs nicht gefunden.</div>;

  return (
    <div className="container py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        {course.cover_image_url && (
          <img src={course.cover_image_url} alt={course.title} className="w-full aspect-video object-cover rounded-lg" />
        )}
        <div>
          <h1 className="font-display text-4xl font-semibold">{course.title}</h1>
          {course.description && <p className="mt-4 whitespace-pre-line text-muted-foreground">{course.description}</p>}
        </div>

        <div>
          <h2 className="font-display text-2xl mb-3">Inhalte ({lessons.length} Lektionen)</h2>
          <div className="space-y-2">
            {lessons.map((l, i) => (
              <Card key={l.id}>
                <CardContent className="p-3 flex items-center gap-3">
                  {l.is_free_preview || hasAccess
                    ? <PlayCircle className="h-5 w-5 text-primary" />
                    : <Lock className="h-5 w-5 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{i + 1}. {l.title}</div>
                    {l.description && <div className="text-xs text-muted-foreground line-clamp-1">{l.description}</div>}
                  </div>
                  {l.is_free_preview && <Badge variant="outline">Vorschau</Badge>}
                  {l.duration_seconds && (
                    <span className="text-xs text-muted-foreground">
                      {Math.floor(l.duration_seconds / 60)}:{String(l.duration_seconds % 60).padStart(2, "0")} min
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 space-y-4">
            {hasAccess ? (
              <>
                <Badge>Du hast Zugriff</Badge>
                <Link to={`/meine-online-kurse/${course.slug}`}>
                  <Button className="w-full"><Video className="h-4 w-4 mr-2" />Kurs ansehen</Button>
                </Link>
              </>
            ) : course.access_model === "one_time" ? (
              <>
                <div className="text-sm text-muted-foreground">Einmalkauf</div>
                {voucherInfo ? (
                  <div>
                    <div className="font-display text-3xl">
                      {(Number(course.price_once) - voucherInfo.discount_amount).toFixed(2)} €
                    </div>
                    <div className="text-xs text-muted-foreground line-through">
                      {Number(course.price_once).toFixed(2)} €
                    </div>
                  </div>
                ) : (
                  <div className="font-display text-3xl">{Number(course.price_once).toFixed(2)} €</div>
                )}
                <p className="text-xs text-muted-foreground">Unbegrenzter Zugang nach Kauf.</p>

                <VoucherInput
                  voucherCode={voucherCode}
                  setVoucherCode={setVoucherCode}
                  voucherInfo={voucherInfo}
                  setVoucherInfo={setVoucherInfo}
                  onApply={() => applyVoucher("one_time")}
                  checking={voucherChecking}
                />

                <Button className="w-full" onClick={() => buy("one_time")} disabled={!!buying}>
                  {buying ? "Lade PayPal…" : "Jetzt kaufen"}
                </Button>
              </>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">Wähle dein Abo</div>
                {course.price_monthly && (
                  <Button variant="outline" className="w-full justify-between" onClick={() => buy("monthly")} disabled={!!buying}>
                    <span>Monatlich</span>
                    <span className="font-medium">
                      {voucherInfo
                        ? `${Math.max(0, Number(course.price_monthly) * (1 - voucherInfo.discount_percent / 100)).toFixed(2)} € erste Zahlung`
                        : `${Number(course.price_monthly).toFixed(2)} €/Mo`}
                    </span>
                  </Button>
                )}
                {course.price_yearly && (
                  <Button variant="outline" className="w-full justify-between" onClick={() => buy("yearly")} disabled={!!buying}>
                    <span>Jährlich</span>
                    <span className="font-medium">
                      {voucherInfo
                        ? `${Math.max(0, Number(course.price_yearly) * (1 - voucherInfo.discount_percent / 100)).toFixed(2)} € erste Zahlung`
                        : `${Number(course.price_yearly).toFixed(2)} €/Jahr`}
                    </span>
                  </Button>
                )}

                <VoucherInput
                  voucherCode={voucherCode}
                  setVoucherCode={setVoucherCode}
                  voucherInfo={voucherInfo}
                  setVoucherInfo={setVoucherInfo}
                  onApply={() =>
                    applyVoucher(course.price_monthly ? "monthly" : "yearly")
                  }
                  checking={voucherChecking}
                />
                {voucherInfo ? (
                  <p className="text-[11px] text-muted-foreground">
                    Der Rabatt von {voucherInfo.discount_percent}% gilt für die erste Zahlung. Folgezahlungen erfolgen zum regulären Preis. Jederzeit kündbar.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Jederzeit im Mein-Bereich kündbar.</p>
                )}
              </>
            )}



            <p className="text-[10px] text-muted-foreground">Gemäß §19 UStG wird keine Umsatzsteuer ausgewiesen.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function VoucherInput(props: {
  voucherCode: string;
  setVoucherCode: (v: string) => void;
  voucherInfo: { code: string; discount_percent: number } | null;
  setVoucherInfo: (v: null) => void;
  onApply: () => void;
  checking: boolean;
}) {
  const { voucherCode, setVoucherCode, voucherInfo, setVoucherInfo, onApply, checking } = props;
  if (voucherInfo) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <div className="text-xs">
          <span className="font-mono font-medium">{voucherInfo.code}</span>
          <span className="text-muted-foreground"> · {voucherInfo.discount_percent}% Rabatt</span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setVoucherInfo(null); setVoucherCode(""); }}>
          Entfernen
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        placeholder="Gutschein-Code"
        value={voucherCode}
        onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
        className="font-mono h-9"
      />
      <Button size="sm" variant="outline" onClick={onApply} disabled={checking || !voucherCode.trim()}>
        <Ticket className="h-4 w-4 mr-1" />
        {checking ? "…" : "Einlösen"}
      </Button>
    </div>
  );
}
