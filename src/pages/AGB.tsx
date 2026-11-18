import { useEffect } from "react";

export default function AGB() {
  useEffect(() => {
    document.title = "AGB – Santosha Yoga by Tessa";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "Allgemeine Geschäftsbedingungen von Santosha Yoga by Tessa.";
    if (meta) meta.setAttribute("content", desc);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = desc;
      document.head.appendChild(m);
    }
  }, []);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2 className="font-display text-2xl text-[hsl(var(--primary))] mb-3">{title}</h2>
      <div className="text-[hsl(var(--muted-foreground))] space-y-2">{children}</div>
    </section>
  );

  return (
    <main className="min-h-screen bg-[hsl(var(--background))] py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-3xl">
        <h1 className="font-display text-4xl md:text-5xl text-[hsl(var(--foreground))] mb-4">
          Allgemeine Geschäftsbedingungen (AGB)
        </h1>
        <address className="not-italic text-[hsl(var(--muted-foreground))] mb-12">
          Santosha Yoga by Tessa<br />
          Inhaber: Tessa Ratke<br />
          Querweg 12, 25746 Süderholm<br />
          E-Mail: <a href="mailto:info@yoga-heide.de" className="text-[hsl(var(--primary))] hover:underline">info@yoga-heide.de</a><br />
          Telefon: +49 151 28085383
        </address>

        <div className="space-y-10">
          <Section title="1. Geltungsbereich">
            <p>
              Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Leistungen und Angebote von Santosha Yoga by
              Tessa, insbesondere für Yogakurse, Workshops, Personal Yoga und sonstige Veranstaltungen. Mit der Buchung
              einer Leistung erkennt der Kunde die AGB an.
            </p>
          </Section>

          <Section title="2. Anmeldung und Buchung">
            <ul className="list-disc pl-6 space-y-1">
              <li>Die Anmeldung zu Yogakursen erfolgt über den Stundenplan auf der Website.</li>
              <li>Für die Anmeldung ist die Angabe personenbezogener Daten erforderlich (z. B. Name, E-Mail-Adresse, Zahlungsinformationen).</li>
              <li>Buchungen sind verbindlich und gelten erst nach vollständiger Bezahlung als bestätigt.</li>
            </ul>
          </Section>

          <Section title="3. Leistungen und Gültigkeit">
            <ul className="list-disc pl-6 space-y-1">
              <li>Angeboten werden Gruppenstunden, 5er- und 10er-Karten sowie Personal Yoga auf Anfrage.</li>
              <li>5er- und 10er-Karten sind maximal 1 Jahr gültig.</li>
              <li>Sie gelten ausschließlich für reguläre Gruppen-Yoga-Stunden zum Preis von 16 € pro Einheit und sind nicht für Specials oder höherpreisige Veranstaltungen einlösbar.</li>
              <li>Bei Erkrankung kann die Gültigkeit verlängert werden.</li>
              <li>Karten sind übertragbar, jedoch nicht erstattungsfähig.</li>
            </ul>
          </Section>

          <Section title="4. Zahlungsbedingungen">
            <ul className="list-disc pl-6 space-y-1">
              <li>Die Zahlung erfolgt ausschließlich über die Website via PayPal oder Kreditkarte. In Einzelfällen sind auch Überweisungen möglich.</li>
              <li>Der vollständige Betrag ist bei der Anmeldung zur Stunde fällig.</li>
            </ul>
          </Section>

          <Section title="5. Stornierung und Rücktritt">
            <ul className="list-disc pl-6 space-y-1">
              <li>Eine Stornierung gebuchter Stunden ist bis 24 Stunden vor Kursbeginn kostenfrei möglich.</li>
              <li>Bei einer späteren Absage oder Nichterscheinen wird die volle Kursgebühr berechnet.</li>
            </ul>
          </Section>

          <Section title="6. Haftungsausschluss">
            <ul className="list-disc pl-6 space-y-1">
              <li>Die Teilnahme an den Kursen erfolgt auf eigene Verantwortung.</li>
              <li>Santosha Yoga by Tessa übernimmt keine Haftung für Verletzungen, Unfälle oder gesundheitliche Schäden, die während oder infolge der Teilnahme entstehen (unabhängig vom Trainer).</li>
              <li>Es wird empfohlen, bei gesundheitlichen Einschränkungen vorher ärztlichen Rat einzuholen.</li>
            </ul>
          </Section>

          <Section title="7. Hausordnung und Verhaltensregeln">
            <ul className="list-disc pl-6 space-y-1">
              <li>Handys sind im Kursraum nicht gestattet und sollen draußen gelassen werden.</li>
              <li>Getränke dürfen mitgebracht werden.</li>
              <li>Teilnehmende werden gebeten, pünktlich zu erscheinen, da ein späterer Einstieg nicht mehr möglich ist.</li>
            </ul>
          </Section>

          <Section title="8. Datenschutz">
            <ul className="list-disc pl-6 space-y-1">
              <li>Für die Anmeldung zu Kursen und die Abwicklung der Buchungen ist die Verarbeitung personenbezogener Daten (z. B. Name, E-Mail-Adresse, Zahlungsinformationen) erforderlich. Diese Daten werden ausschließlich für den Buchungsprozess und die Kursorganisation verwendet und nicht an Dritte weitergegeben.</li>
              <li>
                Weitere Informationen zur Verarbeitung personenbezogener Daten und zum Schutz dieser Daten finden sich in
                der <a href="/datenschutz" className="text-[hsl(var(--primary))] hover:underline">Datenschutzerklärung</a> auf der Website.
              </li>
            </ul>
          </Section>

          <Section title="9. Änderungen und Absagen durch Santosha Yoga by Tessa">
            <ul className="list-disc pl-6 space-y-1">
              <li>Santosha Yoga by Tessa behält sich vor, Kurse bei Krankheit, unvorhergesehenen Ereignissen oder zu geringer Teilnehmerzahl abzusagen. In diesem Fall werden bereits gezahlte Gebühren erstattet oder auf Wunsch gutgeschrieben.</li>
            </ul>
          </Section>

          <Section title="10. Schlussbestimmungen">
            <ul className="list-disc pl-6 space-y-1">
              <li>Sollten einzelne Bestimmungen dieser AGB unwirksam sein, bleibt die Gültigkeit der übrigen Regelungen unberührt.</li>
              <li>Es gilt deutsches Recht.</li>
            </ul>
          </Section>
        </div>
      </div>
    </main>
  );
}
