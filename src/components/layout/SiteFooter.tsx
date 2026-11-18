import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, ArrowRight } from "lucide-react";
import logo from "@/assets/logo.webp";
import ryt200 from "@/assets/ryt200.webp";

const navItems = [
  { label: "Über mich", href: "/#ueber-mich" },
  { label: "Kurse", href: "/#kurse" },
  { label: "Kursplan", href: "/#yogaplan" },
  { label: "Galerie", href: "/#galerie" },
  { label: "Anfahrt", href: "/#anfahrt" },
];

const legalItems = [
  { label: "Impressum", to: "/impressum" },
  { label: "Datenschutz", to: "/datenschutz" },
  { label: "AGB", to: "/agb" },
];

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden bg-[hsl(var(--ink))] border-t border-[hsl(var(--border))]/30">
      {/* Subtle gold glow top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 h-64 opacity-[0.07]"
        style={{
          background:
            "radial-gradient(ellipse at center, hsl(var(--primary)) 0%, transparent 60%)",
        }}
      />

      <div className="container relative mx-auto px-4 py-16 md:py-20">
        {/* Top: 4-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 md:gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Santosha Yoga" className="h-12 w-auto" />
              <div className="font-display text-xl text-[hsl(var(--foreground))] leading-tight">
                Santosha<br />
                <span className="italic text-[hsl(var(--primary))]">by Tessa</span>
              </div>
            </div>
            <p className="font-display italic text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
              Eine kleine Oase, in der du ankommen darfst.
            </p>
          </div>

          {/* Navigation */}
          <nav aria-label="Footer Navigation">
            <h3 className="font-display uppercase tracking-[0.25em] text-xs text-[hsl(var(--primary))] mb-4">
              Entdecken
            </h3>
            <ul className="space-y-2.5">
              {navItems.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="group inline-flex items-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
                  >
                    <span className="relative">
                      {item.label}
                      <span className="absolute left-0 -bottom-0.5 h-px w-0 bg-[hsl(var(--primary))] transition-all duration-300 group-hover:w-full" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal */}
          <nav aria-label="Rechtliches">
            <h3 className="font-display uppercase tracking-[0.25em] text-xs text-[hsl(var(--primary))] mb-4">
              Rechtliches
            </h3>
            <ul className="space-y-2.5">
              {legalItems.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="group inline-flex items-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
                  >
                    <span className="relative">
                      {item.label}
                      <span className="absolute left-0 -bottom-0.5 h-px w-0 bg-[hsl(var(--primary))] transition-all duration-300 group-hover:w-full" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div>
            <h3 className="font-display uppercase tracking-[0.25em] text-xs text-[hsl(var(--primary))] mb-4">
              Kontakt
            </h3>
            <ul className="space-y-3 text-sm text-[hsl(var(--muted-foreground))]">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 mt-0.5 text-[hsl(var(--primary))] shrink-0" />
                <span>
                  Querweg 12<br />
                  25746 Süderholm
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                <a href="tel:+4915128085383" className="hover:text-[hsl(var(--primary))] transition-colors">
                  +49 151 28085383
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-[hsl(var(--primary))] shrink-0" />
                <a href="mailto:info@yoga-heide.de" className="hover:text-[hsl(var(--primary))] transition-colors">
                  info@yoga-heide.de
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* RYT 200 Badge — featured */}
        <div className="mt-14 md:mt-16 flex flex-col items-center text-center">
          <div className="relative group">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full blur-2xl opacity-30 group-hover:opacity-50 transition-opacity"
              style={{ background: "hsl(var(--primary))" }}
            />
            <div className="relative rounded-full p-4 bg-[hsl(var(--background))]/40 ring-1 ring-[hsl(var(--primary))]/40 transition-transform duration-500 group-hover:-translate-y-1 group-hover:ring-[hsl(var(--primary))]/70">
              <img
                src={ryt200}
                alt="Yoga Alliance Certified RYT 200"
                className="h-28 w-28 md:h-32 md:w-32 object-contain"
              />
            </div>
          </div>
          <p className="mt-4 font-display italic text-base text-[hsl(var(--foreground))]/90">
            Yoga Alliance · Certified RYT 200
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[hsl(var(--muted-foreground))]">
            Geprüfte Yoga-Lehrerin
          </p>
        </div>

        {/* Gold divider */}
        <div className="mt-14 h-px w-full bg-gradient-to-r from-transparent via-[hsl(var(--primary))]/40 to-transparent" />

        {/* Bottom bar */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            © {year} Santosha Yoga by Tessa. Alle Rechte vorbehalten.
          </p>
          <Link
            to="/portal"
            className="group inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[hsl(var(--primary))] hover:text-[hsl(var(--sand-light))] transition-colors"
          >
            Kunden Login
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </footer>
  );
}
