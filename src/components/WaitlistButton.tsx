import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Hourglass, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type Entry = { id: string; status: string };

interface Props {
  courseId: string;
  /** small variant for course cards */
  compact?: boolean;
  className?: string;
}

/**
 * Shown instead of the booking button when a course is fully booked:
 * customers can put themselves on the waitlist (or leave it again).
 */
export default function WaitlistButton({ courseId, compact, className }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setEntry(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("waitlist_entries" as any)
      .select("id, status")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setEntry((data as Entry | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, courseId]);

  const join = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.info("Bitte melde dich an, um dich auf die Warteliste zu setzen.");
      navigate("/portal");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("waitlist_entries" as any)
      .insert({ course_id: courseId, user_id: user.id })
      .select("id, status")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Du stehst bereits auf der Warteliste." : error.message);
      return;
    }
    setEntry(data as Entry);
    toast.success("Du stehst auf der Warteliste. Wir schicken dir eine E-Mail, sobald ein Platz frei wird.");
  };

  const leave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!entry) return;
    setBusy(true);
    const { error } = await supabase.from("waitlist_entries" as any).delete().eq("id", entry.id);
    setBusy(false);
    if (error) {
      toast.error("Konnte dich nicht austragen: " + error.message);
      return;
    }
    setEntry(null);
    toast.success("Du wurdest von der Warteliste entfernt.");
  };

  const onList = entry && (entry.status === "waiting" || entry.status === "notified");

  if (onList) {
    return (
      <div className={cn("flex items-center gap-2", compact ? "w-full" : "", className)}>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border border-[hsl(var(--primary))]/50 text-[hsl(var(--primary))]",
            compact ? "flex-1 justify-center text-[11px] h-7 px-2" : "px-3 py-2 text-sm",
          )}
        >
          <Hourglass className={compact ? "h-3 w-3" : "h-4 w-4"} />
          Auf der Warteliste
        </span>
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          className={compact ? "h-7 px-2 text-xs" : ""}
          disabled={busy}
          onClick={leave}
          title="Von der Warteliste austragen"
        >
          <X className="h-3.5 w-3.5" />
          {!compact && <span className="ml-1">Austragen</span>}
        </Button>
      </div>
    );
  }

  return (
    <Button
      size={compact ? "sm" : "default"}
      variant="outline"
      disabled={busy}
      onClick={join}
      className={cn(
        "border-[hsl(var(--primary))] text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--background))]",
        compact ? "w-full text-xs h-7" : "",
        className,
      )}
    >
      <Hourglass className={compact ? "h-3 w-3 mr-1" : "h-4 w-4 mr-2"} />
      Auf die Warteliste
    </Button>
  );
}
