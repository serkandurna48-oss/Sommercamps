# Kundenkontext: KSV Baunatal

> Enthält keine Zugangsdaten oder geheimen Werte. Echte Kontakt-/Bankdaten stehen in
> `frontend/app/lib/clubConfig.tsx` bzw. den `.env`-Dateien auf Render/Vercel, nicht hier.

## Status: Produktiv

KSV Baunatal ist der ursprüngliche und einzige produktive Kunde des Systems. Live-Betrieb,
echte Anmeldungen, echte Zahlungen.

## Registrierungsflow

1. Eltern rufen die Landingpage auf (`main`-Branch, KSV-Vercel-Projekt), wählen einen
   Camp-Termin und füllen das Anmeldeformular aus (Kind- und Erziehungsberechtigten-Daten,
   Allergien, Foto-/Videoeinwilligung).
2. `POST /registrations` legt den Datensatz in `camp_registrations` an, verschickt eine
   Bestätigungsmail (Brevo) mit Bankdaten bzw. Stripe-Checkout-Link.
3. Bei Online-Zahlung: Stripe Checkout → Webhook aktualisiert `payment_status`.
4. Verein sieht alle Anmeldungen im Admin-Dashboard (`/admin`, `ADMIN_PASSWORD`-Login),
   inkl. Zahlungsstatus und CSV-Export.

Details zu Formularfeldern, Validierung und E-Mail-Logik: [`CLAUDE.md`](../../CLAUDE.md).

## Backend- und Datenbankabhängigkeit

KSV ist **direkt und produktiv** an das geteilte Backend (Render) und die geteilte
Datenbank (Supabase, Tabelle `camp_registrations`) gekoppelt — nicht nur lesend wie JK,
sondern mit vollem Schreib-/Zahlungs-/E-Mail-Pfad. Jede Backend-Änderung wirkt sich sofort
auf echte, laufende Anmeldungen aus.

## Regressionsrisiko: hoch

Weil Backend und Datenbank mit JK geteilt sind (siehe
[`docs/architecture/system-overview.md`](../architecture/system-overview.md)), kann
**jede** Änderung an `backend/main.py`, `camp_config.py` oder den Migrationen KSV treffen —
auch wenn die Änderung ursprünglich für JK gedacht war. Vor jedem Merge, der das Backend
oder geteilte Frontend-Komponenten (`RegistrationForm.tsx`, `campConfig.ts`) berührt: KSV
explizit gegenprüfen (siehe KSV-Regressionscheck in
[`.github/pull_request_template.md`](../../.github/pull_request_template.md)).

Bekannte, bereits dokumentierte Bugs und offene Punkte: [`CLAUDE.md`](../../CLAUDE.md#bekannte-bugs--inkonsistenzen),
[`TODO.md`](../../TODO.md).
