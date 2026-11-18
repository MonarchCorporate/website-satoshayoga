import { useEffect } from "react";

export default function Impressum() {
  useEffect(() => {
    document.title = "Impressum – Santosha Yoga by Tessa";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "Impressum von Santosha Yoga by Tessa – Angaben gemäß §5 TMG.";
    if (meta) meta.setAttribute("content", desc);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = desc;
      document.head.appendChild(m);
    }
  }, []);

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl md:text-5xl text-[hsl(var(--foreground))] mb-10">Impressum</h1>

        <section className="space-y-8 text-[hsl(var(--foreground))]/90 leading-relaxed">
          <div>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-2">Angaben gemäß §5 TMG</h2>
            <address className="not-italic text-[hsl(var(--muted-foreground))]">
              Tessa Ratke<br />
              Querweg 12<br />
              25746 Süderholm
            </address>
          </div>

          <div>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-2">Kontakt</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Telefon: <a href="tel:+4915128085383" className="text-[hsl(var(--primary))] hover:underline">+49 151 28085383</a><br />
              E-Mail: <a href="mailto:info@yoga-heide.de" className="text-[hsl(var(--primary))] hover:underline">info@yoga-heide.de</a>
            </p>
          </div>

          <div>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-2">Verantwortlich für den Inhalt nach §55 Abs. 2 RStV</h2>
            <address className="not-italic text-[hsl(var(--muted-foreground))]">
              Tessa Ratke<br />
              Querweg 12<br />
              25746 Süderholm
            </address>
          </div>

          <div>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-2">Kleinunternehmerregelung gemäß §19 UStG</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Wir möchten Sie darauf hinweisen, dass wir als Kleinunternehmer im Sinne von §19 UStG keine Umsatzsteuer ausweisen.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
