import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import CoursesTable from "@/components/admin/CoursesTable";

export default function MyCourses() {
  const { user, isAdmin } = useAuth();
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("trainers").select("id").eq("user_id", user.id).maybeSingle();
      setTrainerId(data?.id ?? null);
      setLoaded(true);
    })();
  }, [user]);

  if (!loaded) return <div className="p-6 text-muted-foreground">Laden…</div>;

  if (!trainerId && !isAdmin) {
    return (
      <div className="p-6">
        <h1 className="font-display text-3xl mb-2">Meine Kurse</h1>
        <p className="text-muted-foreground">
          Dein Account ist noch nicht mit einem Trainerprofil verknüpft. Bitte wende dich an einen Admin.
        </p>
      </div>
    );
  }

  return <CoursesTable scope="trainer" trainerId={trainerId} title="Meine Kurse" />;
}
