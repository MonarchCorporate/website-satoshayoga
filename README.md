# Santosha Yoga – yoga-heide.de

Buchungsplattform von Santosha Yoga by Tessa (Kurse, Karten, Shop, Videokurse,
Backoffice). Ursprünglich mit Lovable + Lovable Cloud (Supabase) gebaut, jetzt
**vollständig selbst gehostet bei Hostinger** – ohne Lovable und ohne Supabase.

## Architektur

```
Browser (React/Vite, src/)
   │  supabase-kompatibler Client: src/integrations/supabase/client.ts
   ▼
Node.js-Server (Express, server/src/)  ── läuft als Hostinger Node.js-App
   ├─ /api/db            PostgREST-kompatible Abfragen (engine.ts)
   ├─ /api/rpc/:fn       Datenbankfunktionen (rpc.ts)
   ├─ /auth/v1/*         Login, Refresh, Passwort, E-Mail-Links (auth.ts)
   ├─ /storage/v1/*      Dateien (Kursbilder, Rechnungen …) (storage.ts)
   ├─ /functions/v1/:fn  42 Serverfunktionen (server/functions/, aus Supabase portiert)
   └─ statisches Frontend aus dist/
   ▼
MySQL/MariaDB bei Hostinger (u602875608_santosha)
Dateien: STORAGE_DIR (außerhalb des App-Ordners, übersteht Deploys)
```

* **Datenbank-Schema**: `server/schema/schema.sql` (wird beim Start automatisch
  angelegt, `CREATE TABLE IF NOT EXISTS`). Generiert aus dem Postgres-Schema mit
  `scripts/gen_schema.py` (Quelle: `server/schema/source/postgres-schema.json`;
  neue Tabellen werden direkt im Generator ergänzt).
* **Zugriffsregeln**: Die Row-Level-Security-Policies aus Postgres sind 1:1 nach
  MySQL übersetzt (`server/schema/meta.json`) und werden bei jeder Abfrage
  angewendet. Trigger sind in `server/src/hooks.ts` nachgebaut.
* **Login**: Bestehende Passwörter (bcrypt) wurden übernommen – Kund:innen
  melden sich mit ihrem bisherigen Passwort an.
* **Warteliste**: Kund:innen können sich bei ausgebuchten Kursen eintragen
  (Tabelle `waitlist_entries`, Logik in `server/src/waitlist.ts`). Wird ein Platz
  frei, bekommen alle Wartenden die E-Mail-Vorlage „Warteliste: Platz frei“
  (`waitlist_spot_available`, im Backoffice bearbeitbar) mit Direktlink zum Kurs.
* **Geplante Aufgaben**: PayPal-Abgleich alle 10 Minuten (`server/src/cron.ts`).
  Optional zusätzlich als Hostinger-Cronjob:
  `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://yoga-heide.de/api/internal/cron/reconcile-paypal-orders`
* **E-Mail**: SMTP-Zugangsdaten stehen wie bisher in der Tabelle `email_settings`
  (Backoffice → Einstellungen → E-Mail). **PayPal**: in `payment_settings`
  (Backoffice → Einstellungen → PayPal).

## Umgebungsvariablen (Hostinger → Node.js → Environment)

| Variable | Bedeutung |
| --- | --- |
| `PUBLIC_SITE_URL` | `https://yoga-heide.de` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MySQL (Host `127.0.0.1`) |
| `JWT_SECRET` | Signatur der Login-Tokens (geheim, zufällig) |
| `SERVICE_ROLE_KEY` | interner Schlüssel für Serverfunktionen (geheim, zufällig) |
| `GUEST_BOOKING_SECRET` | Signatur für Gastbuchungs-Links |
| `CRON_SECRET` | schützt `/api/internal/cron/*` |
| `STORAGE_DIR` | Dateiablage, z. B. `/home/<user>/domains/yoga-heide.de/santosha-storage` |
| `MIGRATION_KEY` | nur für den einmaligen Datenimport – danach entfernen |

Geheimnisse gehören nie ins Repository (das Repo ist öffentlich).

## Entwicklung

```bash
npm install
cp .env.example .env.local   # Werte anpassen, lokale MySQL/MariaDB
npm run build                # Frontend (dist/) + Server (server-dist/)
npm run dev:server           # API + gebautes Frontend auf :3000
npm run dev                  # Vite-Dev-Server auf :8080 (Proxy auf :3000)
```

## Deployment

Hostinger baut automatisch bei jedem Push auf den verbundenen Branch
(`npm install` → `npm run build` → Start von `server-dist/index.mjs`).

## Datenübernahme aus Supabase

Einmaliger Import mit `scripts/make-bundle.mjs` (verschlüsseltes Paket aus
Datenbank-Export + Dateien) und `POST /api/_migrate/import` bzw. Ablage als
`santosha-import.enc` neben der App (wird beim Start importiert und gelöscht).
Der Import ersetzt alle Daten vollständig.
