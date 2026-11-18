import { Outlet, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { BackofficeSidebar } from "./BackofficeSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Home } from "lucide-react";

export default function BackofficeLayout() {
  const { user, signOut, isAdmin, isStaff, isTrainer } = useAuth();
  const navigate = useNavigate();

  const role = isAdmin ? "Admin" : isTrainer ? "Trainer" : isStaff ? "Staff" : "Nutzer";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <BackofficeSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background/80 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <span className="font-display text-lg text-foreground">Santosha Backoffice</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                <Home className="h-4 w-4 mr-1" />
                Website
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/20 grid place-items-center">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="hidden sm:flex flex-col items-start leading-tight">
                      <span className="text-xs">{user?.email}</span>
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{role}</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Mein Konto</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {(isTrainer || isAdmin) && (
                    <DropdownMenuItem onClick={() => navigate("/admin/my-profile")}>
                      <UserIcon className="h-4 w-4 mr-2" /> Mein Profil
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    Kunden-Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Abmelden
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
