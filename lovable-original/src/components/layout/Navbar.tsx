import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, User, ShoppingCart, LayoutDashboard, Menu, X, Home } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.webp";

export default function Navbar() {
  const { user, isAdmin, isStaff, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // Don't show navbar if user is not logged in
  if (!user) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-3">
          <img src={logo} alt="Santosha Yoga" className="h-10 w-auto opacity-80" />
          <span className="font-display text-xl font-semibold tracking-wide text-primary hidden sm:inline">
            Santosha Yoga
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Home className="inline h-4 w-4 mr-1" />
            Homepage
          </Link>
          <Link to="/schedule" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Kursplan
          </Link>
          <Link to="/shop" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Shop
          </Link>
          <Link to="/online-kurse" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Online-Kurse
          </Link>
          <Link to="/cart" className="relative text-muted-foreground hover:text-foreground transition-colors">
            <ShoppingCart className="h-5 w-5" />
          </Link>
          {(isAdmin || isStaff) && (
            <Link to="/admin" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <LayoutDashboard className="inline h-4 w-4 mr-1" />
              Backoffice
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <User className="h-4 w-4 mr-1" />
                Mein Bereich
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </nav>

        {/* Mobile toggle */}
        <button className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="flex flex-col gap-4 border-t border-border p-4 md:hidden animate-fade-in">
          <Link to="/" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Homepage</Link>
          <Link to="/schedule" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Kursplan</Link>
          <Link to="/shop" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Shop</Link>
          <Link to="/online-kurse" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Online-Kurse</Link>
          <Link to="/cart" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Warenkorb</Link>
          {(isAdmin || isStaff) && <Link to="/admin" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Backoffice</Link>}
          <Link to="/dashboard" onClick={() => setMobileOpen(false)} className="text-sm font-medium">Mein Bereich</Link>
          <button onClick={() => { handleSignOut(); setMobileOpen(false); }} className="text-sm font-medium text-left text-destructive">Abmelden</button>
        </nav>
      )}
    </header>
  );
}
