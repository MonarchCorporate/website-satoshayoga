// Zentrale Beispiel-Daten für alle E-Mail-Templates-Vorschauen.
// Wird sowohl im Editor als auch in der Vorschau-Übersicht verwendet.

export const EMAIL_PREVIEW_SAMPLES: Record<string, string> = {
  site_name: "Santosha Yoga",
  customer_first_name: "Tessa",
  customer_last_name: "Mustermann",
  course_title: "Hatha Yoga – Abend",
  course_date: "Mittwoch, 15. Mai 2026",
  course_time: "18:30 – 19:45",
  course_location: "Studio Marburg",
  instructor_name: "Tessa",
  payment_method: "5er-Karte",
  amount_paid: "85,00 €",
  dashboard_url: "https://yoga-heide.de/dashboard",
  card_type: "10er-Karte",
  credits: "3",
  expires_at: "31.12.2026",
  order_number: "2026-0042",
  order_total: "85,00 €",
  invoice_url: "#",
  invoice_number: "RE-2026-0042",
  refund_info: "Der Betrag wurde dir auf deine Karte zurückgebucht.",
  confirmation_url: "https://yoga-heide.de/auth/callback?token=beispiel",
  token: "123456",
  email: "tessa@example.com",
  new_email: "tessa-neu@example.com",
};

export const renderEmailPreview = (html: string) =>
  html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) =>
    EMAIL_PREVIEW_SAMPLES[k] ?? `{{${k}}}`,
  );

export const renderEmailSubject = (subject: string) => renderEmailPreview(subject);
