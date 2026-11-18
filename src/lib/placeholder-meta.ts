import {
  User,
  UserSquare,
  Mail,
  Link as LinkIcon,
  KeyRound,
  Building2,
  Calendar,
  Clock,
  MapPin,
  BookOpen,
  UserCircle,
  CreditCard,
  Coins,
  CalendarClock,
  Euro,
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  Hash,
  RefreshCcw,
  Braces,
  type LucideIcon,
} from "lucide-react";

export interface PlaceholderMeta {
  label: string;
  icon: LucideIcon;
  sample?: string;
}

export const PLACEHOLDER_META: Record<string, PlaceholderMeta> = {
  site_name: { label: "Site-Name", icon: Building2, sample: "Santosha Yoga" },
  customer_first_name: { label: "Vorname", icon: User, sample: "Tessa" },
  customer_last_name: { label: "Nachname", icon: UserSquare, sample: "Ratke" },
  email: { label: "E-Mail", icon: Mail, sample: "kunde@beispiel.de" },
  new_email: { label: "Neue E-Mail", icon: Mail, sample: "neu@beispiel.de" },
  confirmation_url: { label: "Bestätigungs-Link", icon: LinkIcon },
  token: { label: "Token", icon: KeyRound },
  dashboard_url: { label: "Dashboard-Link", icon: LayoutDashboard },

  course_title: { label: "Kursname", icon: BookOpen, sample: "Hatha Yoga" },
  course_date: { label: "Kursdatum", icon: Calendar, sample: "Mi, 24. Juli 2026" },
  course_time: { label: "Kurszeit", icon: Clock, sample: "17:00 – 18:00" },
  course_location: { label: "Kursort", icon: MapPin, sample: "Studio Heide" },
  instructor_name: { label: "Trainer:in", icon: UserCircle, sample: "Tessa" },

  card_type: { label: "Kartentyp", icon: CreditCard, sample: "10er-Karte" },
  credits: { label: "Guthaben", icon: Coins, sample: "10" },
  expires_at: { label: "Gültig bis", icon: CalendarClock, sample: "31.12.2026" },
  amount_paid: { label: "Bezahlter Betrag", icon: Euro, sample: "150,00 €" },
  payment_method: { label: "Zahlart", icon: Wallet, sample: "PayPal" },
  refund_info: { label: "Erstattungs-Info", icon: RefreshCcw },

  order_number: { label: "Bestell-Nr.", icon: Hash, sample: "SY-2026-042" },
  order_total: { label: "Bestellsumme", icon: Euro, sample: "150,00 €" },
  invoice_number: { label: "Rechnungs-Nr.", icon: Hash, sample: "RE-2026-042" },
  invoice_url: { label: "Rechnung (PDF)", icon: Receipt },
};

export function getPlaceholderMeta(key: string): PlaceholderMeta {
  return (
    PLACEHOLDER_META[key] ?? {
      label: key.replace(/_/g, " "),
      icon: Braces,
    }
  );
}
