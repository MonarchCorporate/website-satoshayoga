import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo.webp";
import tessaPortrait from "@/assets/tessa-portrait.webp";

import PublicCalendar from "@/components/landing/PublicCalendar";
import CourseTypesCarousel from "@/components/landing/CourseTypesCarousel";
import AnimatedHeroBackground from "@/components/AnimatedHeroBackground";
import Gallery from "@/components/landing/Gallery";

const navLinks = [
  { label: "Über mich", href: "#ueber-mich" },
  { label: "Kurse", href: "#kurse" },
  { label: "Kursplan", href: "#yogaplan" },
  { label: "Yoga Haus", href: "#yogahaus" },
  { label: "Galerie", href: "#galerie" },
  { label: "Anfahrt", href: "#anfahrt" },
];

const prices = [
  { label: "1× Yoga in der Gruppe", price: "16 €" },
  { label: "5er Karte", price: "75 €" },
  { label: "10er Karte", price: "140 €" },
  { label: "1:1 Medical Yoga", price: "50 €" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--border))]/30 bg-[hsl(var(--background))]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-20 items-center justify-between px-4">
          <Link to="/" className="flex items-center">
            <img src={logo} alt="Santosha Yoga by Tessa" className="h-14 w-auto" />
          </Link>

          <nav className="hidden lg:flex items-center gap-7">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-xs font-body uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/portal"
              className="text-xs font-body uppercase tracking-[0.18em] text-[hsl(var(--primary))] hover:text-[hsl(var(--sand-light))] transition-colors"
            >
              Kunden Login
            </Link>
          </nav>

          <button className="lg:hidden text-[hsl(var(--foreground))]" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menü">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileOpen && (
          <nav className="lg:hidden border-t border-[hsl(var(--border))]/30 px-4 py-6 flex flex-col gap-4 bg-[hsl(var(--background))]">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm uppercase tracking-wider text-[hsl(var(--foreground))]"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/portal"
              onClick={() => setMobileOpen(false)}
              className="text-sm uppercase tracking-wider text-[hsl(var(--primary))]"
            >
              Kunden Login
            </Link>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative min-h-[88vh] flex items-center overflow-hidden bg-[hsl(var(--ink))]">
        {/* Animierter Hintergrund passend zum Yoga-Theme */}
        <AnimatedHeroBackground />
        {/* Sanfter Verlauf für Lesbarkeit der Headline links */}
        <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink))]/70 via-[hsl(var(--ink))]/30 to-transparent" />
        <div className="container relative mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center py-20">
          <div className="space-y-6">
            <p className="text-lg font-display italic text-[hsl(var(--muted-foreground))]">Willkommen bei</p>
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-light leading-tight text-[hsl(var(--foreground))]">
              Santosha Yoga<br />
              <span className="italic text-[hsl(var(--primary))]">by Tessa</span>
            </h1>
            <p className="text-xl md:text-2xl font-display font-light text-[hsl(var(--foreground))] max-w-xl">
              Dein Weg zu mehr Balance, Zufriedenheit und innerer Stärke
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <a href="#ueber-mich">
                <Button
                  variant="outline"
                  className="border-[hsl(var(--primary))] text-[hsl(var(--sand-light))] hover:bg-[hsl(var(--primary))] hover:text-[hsl(var(--background))] rounded-none px-8 py-6 uppercase tracking-widest text-xs"
                >
                  Erfahre Mehr
                </Button>
              </a>
              <Button
                onClick={() => navigate("/portal")}
                className="bg-[hsl(var(--primary))] text-[hsl(var(--background))] hover:bg-[hsl(var(--primary))] rounded-none px-8 py-6 uppercase tracking-widest text-xs"
              >
                Kunden Login
              </Button>
            </div>
          </div>
          <div className="hidden lg:flex justify-center">
            <img src={logo} alt="" className="w-80 opacity-90" />
          </div>
        </div>
      </section>

      {/* Über mich */}
      <section id="ueber-mich" className="py-24 bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <p className="font-display italic text-[hsl(var(--primary))] text-lg">Willkommen, so schön, dass du hier bist.</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))]">Über mich…</h2>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Ich bin Tessa, Inhaberin von Santosha Yoga, und bringe viel Herz, Hingabe und Achtsamkeit in mein Studio und meine Stunden ein.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Mein Weg im Yoga begann mit der Ausbildung im Vinyasa Yoga – dynamisch, kraftvoll und genau mein Stil. Es folgte der Ausgleich durch Yin Yoga sowie Meditation und Achtsamkeit.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Im Rahmen meiner Aufbauausbildung mit dem Ziel der Krankenkassenzulassung erweitere ich mein Wissen kontinuierlich durch Fort- und Weiterbildungen, unter anderem im Sculpt Yoga und Smart Alignment. So entwickelt sich meine Ausrichtung im Yoga stetig weiter.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Yoga ist für mich weit mehr als Bewegung – es ist eine Verbindung von Körper, Geist und Seele und ein Raum für Ruhe, Kraft und Achtsamkeit.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Durch meine Tätigkeit als Fachkrankenschwester für Intensivpflege bringe ich ein tiefes Verständnis für den menschlichen Körper mit. Dieses fließt in meine 1:1 Medical Stunden mit ein.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              In meinem Studio (seit 2025) habe ich einen Ort geschaffen, an dem du ankommen, loslassen und auftanken kannst.
            </p>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Ich freue mich, dich auf deinem Weg begleiten zu dürfen.
            </p>
            <p className="font-display italic text-2xl text-[hsl(var(--primary))] pt-4">Namasté</p>
          </div>
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute -inset-4 border border-[hsl(var(--primary))]/40" />
              <div className="relative w-full max-w-md overflow-hidden">
                <img
                  src={tessaPortrait}
                  alt="Tessa – Yoga-Lehrerin"
                  className="w-full object-cover"
                  style={{ filter: "brightness(0.78) contrast(1.05) saturate(0.85) sepia(0.18)" }}
                />
                {/* Warmer Gold-Tint passend zum Header */}
                <div
                  className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(var(--primary) / 0.35), hsl(var(--ink) / 0.4))",
                  }}
                />
                {/* Dunkle Vignette für Tiefe */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at center, transparent 55%, hsl(var(--ink) / 0.6) 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Kurserklärung – drei Säulen */}
      <section id="kurserklaerung" className="py-24 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))]">
              Finde deine Balance <span className="italic text-[hsl(var(--primary))]">bei Santosha Yoga</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                title: "Individuelle Betreuung",
                text: "Jeder Körper ist einzigartig. Ich achte darauf, dass du die Übungen an deine individuellen Bedürfnisse anpassen kannst, damit du sicher und entspannt praktizieren kannst.",
              },
              {
                title: "Anfänger & Fortgeschrittene",
                text: "Egal, ob du Yoga zum ersten Mal ausprobierst oder deine Praxis vertiefen möchtest – bei mir bist du IMMER herzlich willkommen. Gemeinsam schaffen wir eine Basis für mehr Flexibilität, Kraft und Achtsamkeit.",
              },
              {
                title: "Körper & Geist",
                text: "Meine Kurse kombinieren fließende Bewegungen mit Atemtechniken und Meditation, um nicht nur deinen Körper zu stärken, sondern auch innere Ruhe und Klarheit zu fördern.",
              },
            ].map((c) => (
              <div key={c.title} className="border border-[hsl(var(--border))]/40 p-8 hover:border-[hsl(var(--primary))]/60 transition-colors">
                <h3 className="font-display text-2xl mb-4 text-[hsl(var(--primary))]">{c.title}</h3>
                <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Kurse */}
      <section id="kurse" className="py-24 bg-[hsl(var(--card))] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--card))] via-[hsl(var(--card))] to-[hsl(var(--background))]/10 pointer-events-none" />
        <div className="container mx-auto px-4 relative">
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-[hsl(var(--primary))] mb-4">Kurse im Überblick</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))]">
              Finde <span className="italic text-[hsl(var(--primary))]">deinen Kurs</span>
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] mt-3 max-w-xl mx-auto">
              Von dynamisch bis sanft – entdecke die unterschiedlichen Yoga-Stile und finde, was dich gerade ruft.
            </p>
          </div>
          <CourseTypesCarousel />
        </div>
      </section>

      {/* Yoga Plan – Kalender */}
      <section id="yogaplan" className="py-24 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-[hsl(var(--primary))] mb-4">Yogaplan</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))]">
              Kursplan & <span className="italic text-[hsl(var(--primary))]">Buchung</span>
            </h2>
            <p className="text-[hsl(var(--muted-foreground))] mt-3 max-w-xl mx-auto">
              Wähle eine Stunde im Kalender und buche direkt – mit PayPal oder deiner 5er/10er-Karte.
            </p>
          </div>
          <PublicCalendar />
        </div>
      </section>

      {/* Yoga Haus */}
      <section id="yogahaus" className="py-24 bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="font-display text-4xl md:text-5xl font-light text-center mb-4 text-[hsl(var(--foreground))]">
            Das Yogahaus
          </h2>
          <p className="text-center text-[hsl(var(--muted-foreground))] mb-16 italic font-display">… was du vielleicht wissen möchtest</p>

          <div className="space-y-8 text-[hsl(var(--muted-foreground))] leading-relaxed">
            <div>
              <h3 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">Alles, was du brauchst, ist schon da…</h3>
              <p>Für deine Yoga-Praxis ist bestens gesorgt: Matten, Klötze, Bolster und weitere Hilfsmittel stehen dir kostenlos zur Verfügung. Du musst theoretisch nichts mitbringen – nur dich selbst und bequeme Kleidung. Außerdem gibt es vor Ort ein Badezimmer, in dem du dich frisch machen kannst.</p>
              <p className="mt-3 text-sm text-[hsl(var(--muted-foreground))]">Bitte beachte, dass die Yoga-Kurse nicht für erkältete Personen oder Schwangere geeignet sind.</p>
            </div>

            <div>
              <h3 className="font-display text-2xl text-[hsl(var(--primary))] mb-4">Preise (je 75 Minuten)</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {prices.map((p) => (
                  <div key={p.label} className="flex justify-between border-b border-[hsl(var(--border))]/40 pb-2">
                    <span>{p.label}</span>
                    <span className="text-[hsl(var(--primary))] font-medium">{p.price}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm">​</p>
            </div>

            <div>
              <h3 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">Keine Vertragsbindung</h3>
              <p>Du kannst flexibel zwischen 5er- und 10er-Karten oder einzelnen buchbaren Stunden wählen. Flexibilität ist mir sehr wichtig, deswegen gibt es keine Verträge oder Abos.</p>
            </div>

            <div>
              <h3 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">Kooperation?</h3>
              <p>Du bist selbst Yoga-Lehrer*in und suchst einen Raum zum Unterrichten? Gerne vermiete ich dir mein Studio. Für mehr Informationen, melde dich sehr gerne bei mir.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Galerie */}
      <Gallery />

      {/* Anfahrt */}
      <section id="anfahrt" className="py-24 bg-[hsl(var(--background))]">
        <div className="container mx-auto px-4 max-w-5xl grid md:grid-cols-2 gap-12">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[hsl(var(--primary))] mb-4">So findest du zu Santosha Yoga</p>
            <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))] mb-6">Anfahrt & Parken</h2>
            <p className="text-[hsl(var(--muted-foreground))] leading-relaxed">
              Parkmöglichkeiten findest du an der Hauptstraße (B203), Rendsburger Str. beim „Erdbeerhäuschen". Von hier aus sind es ca. 160 m bis zum Studio. Bitte parke nicht direkt in der Straße des Studios, um die Anwohner nicht zu beeinträchtigen. Achte beim Parken darauf, ausreichend weit auf die Grasfläche zu fahren.
            </p>
            <p className="mt-3 text-[hsl(var(--muted-foreground))]">Vielen Dank für deine Unterstützung.</p>
          </div>
          <div className="space-y-4 text-[hsl(var(--foreground))]">
            <div>
              <p className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] mb-1">Adresse</p>
              <p>Querweg 12<br />25746 Süderholm</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] mb-1">E-Mail</p>
              <a href="mailto:info@yoga-heide.de" className="hover:text-[hsl(var(--primary))]">info@yoga-heide.de</a>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] mb-1">WhatsApp / Telefon</p>
              <p>+49 151 28085383</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-[hsl(var(--primary))] mb-1">Öffnungszeiten</p>
              <p>Nach Kursplan. Der Kursraum ist mind. 15 Minuten vorher für dich zugänglich.</p>
            </div>
          </div>
        </div>
        <div className="container mx-auto px-4 max-w-5xl mt-12">
          <iframe
            src="https://www.google.com/maps?q=Querweg+12,+25746+S%C3%BCderholm&z=16&output=embed"
            className="w-full aspect-video border border-[hsl(var(--primary))]/30"
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Standort Santosha Yoga - Querweg 12, Süderholm"
          />
        </div>
      </section>

      {/* Footer wird global durch AppLayout gerendert */}
    </div>
  );
}
