// Definition aller E-Mail-Trigger im System inkl. Default-HTML-Templates.
// Editor in /admin/emails liest diese Liste, seedet die DB beim ersten Klick
// und nutzt sie als Fallback wenn der Admin ein Template löscht.

export interface EmailTriggerDef {
  trigger_key: string;
  category: "Auth" | "Account" | "Buchung" | "Karten" | "Bestellungen" | "Lifecycle";
  display_name: string;
  description: string;
  default_subject: string;
  default_body_html: string;
  placeholders: string[]; // Auflistung für Editor-Buttons
}

// Wrapper für gebrandetes HTML – goldener Header, weißer Body, Cormorant + Nunito.
const wrap = (innerHtml: string) => `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8" /><title>Santosha Yoga</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;font-family:'Nunito Sans',Arial,sans-serif;color:#222;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:#1a1a1a;padding:32px;text-align:center;">
          <h1 style="margin:0;color:#C8A97E;font-family:'Cormorant Garamond',Georgia,serif;font-weight:500;font-size:32px;letter-spacing:0.02em;">{{site_name}}</h1>
          <p style="margin:6px 0 0;color:#C8A97E;opacity:.7;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;">Yoga by Tessa</p>
        </td></tr>
        <tr><td style="padding:40px 40px 32px;color:#222;font-size:15px;line-height:1.65;">
          ${innerHtml}
        </td></tr>
        <tr><td style="background:#faf6ef;padding:24px 40px;text-align:center;color:#888;font-size:12px;border-top:1px solid #ece4d4;">
          Mit Liebe gesendet von Tessa & dem Santosha-Team<br/>
          <a href="https://santosha-yoga.de" style="color:#C8A97E;text-decoration:none;">santosha-yoga.de</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const heading = (txt: string) =>
  `<h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:500;color:#1a1a1a;">${txt}</h2>`;

const button = (label: string, urlVar: string) =>
  `<p style="margin:28px 0;text-align:center;"><a href="{{${urlVar}}}" style="background:#C8A97E;color:#1a1a1a;padding:14px 32px;border-radius:6px;text-decoration:none;font-weight:600;letter-spacing:0.04em;">${label}</a></p>`;

const detailRow = (label: string, varName: string) =>
  `<tr><td style="padding:8px 0;color:#888;width:140px;">${label}</td><td style="padding:8px 0;font-weight:600;">{{${varName}}}</td></tr>`;

