# Einladung für Mitarbeiterinnen: Passwort setzen funktioniert zuverlässig

## Problem
Anna klickt den Link in der Einladung und landet auf „Neues Passwort setzen“. Dort sieht sie aber nur „Bitte verwende den Link aus deiner E-Mail …“ und kein Eingabefeld.

Vermutete Ursache, noch nicht bestätigt: Die Seite sucht beim Öffnen in der Adresse nach einem Hinweis auf das Zurücksetzen. Die Anmeldung liest diesen Hinweis aber vorher schon aus und löscht ihn. Dadurch erkennt die Seite den gültigen Link nicht. Als erster Schritt wird geprüft, ob das wirklich der Grund ist. Dafür wird der Einladungsablauf in der Vorschau einmal komplett durchgespielt.

## Änderungen
1. **Seite „Neues Passwort setzen“ wird robuster**
   - Das Eingabefeld erscheint, sobald jemand über den Link angemeldet ist, ganz egal, was in der Adresse steht.
   - Ist der Link abgelaufen oder schon benutzt, erscheint eine klare Meldung mit dem Knopf „Neuen Link anfordern“.
   - Die Seite bekommt das gleiche Logo und Design wie die Login-Seite.
2. **Nach dem Speichern geht es an die richtige Stelle**
   - Mitarbeiterinnen und Trainerinnen landen direkt im Backoffice, Kundinnen im Kundenbereich.
3. **Einladungs-E-Mail**
   - Der Text sagt deutlich: „Lege jetzt dein Passwort fest“. Der Link bleibt 24 Stunden gültig, ein neuer kann jederzeit angefordert werden.
4. **Annas Zugang wird geprüft**
   - Es wird kontrolliert, dass sie die passende Rolle (Trainerin bzw. Mitarbeiterin) hat und mit ihrem Profil verknüpft ist. Danach wird ihr eine neue Einladung geschickt.

## Technische Details
- `ResetPassword.tsx`: zusätzlich `onAuthStateChange` (PASSWORD_RECOVERY / SIGNED_IN) und `getSession()` auswerten. Hash- und `error_description`-Parameter lesen, um abgelaufene Links zu erkennen. `updateUser({ password })` ohne current_password. Danach Weiterleitung abhängig von der Rolle über `user_roles`.
- Edge Function `invite-trainer`: redirect bleibt `/reset-password`. Prüfen, ob der Link im implicit flow funktioniert.
- Prüfung per SQL: `user_roles` und `trainers.user_id` für Anna.
