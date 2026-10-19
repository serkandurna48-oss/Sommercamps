# KSV-CSV-Import – Mapping und offene Entscheidungen (L5)

Status: **blockiert vor Implementierung**, BASE_SHA `62abb4c`.
Der Auftrag verlangt STOPP bei uneindeutigem Mapping. Es existiert noch kein Import-Skript.

## Quellen

- `backend/schema.sql`: vollständiges Ausgangsschema.
- `backend/migration_*.sql`: Token/Mail/Stripe, photo_permission, paid_at,
  Zahlungsstatus cancelled, Trikotgrößen und Geburtsdatum-Plausibilität.
- `backend/main.py`: RegistrationIn/RegistrationOut und Registrierungsschreibpfad.
- `supabase/migrations/20260917133748_create_saas_schema_v1.sql`: Zielbasis.
- `supabase/migrations/20260922143506_add_theme_and_parent_flow_fields.sql`:
  jersey_size und pickup_authorized.
- `supabase/migrations/20261018000000_add_email_tracking_to_camp_registrations.sql`:
  Mail-Tracking. Weitere Zielmigrationen schaffen keine Lösung für die unten genannten Lücken.

## Feldmapping der KSV-Anmeldungen

Direkte Zuordnungen sind Schemafeststellungen, noch keine ausgeführten Transformationen.

| Legacy-Feld | SaaS-Ziel | Umwandlung / Lücke |
|---|---|---|
| id | id oder Importidentität | Entscheidung: Quell-ID erhalten oder deterministische Ziel-ID? Mandant und Quellsystem müssen zum Schlüssel gehören. |
| created_at | created_at | Zeitzonenbehafteten Zeitstempel erhalten. |
| child_first_name | child_first_name | Direkt. |
| child_last_name | child_last_name | Direkt. |
| birth_date | child_birth_date | DATE; CSV-Format festlegen (Vorschlag ISO YYYY-MM-DD), ungültiges Datum ablehnen. Nicht aus Alter berechnen. |
| parent_name | parent_first_name + parent_last_name | **STOPP:** Ein Freitextname ist nicht eindeutig teilbar; keine automatische Wortaufteilung. |
| email | parent_email | Direkt; Format validieren. |
| phone | parent_phone | Direkt als Text, führende Nullen erhalten. |
| selected_camp_week | camp_id | **STOPP:** Freier Wochenstring ist kein Camp-Schlüssel. Explizite Zuordnung zu bestehenden Camps derselben Org erforderlich. |
| jersey_size | jersey_size | Exakten Text erhalten, inklusive Joma-Größen und Gedankenstrich; NULL bleibt NULL. Keine Größenumrechnung. |
| allergies | allergies | Direkt; sensible Daten nicht in Berichte/Logs aufnehmen. |
| notes | kein allgemeines Notizfeld | **STOPP:** Sonstige Elternhinweise sind nicht zwingend medical_notes oder pickup_authorized. Keine medizinische Umdeutung und kein Weglassen. |
| consent_privacy | privacy_accepted | Inhaltlich Datenschutz; Nachweisumfang der historischen Zustimmung prüfen. |
| consent_privacy | terms_accepted | **STOPP:** Getrennte Zielpflicht; keine belegte eigenständige AGB-Zustimmung im Quellfeld. Nicht stillschweigend true setzen. |
| status | status | registered, confirmed, cancelled, waitlist identisch. |
| payment_status | payment_status | open, paid, refunded, waived, cancelled identisch; unbekannte Werte ablehnen. |
| registration_token | registration_token | UUID erhalten, Kollisionsbehandlung festlegen; keine neuen öffentlichen Token ohne Entscheidung. |
| email_sent_at | email_sent_at | Zeitstempel erhalten; Import löst keine E-Mail aus. |
| stripe_session_id | stripe_session_id | Text erhalten; globale Ziel-Unique-Constraint beachten. Keine Stripe-Anfragen. |
| photo_permission | photo_permission | Boolean erhalten; fehlend nicht als Zustimmung interpretieren. |
| paid_at | paid_at | Zeitstempel/NULL erhalten; nicht aus Status erfinden. |

`bank_account_holder`, `bank_iban`, `bank_bic`, `bank_name`, `bank_purpose` aus
RegistrationOut sind berechnete Antwort-/Konfigurationswerte, keine Spalten aus
camp_registrations. Kein stilles Überschreiben von organizations.iban.
`training_inquiries` aus migration_inquiries.sql ist ausdrücklich JK-only und kein
KSV-Anmeldedatensatz (siehe Kommentar der Migration und INQUIRIES_ENABLED).

Zusätzliche Zielfelder: organization_id wird ausschließlich über den geprüften org-slug
aufgelöst. emergency_contact_name/phone, medical_notes, pickup_authorized,
stripe_payment_intent_id und email_error haben keine eindeutige Legacy-Quelle.
updated_at ist Zielmetadatum. Keine Inhalte oder Einwilligungen erfinden.

## Entscheidungen für Serkan vor Fortsetzung

1. Soll der CSV-Export geprüfte separate parent_first_name/parent_last_name enthalten?
2. Wie wird die historische AGB-Einwilligung nachgewiesen oder nachgeholt?
   consent_privacy alleine wird nicht automatisch zu zwei Einwilligungen.
3. Welche verlustfreie Ablage ist für allgemeine notes freigegeben?
   Das aktuelle Zielschema enthält dafür keine Spalte; Schemaänderungen sind außerhalb L5.
4. Welche explizite Tabelle ordnet historische selected_camp_week-Werte den Ziel-Camps zu?
5. Welcher Importidentitätsschlüssel und welche Konfliktregel gelten bei geänderten
   Quelldaten? Vorschlag zur Entscheidung: deterministische UUID aus Quellsystem,
   organization_id und Legacy-id; vorhandene abweichende Daten als Konflikt ablehnen.
   Kindname/Geburtsdatum alleine sind kein sicherer Idempotenzschlüssel.

## Noch ausstehende Umsetzung und Nachweise

Nach Entscheidungen: CSV-Vertrag festlegen, Dry-Run-Bericht ohne personenbezogene Inhalte,
atomarer Apply, exakte Hostbestätigung für Prod/Staging und Sperre der im Auftrag
verbotenen Ziele, mandantengeprüfte Camps, Idempotenz und Konflikterkennung.
Synthetische Fixture mit mindestens 30 Zeilen und echte PG-Tests ausschließlich auf
127.0.0.1:55443/dev_l5. Tests sollen Pflichtfelder, kaputte Daten, doppelte Kinder,
zweiten Lauf, fremde Org und URL-Schutz prüfen. Keine Tests ausgeführt, keine
DB-Verbindung aufgebaut; SKIPPED_TESTS=0 bedeutet hier ausdrücklich keine Testabdeckung.

Rollback dieses Dokumentationsstands: Dokumentationscommit revertieren.
Kein Datenrollback erforderlich, da kein Import stattgefunden hat.
