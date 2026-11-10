# Zusammenführung Serkan + Ahmad: Umsetzungsplan (10.11.2026)

Basis: `demo/jan` @ 43b5569. Entscheidungen von Serkan am 10.11.:
- Preismodell von Ahmad.
- Aus Ahmads Stand werden übernommen:
  - automatische Löschfristen
  - „Meine Buchung“ per Link + Erinnerungsmail
  - Uptime-Alarm
- Kein Code wird aus `Isayax/CampsPilot` kopiert. Ahmads Funktionen sind fachliche Vorlage, die Umsetzung folgt den Mustern dieses Repos.

Allgemeine Regeln (aus `CLAUDE.md`/`AGENTS.md`):
- Tests zuerst. Nur synthetische Daten.
- Jede neue DB-Spalte bekommt eine eigene Migration in `supabase/migrations/` mit dem unten genannten Zeitstempel.
- Eltern werden gesiezt, Admins geduzt.
- Logs und Audit-Log enthalten keine Namen, keine Mailadressen und keine Gesundheitsdaten.

## P – Preismodell (Ahmad)

Pakete:

| Paket | Grundgebühr | Gebühr je Buchung | Camps |
|---|---|---|---|
| Starter | 0 € | 6,9 % | 1 aktives Camp |
| Verein | 24,90 €/Monat (298,80 €/Jahr) | 4,9 % | unbegrenzt |
| Verband/Individuell | individuell | individuell | unbegrenzt |

Alle Beträge zzgl. USt.

Abweichung von Ahmad: Bei Ahmad sind die Zahlungsgebühren im Prozentsatz enthalten. Hier läuft Online-Zahlung über Stripe Managed Risk, und Stripe belastet seine Gebühr direkt beim Verein. Deshalb steht auf der Preisseite: „zzgl. Gebühren des Zahlungsdienstleisters bei Online-Zahlung (Stripe)“. Bei Überweisung fallen keine Zahlungsgebühren an. Serkan entscheidet, ob das so bleibt.

### Backend
- Migration `20261110100000_fee_rule_monthly_fee.sql`:
  - `organization_fee_rules.monthly_fee_cents integer null check (monthly_fee_cents >= 0)`.
  - `null` = Paketstandard: Starter 0, Verein 2490, Individuell 0.
  - Spaltenrechte wie bei den übrigen Spalten der Tabelle.
- `app/fees.py`:
  - `PLAN_MONTHLY_CENTS`
  - `FeeRule.monthly_fee_cents`
  - `monthly_fee_for(rule) -> int`, löst `null` zum Paketstandard auf
- Neue Gebührenregel beim Owner: Feld `monthly_fee_cents` optional, ≥ 0.
- Monatsübersicht `GET /admin/platform/organizations/{slug}/fees?month=`:
  - neue Felder `monthly_fee_cents` und `total_cents` (Buchungsgebühren + Grundgebühr)
  - Grundgebühr = die Regel, die am letzten Tag des Monats gilt (im laufenden Monat: heute)
- Camp-Begrenzung Starter:
  - Gilt heute die Regel mit Paket `starter` (auch der Standard ohne Regel), darf der Verein höchstens 1 aktives Camp haben.
  - Aktiv heißt: veröffentlicht und `end_date >= heute` (Europe/Berlin).
  - Wird ein zweites aktives Camp veröffentlicht oder veröffentlicht angelegt: HTTP 409, `detail = {"code": "plan_camp_limit", "message": "Im Paket Starter ist 1 aktives Camp enthalten. Für mehr Camps wechsle ins Paket Verein."}`
  - Trainings zählen nicht.
  - Bestehende Camps werden nie automatisch zurückgezogen.
  - Platform-Owner sind nicht ausgenommen; Owner ändern das Paket.

### Frontend
- Preisseite `app/(marketing)/preise/pakete.ts` + `page.tsx`:
  - drei Pakete wie oben
  - Rechenbeispiel (20 Kinder à 150 €), Hinweis ab welchem Jahresumsatz „Verein“ günstiger ist
  - FAQ angepasst:
    - Testphase: „Starter hat keine Grundgebühr, Sie zahlen nur bei Buchungen.“
    - Kündigung: unverändert „Sprechen Sie uns an“
  - `entwurf`-Kennzeichnung entfernen
  - Keine Gebühr je Anmeldung mehr behaupten
- Owner-Konsole `platform/(console)/[org]`:
  - Grundgebühr in der Regelliste und im Formular „neue Regel“
  - Monatsübersicht zeigt Grundgebühr und Summe
