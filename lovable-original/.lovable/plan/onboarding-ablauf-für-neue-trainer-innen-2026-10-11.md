# Onboarding-Ablauf für neue Trainer:innen

## Ziel
Eine neue Trainerin bekommt eine schöne Einladung, legt ihr Passwort fest und wird danach im Backoffice an die Hand genommen. Als Admin siehst du jederzeit, wie weit sie ist.

## Ablauf
```text
Admin: Trainer anlegen -> "Einladen"
   -> E-Mail "Willkommen im Team" (über info@yoga-heide.de)
   -> Trainerin klickt "Zugang einrichten"
   -> Seite "Willkommen, Anna": Passwort festlegen (2x)
   -> Willkommens-Seite im Backoffice mit 3 Schritten
   -> Fertig: Meine Kurse / Meine Verdienste
```

## Änderungen
1. **Admin – Trainer-Übersicht**
   - Jede Trainerin bekommt einen Status: „Nicht eingeladen“, „Eingeladen am …“, „Aktiv (zuletzt angemeldet …)“.
   - Knöpfe „Einladen“ und „Erneut einladen“. Hat die Trainerin noch keine E-Mail-Adresse, wird vorher klar danach gefragt.
   - Eine Erfolgs- oder Fehlermeldung in verständlichen Worten.
2. **Einladungs-E-Mail „Willkommen im Team“**
   - Die E-Mail spricht die Trainerin persönlich an. Sie erklärt kurz, was sie im Backoffice erwartet (Kurse, Teilnehmerlisten, Abrechnung). Es gibt einen großen Knopf „Zugang einrichten“ und den Hinweis, dass der Link 24 Stunden gültig ist und wie man einen neuen bekommt.
   - Die Vorlage lässt sich wie alle anderen E-Mails im Backoffice bearbeiten.
3. **Seite „Zugang einrichten“**
   - Begrüßung mit Vornamen. Das Passwort wird zweimal eingegeben, mit Hinweis auf die Mindestlänge.
   - Bei abgelaufenem Link gibt es einen Knopf „Neuen Link per E-Mail senden“, der sofort eine neue Einladung verschickt. Ein Umweg über die Login-Seite ist dafür nicht nötig.
4. **Willkommens-Seite im Backoffice (beim ersten Login)**
   - Drei kurze Schritte mit Häkchen:
     1. Profil prüfen (Telefon, Adresse, Bankdaten für die Abrechnung)
     2. Meine Kurse ansehen
     3. So funktioniert die Abrechnung
   - Die Seite lässt sich ausblenden und unter „Mein Profil“ erneut öffnen.
5. **Login für Trainerinnen**
   - Nach dem Einloggen geht es direkt ins Backoffice. Unter „Passwort vergessen“ kommt die Mail zuverlässig über euren Hostinger-Versand.
6. **Info an dich**
   - Du bekommst eine kurze E-Mail, sobald eine Trainerin ihren Zugang eingerichtet hat.

## Technische Details
- DB: `trainers.invited_at timestamptz`, `trainers.onboarded_at timestamptz` und `trainers.onboarding_dismissed boolean`. Die RLS-Regeln bleiben; Trainerinnen dürfen die eigenen Onboarding-Felder per WITH CHECK aktualisieren.
- E-Mail-Vorlagen in `email_templates`: `trainer_invite` wird neu gestaltet, `trainer_onboarded` (an den Admin) kommt neu dazu. Der Versand läuft über `send-customer-email` (SMTP). Die eingebaute Auth-Mail wird nicht genutzt.
- `invite-trainer`: Setzt `invited_at`, holt Trainer anhand der E-Mail auch ohne Admin-Aufruf ein, wenn `resend=true` und der Trainer schon existiert. Der Fall wird über einen neuen, öffentlichen Endpunkt `resend-trainer-invite` mit Rate-Limit abgedeckt; die Antwort ist immer generisch.
- `ResetPassword.tsx`: Der Modus `?invite=1` zeigt einen Willkommenstext. Nach dem Speichern wird `onboarded_at` gesetzt und eine Admin-Benachrichtigung ausgelöst. Danach geht es weiter auf `/admin/welcome`.
- Neue Seite `/admin/welcome` mit Checkliste. Das Sidebar-Element wird nur für Trainer:innen angezeigt.
- Admin-Status: `last_sign_in_at` kommt über eine Edge Function oder eine SECURITY DEFINER RPC (nur für Admins), weil `auth.users` nicht direkt lesbar ist.
- Prüfung: Den kompletten Ablauf in der Vorschau per Playwright mit einem Test-Trainer durchspielen.
