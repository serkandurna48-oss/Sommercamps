# 2. Daten, APIs, Geschäftsregeln

## Tabellen (`supabase/migrations/`)

| Tabelle | Inhalt | Wichtig |
|---|---|---|
| `organizations` | Verein: Slug, Name, Rechtsdaten, IBAN, Theme/Branding, Zusatzfragen, `site_published`, `plan_status`, `review_status`, AVV, Stripe-Spalten (ungenutzt) | Tenant-Schlüssel ist `organizations.id` |
| `camps` | Camp je Verein: Zeitraum, Alter, Kapazität, Preis in Cent, Anmeldefenster, `status` draft/published/closed/archived | Slug eindeutig je Verein |
| `camp_registrations` | Anmeldung: Eltern-/Kinddaten, Einwilligungen, `status`, `payment_status`, `registration_token`, `email_sent_at`/`email_error`, Zusatzantworten, Gesundheitsdaten-Einwilligung | **Kinderdaten, Art. 9.** Zusammengesetzter FK hält Camp und Anmeldung im selben Verein |
| `platform_owners` | Nutzer-IDs mit globalen Rechten | Serkan |
| `organization_members` | Nutzer ↔ Verein, Rolle nur `org_admin` | Benachrichtigungsspalten existieren, kein Code nutzt sie |
| `audit_log` | Wer hat was geändert | nur ausgewählte Aktionen (siehe 05) |

RLS ist aktiv, Lese-Policies und Spaltenrechte existieren. Die API greift mit
eigener DB-Rolle zu und filtert **immer** nach `organization_id`.

## Endpunkte (27 Pfade / 31 Operationen, identisch auf Staging und Production am 29.10.)

Öffentlich, ohne Login:
- `GET /api/v1/organizations/{org}` · `…/camps` · `…/camps/{camp}`
- `POST /api/v1/organizations/{org}/camps/{camp}/registrations` → 201 `registered` oder `waitlist`
- `POST /public/signup`, `POST /public/signup/resend` (Selbststart, 3 pro IP/Stunde, pro Instanz)
- `POST /public/pilot-request` (Kontaktformular Marketing)
- `GET /health` (prüft DB, zeigt `env`)

Admin (Bearer-Token, Rolle geprüft):
- `GET /admin/me`
- Vereine: `GET|POST /admin/organizations`, `GET|PATCH /admin/organizations/{org}`, `POST …/submit-review`, `POST …/review` (nur Owner)
- Mitglieder: `GET|POST …/members`, `DELETE …/members/{id}` (Zuordnung nur für bestehende Supabase-Konten)
- Camps: `GET|POST …/camps`, `PATCH …/camps/{camp}` (Veröffentlichen = `status`)
- Anmeldungen: `GET …/camps/{camp}/registrations`, `POST …/registrations/{token}/cancel`, `PATCH …/payment-status`, `PATCH …/details`, `POST …/waitlist/promote`
- Export: `GET …/camps/{camp}/export.xlsx?view=participants|payments|waitlist|daylist`, `GET /admin/organizations/{org}/export.xlsx`
- Plattform: `GET /admin/stats`, `GET /admin/registrations`, `GET /admin/audit-log`

Live-Doku: `https://campspilot-staging.onrender.com/docs`.

## Geschäftsregeln (im Code durchgesetzt)

1. **Sichtbarkeit:** Ein Verein ist öffentlich nur, wenn `plan_status` erlaubt,
   `site_published = true` und `review_status = 'approved'`. Sonst einheitlich 404.
2. **Anmeldung:** Anmeldefenster und Alter werden serverseitig geprüft (422).
   Org- und Camp-Zeile werden gesperrt, Kapazität wird in derselben Transaktion
   gezählt: frei → `registered`, voll → `waitlist`. Gleiches Kind doppelt → 409.
3. **Einwilligungen:** Teilnahmebedingungen und Datenschutz Pflicht. Allergien
   oder medizinische Hinweise nur mit `health_data_consent`. Foto optional.
4. **Status:** `registered → confirmed|cancelled`, `confirmed → cancelled`,
   `waitlist → registered|cancelled`, `cancelled` ist endgültig
   (`backend_saas/app/registration_lifecycle.py`). Ungültig → 409.
5. **Storno durch Admin** rückt automatisch die älteste Wartelisten-Anmeldung
   nach (gleiche Transaktion). `payment_status` bleibt dabei unverändert.
6. **Zahlung:** Überweisung. Eltern sehen IBAN und Verwendungszweck
   `"<Camptitel> CP-XXXXXXXX"`. Admin setzt `open|paid|refunded|waived` von Hand.
   Stripe gibt es nur als Spalten, nicht als Ablauf.
7. **Mail:** Bestätigung an Eltern + Info an Vereins-Kontakt nach jeder
   Anmeldung, best effort. Fehler brechen die Anmeldung nie ab, landen in
   `email_error`. Kein automatischer Retry.
8. **Selbststart:** Konto + Verein im Entwurf → Bestätigungsmail → Einrichtung →
   „Zur Prüfung einreichen“ (AVV Pflicht) → Owner gibt frei → Verein öffentlich.
9. **Identifier:** Nach außen nur `registration_token`, nie die interne `id`.
