# Überwachung: Sentry (Stand 18.11.2026)

Fehlerüberwachung für Frontend und Backend. Ohne DSN ist sie aus (lokal, Tests, CI).

## Was Sentry sieht und was nicht

Sentry bekommt nur technische Angaben: Fehlertyp, Stack (Datei, Funktion, Zeile), Route, Methode, Browser, Umgebung, Commit.

Vor dem Versand werden entfernt (Backend `backend_saas/app/monitoring.py`, Frontend `frontend/app/lib/sentryScrub.ts`):

- Request-Body, Cookies, Query-String, alle Header außer `User-Agent` (Backend zusätzlich `Content-Type`)
- lokale Variablen und Quelltextzeilen der Stack-Frames
- Fehlertexte: im Backend immer, im Frontend bei allen Fehlern außer `TypeError`, `ReferenceError`, `RangeError`, `ChunkLoadError`
- Text geloggter Fehler, außer es ist eine `%s`-Vorlage aus unserem eigenen Code (`app.*`); dann bleibt die Vorlage, die Werte fallen weg
- Nutzerkontext, Zusatzdaten, Tags, alle Kontexte außer Browser, Betriebssystem, Gerät, Laufzeit und dem Routenmuster (`/pilot/[org]/buchung/[token]`, nie der echte Pfad)
- Breadcrumbs: im Backend alle; im Frontend bleiben nur Seitenwechsel und Netzwerkaufrufe (Methode, Status, Adresse ohne Query). Klicks werden nicht erfasst, weil das SDK dabei `aria-label` mitschickt und dort Namen stehen.
- UUIDs (Buchungstoken) und Mailadressen in allem, was übrig bleibt

Das SDK sammelt selbst nichts ein (`dataCollection` bzw. `send_default_pii` aus, keine IP-Ermittlung). Die Standard-Integrationen sind abgeschaltet; es läuft nur eine feste Liste.

Nicht aktiv: Sitzungsaufzeichnung, Tracing (auch keine Trace-Header an Supabase, Brevo, Stripe), Sitzungszählung. Das Frontend-SDK legt nichts im Browser ab (kein Cookie, kein Storage) und wird ohne DSN gar nicht geladen.

Kann ein Ereignis nicht bereinigt werden, wird es verworfen. Ein falscher DSN stoppt die API nicht.

## Variablen

| Wo | Variable | Wert |
|---|---|---|
| Render (Backend) | `SENTRY_DSN` | DSN des Projekts `campspilot-backend` |
| Render (Backend) | `SENTRY_ENVIRONMENT` | `production` bzw. `staging` (leer = `APP_ENV`) |
| Vercel (Frontend) | `NEXT_PUBLIC_SENTRY_DSN` | DSN des Projekts `campspilot-frontend` |
| Vercel (Frontend) | `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` (Production) bzw. `staging` (Preview); leer = aus `NEXT_PUBLIC_VERCEL_ENV` |
| Vercel, optional | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | nur für lesbare Stacktraces (Source Maps). Ohne Token bleibt der Build unverändert. |

Im Sentry-Projekt einstellen: „Prevent Storing of IP Addresses“ an, Datenbereinigung an.

## Testfehler

- Backend: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<api>/internal/sentry-test` → 500, in Sentry erscheint `SentryTestError`.
- Frontend: als Plattform-Owner `/platform/audit-log/sentry-test` öffnen → „Testfehler senden“.

## Bekannte Lücke

Fehler, die eine `error.tsx` einer Verwaltungsseite im Browser abfängt, werden nicht gemeldet (Serverfehler derselben Seiten schon). Der Elternablauf ist über `app/global-error.tsx` abgedeckt.

## Bewusste Grenzen

- Im Frontend bleibt der Text von `TypeError`, `ReferenceError` und `RangeError` erhalten, weil er sonst nicht auswertbar wäre. Er nennt Bezeichner aus dem Code. Würde je ein Nutzerwert als Objektschlüssel verwendet, stünde er dort.
- Auf dem Next-Server werden nur Fehler aus Seiten, Routen und Server-Aktionen gemeldet (`onRequestError`), keine Fehler aus Hintergrundarbeit.
- Unsere eigenen Log-Vorlagen (`logger.error("… %s", wert)`) gehen als Vorlage ohne Werte an Sentry. Deshalb gilt weiter: keine Personendaten in Log-Vorlagen und keine f-Strings in `logger.error`.
