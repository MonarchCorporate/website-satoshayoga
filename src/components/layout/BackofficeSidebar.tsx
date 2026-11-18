import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  Users,
  CreditCard,
  UserCog,
  Palette,
  Mail,
  Settings,
  User as UserIcon,
  Package,
  ShoppingCart,
  Megaphone,
  Wallet,
  Receipt,
  Ticket,
  Video,
} from "lucide-react";
import logo from "@/assets/logo.webp";
import { Sparkles } from "lucide-react";

type Item = { title: string; url: string; icon: any; badge?: number };

export function BackofficeSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { pathname } = useLocation();
  const { isAdmin, isStaff, isTrainer } = useAuth();
  const [openInvoiceCount, setOpenInvoiceCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .eq("payment_method", "invoice");
      if (!cancelled) setOpenInvoiceCount(count ?? 0);
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isAdmin, pathname]);

  const overview: Item[] = [{ title: "Übersicht", url: "/admin", icon: LayoutDashboard }];

  const trainerItems: Item[] = isTrainer || isAdmin
    ? [
        ...(isTrainer ? [{ title: "Erste Schritte", url: "/admin/welcome", icon: Sparkles }] : []),
        { title: "Meine Kurse", url: "/admin/my-courses", icon: CalendarDays },
        { title: "Mein Verdienst", url: "/admin/my-earnings", icon: Wallet },
        { title: "Mein Profil", url: "/admin/my-profile", icon: UserIcon },
      ]
    : [];

  const adminItems: Item[] = isAdmin
    ? [
        { title: "Kursplanung", url: "/admin/courses", icon: CalendarDays },
        { title: "Videokurse", url: "/admin/video-courses", icon: Video },
        { title: "Kursarten", url: "/admin/course-types", icon: Palette },
        { title: "Trainer", url: "/admin/trainers", icon: UserCog },
        { title: "Trainer-Abrechnungen", url: "/admin/trainer-payouts", icon: Receipt },
      ]
    : [];

  const opsItems: Item[] = (isAdmin || isStaff)
    ? [
        { title: "Buchungen", url: "/admin/bookings", icon: BookOpen },
        ...(isAdmin
          ? [
              { title: "Kunden", url: "/admin/customers", icon: Users },
              { title: "Karten", url: "/admin/cards", icon: CreditCard },
            ]
          : []),
      ]
    : [];

  const shopItems: Item[] = isAdmin
    ? [
        { title: "Produkte", url: "/admin/products", icon: Package },
        { title: "Bestellungen", url: "/admin/orders", icon: ShoppingCart, badge: openInvoiceCount },
        { title: "Gutscheine", url: "/admin/vouchers", icon: Ticket },
      ]
    : [];

  const settingsItems: Item[] = isAdmin
    ? [
        { title: "E-Mails", url: "/admin/emails", icon: Mail },
        { title: "Newsletter", url: "/admin/newsletter", icon: Megaphone },
        { title: "Einstellungen", url: "/admin/settings", icon: Settings },
      ]
    : [];

  const isActive = (url: string) =>
    url === "/admin" ? pathname === "/admin" : pathname.startsWith(url);

  const renderGroup = (label: string, items: Item[]) =>
    items.length > 0 && (
      <SidebarGroup>
        {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((it) => (
              <SidebarMenuItem key={it.url}>
                <SidebarMenuButton asChild isActive={isActive(it.url)}>
                  <NavLink to={it.url} end={it.url === "/admin"}>
                    <it.icon className="h-4 w-4" />
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between gap-2">
                        <span>{it.title}</span>
                        {typeof it.badge === "number" && it.badge > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                            {it.badge}
                          </span>
                        )}
                      </span>
                    )}
                    {collapsed && typeof it.badge === "number" && it.badge > 0 && (
                      <span className="absolute top-1 right-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold">
                        {it.badge}
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <img src={logo} alt="Santosha" className="h-8 w-auto" />
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span className="font-display text-sm text-sidebar-foreground">Santosha Yoga</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Backoffice</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("Allgemein", overview)}
        {renderGroup("Mein Bereich", trainerItems)}
        {renderGroup("Verwaltung", adminItems)}
        {renderGroup("Operations", opsItems)}
        {renderGroup("Shop", shopItems)}
        {renderGroup("Konfiguration", settingsItems)}
      </SidebarContent>
    </Sidebar>
  );
}
