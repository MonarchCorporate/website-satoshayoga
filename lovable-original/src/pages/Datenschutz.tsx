import { useEffect } from "react";

export default function Datenschutz() {
  useEffect(() => {
    document.title = "Datenschutzerklärung – Santosha Yoga by Tessa";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "Datenschutzerklärung von Santosha Yoga by Tessa nach DSGVO.";
    if (meta) meta.setAttribute("content", desc);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = desc;
      document.head.appendChild(m);
    }
  }, []);

  const stand = new Date().toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl md:text-5xl text-[hsl(var(--foreground))] mb-4">Datenschutzerklärung</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))] mb-10">Stand: {stand}</p>

        <div className="space-y-10 text-[hsl(var(--foreground))]/90 leading-relaxed">

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">1. Verantwortlicher</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Verantwortlich für die Datenverarbeitung im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:
            </p>
            <address className="not-italic mt-3 text-[hsl(var(--muted-foreground))]">
              Tessa Ratke<br />
              Querweg 12<br />
              25746 Süderholm<br />
              Telefon: +49 151 28085383<br />
              E-Mail: <a href="mailto:info@yoga-heide.de" className="text-[hsl(var(--primary))] hover:underline">info@yoga-heide.de</a>
            </address>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">2. Allgemeine Hinweise</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Der Schutz Ihrer persönlichen Daten ist uns ein wichtiges Anliegen. Wir verarbeiten Ihre personenbezogenen
              Daten ausschließlich auf Grundlage der gesetzlichen Bestimmungen (DSGVO, BDSG, TTDSG). In dieser
              Datenschutzerklärung informieren wir Sie über die wichtigsten Aspekte der Datenverarbeitung im Rahmen
              unseres Buchungsportals.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">3. Beim Besuch der Website</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Bei jedem Aufruf unserer Website werden technisch notwendige Daten in Server-Logfiles erhoben (IP-Adresse,
              Datum und Uhrzeit, aufgerufene Seite, Browser, Betriebssystem). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
              DSGVO (berechtigtes Interesse an einem stabilen, sicheren Betrieb). Die Daten werden nach kurzer Zeit
              automatisch gelöscht und nicht mit anderen Datenquellen zusammengeführt.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">4. Cookies & lokale Speicherung</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Wir verwenden technisch notwendige Cookies und Einträge im lokalen Speicher Ihres Browsers, um Ihre
              Anmeldung, Ihren Warenkorb sowie Spracheinstellungen zu speichern. Diese Daten verlassen Ihr Gerät nicht
              ohne Ihr Zutun. Rechtsgrundlage: §25 Abs. 2 TTDSG i. V. m. Art. 6 Abs. 1 lit. b DSGVO.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">5. Registrierung & Kundenkonto</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Für die Nutzung des Buchungsportals legen Sie ein Kundenkonto an. Wir verarbeiten dabei E-Mail-Adresse,
              Name, Kontaktdaten und ein verschlüsseltes Passwort. Die Daten werden in unserer Backend-Infrastruktur
              (Lovable Cloud / Supabase, gehostet in der EU) gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO
              (Vertragserfüllung).
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">6. Buchungen & Kursteilnahme</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Bei jeder Kursbuchung speichern wir Name, Kontaktdaten, gebuchte Kurse, gewählte Karten (5er/10er-Pass)
              sowie Termin- und Stornierungsdaten. Diese Daten benötigen wir zur Vertragsabwicklung und für gesetzliche
              Aufbewahrungspflichten. Stornierungen sind gemäß unserer Stornierungsregelung möglich.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">7. Zahlungsabwicklung</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Zahlungen werden über externe Zahlungsdienstleister abgewickelt: PayPal (PayPal (Europe) S.à r.l. et Cie,
              S.C.A., Luxemburg) sowie ggf. Sofort und Klarna. Dabei werden die zur Abwicklung notwendigen Daten direkt
              an den jeweiligen Anbieter übermittelt. Es gelten zusätzlich deren Datenschutzbestimmungen. Wir selbst
              speichern keine vollständigen Zahlungsdaten.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">8. E-Mails & Newsletter</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Wir versenden transaktionale E-Mails (z. B. Buchungs- und Stornierungsbestätigungen, Rechnungen) auf
              Grundlage von Art. 6 Abs. 1 lit. b DSGVO. Den Newsletter erhalten Sie nur nach ausdrücklicher Einwilligung
              (Art. 6 Abs. 1 lit. a DSGVO). Newsletter enthalten Tracking-Pixel und Klick-Tracking, um Reichweite und
              Inhalte zu verbessern. Sie können sich jederzeit über den Abmeldelink in jeder E-Mail oder per Nachricht
              an info@yoga-heide.de abmelden. Abmeldungen werden in einer Suppression-Liste gespeichert, um künftige
              Zustellungen zu verhindern.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">9. Medical-Yoga-Anfrage</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Bei einer Anfrage für Medical Yoga können Sie freiwillig Angaben zu Ihrem Gesundheitszustand machen. Diese
              besonderen Kategorien personenbezogener Daten (Art. 9 DSGVO) verarbeiten wir ausschließlich auf Grundlage
              Ihrer ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO) und ausschließlich zum Zweck der Beurteilung
              und Durchführung der Kursteilnahme. Die Einwilligung können Sie jederzeit widerrufen.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">10. Rechnungen</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Rechnungen werden als PDF erzeugt und gemäß den steuer- und handelsrechtlichen Aufbewahrungsfristen
              (i. d. R. 10 Jahre, §147 AO) gespeichert. Rechtsgrundlage: Art. 6 Abs. 1 lit. c DSGVO.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">11. Eingebettetes YouTube-Video</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Auf der Startseite ist ein Video von YouTube im erweiterten Datenschutzmodus
              (youtube-nocookie.com) eingebunden. YouTube wird betrieben von Google Ireland Limited. Beim Aufruf werden
              Daten (u. a. IP-Adresse) an Google übertragen. Im erweiterten Datenschutzmodus erfolgt nach Angaben von
              YouTube keine Cookie-Setzung, solange Sie das Video nicht abspielen. Weitere Informationen:{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(var(--primary))] hover:underline"
              >
                policies.google.com/privacy
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">12. Ihre Rechte</h2>
            <p className="text-[hsl(var(--muted-foreground))]">Sie haben jederzeit das Recht auf:</p>
            <ul className="list-disc pl-6 mt-3 space-y-1 text-[hsl(var(--muted-foreground))]">
              <li>Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)</li>
              <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
              <li>Löschung Ihrer Daten (Art. 17 DSGVO)</li>
              <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li>Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)</li>
              <li>Widerruf einer erteilten Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
              <li>Beschwerde bei einer Datenschutz-Aufsichtsbehörde (Art. 77 DSGVO)</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">13. Kontakt für Datenschutzanfragen</h2>
            <p className="text-[hsl(var(--muted-foreground))]">
              Für Fragen zum Datenschutz und zur Wahrnehmung Ihrer Rechte erreichen Sie uns unter{" "}
              <a href="mailto:info@yoga-heide.de" className="text-[hsl(var(--primary))] hover:underline">
                info@yoga-heide.de
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