export const EMAIL_TRIGGERS: EmailTriggerDef[] = [
  // --- Auth ---
  {
    trigger_key: "auth_signup",
    category: "Auth",
    display_name: "Registrierung bestätigen",
    description:
      "Wird nach der Registrierung mit dem Bestätigungslink an neue Nutzer gesendet.",
    default_subject: "Bestätige deine E-Mail-Adresse bei {{site_name}}",
    placeholders: ["site_name", "confirmation_url", "email", "token"],
    default_body_html: wrap(`
      ${heading("Nur noch ein Schritt")}
      <p>Willkommen bei <strong>{{site_name}}</strong>!</p>
      <p>Bitte bestätige deine E-Mail-Adresse, damit wir dein Konto aktivieren können:</p>
      ${button("E-Mail bestätigen", "confirmation_url")}
      <p style="color:#666;font-size:13px;">Oder gib diesen Code ein: <strong style="font-family:monospace;letter-spacing:0.15em;">{{token}}</strong></p>
      <p style="color:#888;font-size:12px;">Falls du dich nicht registriert hast, kannst du diese E-Mail einfach ignorieren.</p>
    `),
  },
  {
    trigger_key: "auth_recovery",
    category: "Auth",
    display_name: "Passwort zurücksetzen",
    description:
      'Wird gesendet, wenn ein Nutzer sein Passwort über „Passwort vergessen" zurücksetzt.',
    default_subject: "Setze dein Passwort bei {{site_name}} zurück",
    placeholders: ["site_name", "confirmation_url", "email", "token"],
    default_body_html: wrap(`
      ${heading("Passwort zurücksetzen")}
      <p>Wir haben eine Anfrage erhalten, das Passwort für <strong>{{email}}</strong> zurückzusetzen.</p>
      ${button("Neues Passwort festlegen", "confirmation_url")}
      <p style="color:#666;font-size:13px;">Oder gib diesen Code ein: <strong style="font-family:monospace;letter-spacing:0.15em;">{{token}}</strong></p>
      <p style="color:#888;font-size:12px;">Falls du das nicht warst, ignoriere diese E-Mail einfach – dein Passwort bleibt unverändert.</p>
    `),
  },
  {
    trigger_key: "auth_magic_link",
    category: "Auth",
    display_name: "Magic-Link Login",
    description:
      "Passwortloser Login-Link – wird gesendet, wenn Nutzer per Magic-Link einloggen.",
    default_subject: "Dein Login-Link für {{site_name}}",
    placeholders: ["site_name", "confirmation_url", "email", "token"],
    default_body_html: wrap(`
      ${heading("Dein Login-Link")}
      <p>Klicke auf den Button, um dich sicher bei <strong>{{site_name}}</strong> anzumelden:</p>
      ${button("Jetzt einloggen", "confirmation_url")}
      <p style="color:#666;font-size:13px;">Oder gib diesen Code ein: <strong style="font-family:monospace;letter-spacing:0.15em;">{{token}}</strong></p>
      <p style="color:#888;font-size:12px;">Der Link ist aus Sicherheitsgründen nur kurz gültig.</p>
    `),
  },
  {
    trigger_key: "auth_email_change",
    category: "Auth",
    display_name: "E-Mail-Adresse ändern",
    description:
      "Wird an die neue E-Mail-Adresse gesendet, um die Änderung zu bestätigen.",
    default_subject: "Bestätige deine neue E-Mail-Adresse",
    placeholders: ["site_name", "confirmation_url", "email", "new_email", "token"],
    default_body_html: wrap(`
      ${heading("Neue E-Mail-Adresse bestätigen")}
      <p>Du möchtest deine E-Mail-Adresse bei <strong>{{site_name}}</strong> ändern:</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#888;width:140px;">Alt</td><td style="padding:8px 0;font-weight:600;">{{email}}</td></tr>
        <tr><td style="padding:8px 0;color:#888;">Neu</td><td style="padding:8px 0;font-weight:600;">{{new_email}}</td></tr>
      </table>
      ${button("Änderung bestätigen", "confirmation_url")}
      <p style="color:#888;font-size:12px;">Falls du diese Änderung nicht angefordert hast, ignoriere diese E-Mail einfach.</p>
    `),
  },
  // --- Kunden-Trigger ---
  {
    trigger_key: "welcome",
    category: "Account",
    display_name: "Willkommen (Account-Erstellung)",
    description: "Wird direkt nach der Registrierung an neue Kunden gesendet.",
    default_subject: "Willkommen bei {{site_name}}, {{customer_first_name}}!",
    placeholders: ["customer_first_name", "customer_last_name", "site_name"],
    default_body_html: wrap(`
      ${heading("Namasté {{customer_first_name}}")}
      <p>Schön, dass du da bist! Dein Account bei <strong>{{site_name}}</strong> wurde erfolgreich erstellt.</p>
      <p>Du kannst jetzt Kurse buchen, deine 5er- oder 10er-Karten verwalten und deine Stunden im Blick behalten.</p>
      ${button("Zum Dashboard", "dashboard_url")}
      <p style="color:#666;">Wir freuen uns, dich bald auf der Matte zu sehen.</p>
    `),
  },
  {
    trigger_key: "booking_confirmation",
    category: "Buchung",
    display_name: "Buchungsbestätigung",
    description: "Sobald eine Kursbuchung erfolgreich bezahlt oder per Karte eingelöst wurde.",
    default_subject: "Buchungsbestätigung: {{course_title}} am {{course_date}}",
    placeholders: [
      "customer_first_name",
      "course_title",
      "course_date",
      "course_time",
      "course_location",
      "instructor_name",
      "payment_method",
      "amount_paid",
      "dashboard_url",
    ],
    default_body_html: wrap(`
      ${heading("Deine Buchung ist bestätigt 🙏")}
      <p>Hallo {{customer_first_name}},</p>
      <p>wir freuen uns auf dich! Hier deine Buchungs­details:</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        ${detailRow("Kurs", "course_title")}
        ${detailRow("Datum", "course_date")}
        ${detailRow("Uhrzeit", "course_time")}
        ${detailRow("Ort", "course_location")}
        ${detailRow("Lehrer:in", "instructor_name")}
        ${detailRow("Bezahlt mit", "payment_method")}
      </table>
      ${button("In meinem Dashboard ansehen", "dashboard_url")}
      <p style="color:#666;">Bring bequeme Kleidung mit. Matten und Hilfsmittel sind vor Ort vorhanden.</p>
    `),
  },
  {
    trigger_key: "booking_reminder_24h",
    category: "Buchung",
    display_name: "Erinnerung 24h vorher",
    description: "Automatischer Reminder, der einen Tag vor dem Kurs verschickt wird.",
    default_subject: "Erinnerung: Morgen {{course_title}}",
    placeholders: ["customer_first_name", "course_title", "course_date", "course_time", "course_location"],
    default_body_html: wrap(`
      ${heading("Bis morgen!")}
      <p>Hallo {{customer_first_name}},</p>
      <p>nur eine kleine Erinnerung: Morgen findet deine Stunde <strong>{{course_title}}</strong> statt.</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        ${detailRow("Datum", "course_date")}
        ${detailRow("Uhrzeit", "course_time")}
        ${detailRow("Ort", "course_location")}
      </table>
      <p>Wir freuen uns auf dich. ✨</p>
    `),
  },
  {
    trigger_key: "booking_cancelled",
    category: "Buchung",
    display_name: "Buchung storniert (durch Kunden)",
    description: "Wenn der Kunde seine eigene Buchung storniert.",
    default_subject: "Stornierungsbestätigung: {{course_title}}",
    placeholders: ["customer_first_name", "course_title", "course_date", "refund_info"],
    default_body_html: wrap(`
      ${heading("Stornierung bestätigt")}
      <p>Hallo {{customer_first_name}},</p>
      <p>deine Buchung für <strong>{{course_title}}</strong> am {{course_date}} wurde storniert.</p>
      <p>{{refund_info}}</p>
      <p style="color:#666;">Schade, dass es nicht klappt – wir hoffen, dich bald wiederzusehen.</p>
    `),
  },
  {
    trigger_key: "course_cancelled",
    category: "Buchung",
    display_name: "Kursabsage (durch Studio)",
    description: "Wird an alle gebuchten Teilnehmer geschickt, wenn das Studio einen Kurs absagt.",
    default_subject: "Wichtig: {{course_title}} am {{course_date}} entfällt",
    placeholders: ["customer_first_name", "course_title", "course_date", "refund_info"],
    default_body_html: wrap(`
      ${heading("Kurs muss leider entfallen")}
      <p>Hallo {{customer_first_name}},</p>
      <p>leider müssen wir dir mitteilen, dass <strong>{{course_title}}</strong> am {{course_date}} <strong>nicht stattfindet</strong>.</p>
      <p>{{refund_info}}</p>
      <p style="color:#666;">Wir bitten um dein Verständnis und freuen uns, dich bald wieder bei uns begrüßen zu dürfen.</p>
    `),
  },
  {
    trigger_key: "card_purchased",
    category: "Karten",
    display_name: "Karte gekauft",
    description: "Bestätigung nach Kauf einer 5er- oder 10er-Karte.",
    default_subject: "Deine {{card_type}} ist aktiviert",
    placeholders: ["customer_first_name", "card_type", "credits", "expires_at", "amount_paid", "dashboard_url"],
    default_body_html: wrap(`
      ${heading("Deine Karte ist aktiv")}
      <p>Hallo {{customer_first_name}},</p>
      <p>vielen Dank! Deine <strong>{{card_type}}</strong> wurde deinem Account gutgeschrieben.</p>
      <table style="width:100%;margin:20px 0;border-collapse:collapse;">
        ${detailRow("Stunden", "credits")}
        ${detailRow("Gültig bis", "expires_at")}
        ${detailRow("Bezahlt", "amount_paid")}
      </table>
      ${button("Karte im Dashboard ansehen", "dashboard_url")}
    `),
  },
  {
    trigger_key: "card_low_credits",
    category: "Karten",
    display_name: "Karte fast aufgebraucht",
    description: "Wenn nur noch eine Stunde auf der Karte übrig ist.",
    default_subject: "Nur noch {{credits}} Stunde auf deiner Karte",
    placeholders: ["customer_first_name", "card_type", "credits", "dashboard_url"],
    default_body_html: wrap(`
      ${heading("Deine Karte neigt sich dem Ende")}
      <p>Hallo {{customer_first_name}},</p>
      <p>auf deiner <strong>{{card_type}}</strong> ist nur noch <strong>{{credits}} Stunde</strong> übrig.</p>
      ${button("Neue Karte kaufen", "dashboard_url")}
    `),
  },
  {
    trigger_key: "card_expired",
    category: "Karten",
    display_name: "Karte abgelaufen",
    description: "Wenn die Gültigkeit einer Karte abläuft.",
    default_subject: "Deine {{card_type}} ist abgelaufen",
    placeholders: ["customer_first_name", "card_type", "dashboard_url"],
    default_body_html: wrap(`
      ${heading("Deine Karte ist abgelaufen")}
      <p>Hallo {{customer_first_name}},</p>
      <p>die Gültigkeit deiner <strong>{{card_type}}</strong> ist heute abgelaufen.</p>
      ${button("Neue Karte sichern", "dashboard_url")}
    `),
  },
  {
    trigger_key: "order_confirmation",
    category: "Bestellungen",
    display_name: "Bestellbestätigung",
    description: "Wird nach erfolgreicher Bestellung im Shop gesendet.",
    default_subject: "Bestellbestätigung #{{order_number}}",
    placeholders: ["customer_first_name", "order_number", "order_total", "invoice_url"],
    default_body_html: wrap(`
      ${heading("Danke für deine Bestellung")}
      <p>Hallo {{customer_first_name}},</p>
      <p>deine Bestellung <strong>#{{order_number}}</strong> über <strong>{{order_total}}</strong> ist bei uns eingegangen.</p>
      ${button("Rechnung herunterladen", "invoice_url")}
    `),
  },
  {
    trigger_key: "order_invoice",
    category: "Bestellungen",
    display_name: "Rechnung verfügbar",
    description: "Separate Mail mit Rechnungslink, wenn die Rechnung erzeugt wurde.",
    default_subject: "Deine Rechnung {{invoice_number}}",
    placeholders: ["customer_first_name", "invoice_number", "invoice_url"],
    default_body_html: wrap(`
      ${heading("Deine Rechnung")}
      <p>Hallo {{customer_first_name}},</p>
      <p>anbei findest du deine Rechnung <strong>{{invoice_number}}</strong>.</p>
      ${button("Rechnung öffnen", "invoice_url")}
    `),
  },
  {
    trigger_key: "birthday",
    category: "Lifecycle",
    display_name: "Geburtstagsgruß",
    description: "Automatisch am Geburtstag des Kunden.",
    default_subject: "Alles Liebe zum Geburtstag, {{customer_first_name}}! 🎉",
    placeholders: ["customer_first_name"],
    default_body_html: wrap(`
      ${heading("Happy Birthday, {{customer_first_name}}!")}
      <p>Heute ist dein Tag – wir wünschen dir von Herzen alles Liebe, Gesundheit und ganz viele schöne Momente auf deiner Matte.</p>
      <p style="color:#666;">Mit lieben Grüßen,<br/>Tessa & das {{site_name}} Team ✨</p>
    `),
  },
  {
    trigger_key: "inactive_reminder",
    category: "Lifecycle",
    display_name: "Reaktivierung (60 Tage inaktiv)",
    description: "An Kunden, die seit 60 Tagen keine Stunde mehr gebucht haben.",
    default_subject: "Wir vermissen dich auf der Matte 🧘",
    placeholders: ["customer_first_name", "dashboard_url"],
    default_body_html: wrap(`
      ${heading("Lange nicht gesehen")}
      <p>Hallo {{customer_first_name}},</p>
      <p>schön war es mit dir – und wir würden uns freuen, dich bald wiederzusehen. Dein Körper und Geist haben sich eine Pause vom Alltag verdient.</p>
      ${button("Stunde buchen", "dashboard_url")}
    `),
  },
];
