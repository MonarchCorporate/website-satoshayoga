# Kurse „Direkt beim Trainer buchbar“

## Was du bekommst
- Beim Anlegen/Bearbeiten eines Kurses gibt es einen neuen Schalter **„Direkt beim Trainer buchbar“**.
- Solche Kurse erscheinen ganz normal im Kalender (Startseite und Kundenbereich), mit Uhrzeit, Titel und Trainer:in.
- Statt „Buchen“ steht dort ein Hinweis: **„Termin direkt bei {Trainer:in} vereinbaren“**. Es gibt keinen Buchen-Button, keine Platzanzeige und keinen Warenkorb.
- In der Kursdetail-Ansicht steht derselbe Hinweis an der Stelle des Buchen-Buttons.
- Auch über Umwege (alter Warenkorb, Gutschein, Karte, PayPal) kann so ein Kurs nicht gebucht werden – das System lehnt es ab.
- Als Admin kannst du weiterhin manuell Teilnehmer:innen eintragen.

## Technische Details
- DB: neue Spalte `courses.direct_trainer_booking boolean not null default false` (gilt auch für Serien/Vorlagen: `course_templates.direct_trainer_booking`, beim Erzeugen übernommen).
- `CourseFormDrawer.tsx`: Switch + Speichern.
- Anzeige: `PublicCalendar.tsx`, `CourseBookingDialog.tsx`, `BookingWizard.tsx`, `Schedule.tsx`, `CourseDetailDialog.tsx` – Buchen ausblenden, Hinweis zeigen; `Cart.tsx`/`Checkout.tsx` solche Einträge entfernen.
- Serverseitig: `create-order`, `create-paypal-order`, `book-with-voucher`, `redeem-card-booking`/`card-redeem.ts` lehnen diese Kurse mit klarer Meldung ab; `CoursesTable` zeigt ein kleines Badge.
