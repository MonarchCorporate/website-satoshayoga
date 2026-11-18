import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireStaffOrAdmin?: boolean;
  requireBackoffice?: boolean; // admin OR staff OR trainer
}

export default function ProtectedRoute({ children, requireAdmin, requireStaffOrAdmin, requireBackoffice }: Props) {
  const { user, isAdmin, isStaff, isTrainer, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">Laden…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/portal" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/" replace />;
  if (requireStaffOrAdmin && !isAdmin && !isStaff) return <Navigate to="/" replace />;
  if (requireBackoffice && !isAdmin && !isStaff && !isTrainer) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
