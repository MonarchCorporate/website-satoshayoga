import { useState } from "react";
import { X } from "lucide-react";
import g1 from "@/assets/gallery/g1.jpg";
import g2 from "@/assets/gallery/g2.jpg";
import g3 from "@/assets/gallery/g3.jpg";
import g4 from "@/assets/gallery/g4.jpg";
import g5 from "@/assets/gallery/g5.jpg";
import g6 from "@/assets/gallery/g6.jpg";
import g7 from "@/assets/gallery/g7.jpg";
import g8 from "@/assets/gallery/g8.jpg";
import g9 from "@/assets/gallery/g9.jpg";
import g10 from "@/assets/gallery/g10.jpg";
import g11 from "@/assets/gallery/g11-studio.jpg";

const images = [
  { src: g5, alt: "Yoga Studio Innenraum mit Matten" },
  { src: g1, alt: "Lieblingsplatz Schild mit Lichterkette" },
  { src: g4, alt: "YOGA Schriftzug vor grüner Wand" },
  { src: g3, alt: "Holz-Skulptur im Meditationsraum" },
  { src: g2, alt: "Waschbereich mit Steinwaschbecken" },
  { src: g8, alt: "Gäste-WC mit Buddha Poster" },
  { src: g7, alt: "Eingangsbereich mit Garderobe" },
  { src: g6, alt: "Eingang zum Yoga Haus" },
  { src: g10, alt: "Terrasse mit Hängesessel" },
  { src: g9, alt: "Terrasse hinter dem Yoga Haus" },
  { src: g11, alt: "Yoga Studio mit Matten und Gartenblick" },
];

export default function Gallery() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="galerie" className="py-24 bg-[hsl(var(--background))]">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center mb-14">
          <p className="text-xs uppercase tracking-[0.3em] text-[hsl(var(--primary))] mb-4">Einblicke</p>
          <h2 className="font-display text-4xl md:text-5xl font-light text-[hsl(var(--foreground))]">Galerie</h2>
          <p className="mt-4 text-[hsl(var(--muted-foreground))] max-w-2xl mx-auto">
            Ein kleiner Blick in mein Studio, den Yoga-Raum und die kleinen Details, die Santosha Yoga ausmachen.
          </p>
        </div>

        <div className="columns-2 md:columns-3 lg:columns-4 gap-4 [column-fill:_balance]">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className="mb-4 block w-full break-inside-avoid overflow-hidden rounded-lg border border-[hsl(var(--border))] group focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
            >
              <img
                src={img.src}
                alt={img.alt}
                loading="lazy"
                className="w-full h-auto transition-transform duration-500 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      </div>

      {active !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setActive(null)}
        >
          <button
            className="absolute top-6 right-6 text-white/80 hover:text-white"
            onClick={() => setActive(null)}
            aria-label="Schließen"
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={images[active].src}
            alt={images[active].alt}
            className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