- Vereins-Admin: bei 409 `plan_camp_limit` die Meldung aus `message` anzeigen.

## L – Löschfristen und tägliche Jobs

- Endpunkt `POST /internal/cron/daily`:
  - Header `Authorization: Bearer <CRON_SECRET>`, Vergleich mit `hmac.compare_digest`
  - ohne gesetztes `CRON_SECRET`: 503
  - falsches Secret: 401
  - Antwort sind nur Zählwerte
- Setting `CRON_SECRET` (optional) und `RETENTION_APPLY` (bool, Standard false).
- Job „Gesundheitsdaten“:
  - Anmeldungen, deren Camp-Ende mindestens 30 Tage zurückliegt und bei denen `allergies` oder `medical_notes` nicht null ist: beide Spalten auf null setzen.
  - `health_data_consent` bleibt (Nachweis).
  - Nur wenn `RETENTION_APPLY=true`, sonst nur zählen.
  - Audit-Eintrag `retention.health_data` mit Anzahl und Modus, ohne IDs von Personen.
- Allgemeine 12-Monats-Löschung bleibt manuell (`scripts/RETENTION-RUNBOOK.md`, Belegpflichten). Der Job zählt sie nur als `general_review_rows`.
- Workflow `.github/workflows/daily-jobs.yml`:
  - täglich 04:17 UTC und manuell auslösbar
  - ruft `${{ vars.SAAS_API_URL }}/internal/cron/daily` mit `secrets.CRON_SECRET`
  - läuft nur, wenn beides gesetzt ist

## B – „Meine Buchung“ und Erinnerungsmail

- Migration `20261110110000_registration_self_service.sql`:
  - `camp_registrations.cancellation_requested_at timestamptz null`
  - `camp_registrations.reminder_sent_at timestamptz null`
- Öffentlich `GET /api/v1/organizations/{slug}/registrations/{token}`:
  - liefert nur Camp- oder Trainingsname, Zeitraum, Vorname des Kindes, Status (angemeldet, Warteliste, storniert), Zahlungsstatus, Betrag, `cancellation_requested_at`, `invoice_available`
  - keine Gesundheitsdaten, keine Elternkontakte, keine Anschrift
  - unbekannter Token oder anderer Verein: 404
  - anonymisierte Buchung: 404
  - Rate-Limit je IP wie beim Checkout
- Öffentlich `POST /api/v1/organizations/{slug}/registrations/{token}/cancellation-request`:
  - setzt `cancellation_requested_at`; ein zweiter Aufruf ändert nichts und liefert 200
  - bereits storniert: 409
  - Audit-Eintrag `registration.cancellation_requested`
  - Mail an die Vereinsadmins mit Benachrichtigung, best effort: „Stornierung angefragt“ mit Camp und Link in den Adminbereich, ohne Gesundheitsdaten
  - storniert wird nicht automatisch, das macht der Verein
- Bestätigungsmail und Wartelistenmail enthalten den Link `FRONTEND_BASE_URL/pilot/<slug>/buchung/<token>` („Ihre Anmeldung ansehen“).
- Frontend `/pilot/[org]/buchung/[token]`:
  - Status in Sie-Form
  - Button „Stornierung anfragen“ mit Bestätigungsschritt in der Seite, kein `window.confirm`
  - danach der Hinweis, dass der Verein sich meldet
- Adminliste der Anmeldungen: Kennzeichen „Storno angefragt“.
- Erinnerung im täglichen Job:
  - Camps mit `start_date = heute + 3 Tage` (Europe/Berlin)
  - nur bestätigte Anmeldungen, nicht Warteliste, nicht storniert, nicht anonymisiert, `reminder_sent_at is null`
  - Mail in Sie-Form mit Ort, Zeit, Link „Meine Buchung“
  - danach `reminder_sent_at = now()`
  - über den bestehenden Mailweg mit Empfänger-Schutz
  - ein Fehler bei einer Mail stoppt die anderen nicht

## U – Betrieb
- `.github/workflows/uptime.yml`:
  - alle 15 Min `GET /health` gegen Prod- und Staging-API, `status == ok`
  - Fehlschlag lässt den Lauf scheitern, GitHub mailt den Repo-Owner
  - URLs als `vars.PROD_API_URL` / `vars.STAGING_API_URL` mit den heutigen Werten als Standard
- `.github/workflows/ci-saas.yml`: `runs-on: ubuntu-24.04` für `saas-e2e`.
