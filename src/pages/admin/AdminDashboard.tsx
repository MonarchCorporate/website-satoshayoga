import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Users, BookOpen, Mail, CreditCard, UserCog, Palette, Settings } from "lucide-react";

const tiles = [
  { title: "Kursplanung", icon: CalendarDays, to: "/admin/courses", description: "Kurse erstellen & verwalten" },
  { title: "Kursarten", icon: Palette, to: "/admin/course-types", description: "Kursarten anlegen & bearbeiten" },
  { title: "Trainer", icon: UserCog, to: "/admin/trainers", description: "Trainer anlegen & verwalten" },
  { title: "Buchungen", icon: BookOpen, to: "/admin/bookings", description: "Alle Buchungen einsehen" },
  { title: "Kunden", icon: Users, to: "/admin/customers", description: "Kundenliste & Verwaltung" },
  { title: "Karten", icon: CreditCard, to: "/admin/cards", description: "5er/10er-Karten Übersicht" },
  { title: "E-Mail Templates", icon: Mail, to: "/admin/emails", description: "E-Mail-Vorlagen bearbeiten" },
  { title: "Einstellungen", icon: Settings, to: "/admin/settings", description: "PayPal & weitere Einstellungen" },
];

export default function AdminDashboard() {
  return (
    <div className="container py-8">
      <h1 className="font-display text-4xl font-semibold mb-8">Backoffice</h1>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.to} to={tile.to}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardHeader className="flex flex-row items-center gap-3">
                <tile.icon className="h-6 w-6 text-primary" />
                <CardTitle className="text-lg">{tile.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{tile.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
