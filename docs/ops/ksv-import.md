# KSV-CSV-Import – lokale Vorbereitung (L5)

BASE_SHA `62abb4c`. Nach dem ersten Mapping-Stopp hat Serkan die lokale Umsetzung
freigegeben. Offene Fachfragen werden durch einen explizit angereicherten CSV-Vertrag
abgesichert: Keine Namensaufteilung, Einwilligung oder medizinische Zuordnung wird geraten.

## Schemaquellen

`backend/schema.sql`, sämtliche `backend/migration_*.sql` und
`backend/main.py` (RegistrationIn/RegistrationOut, Registrierungsschreibpfad).
Ziel: `supabase/migrations/20260917133748_create_saas_schema_v1.sql`, ergänzt durch
`20260922143506_add_theme_and_parent_flow_fields.sql` (Trikotgröße) und
`20261018000000_add_email_tracking_to_camp_registrations.sql` (Mail-Tracking).
Weitere Zielmigrationen lösen die unten genannten fachlichen Lücken nicht.

## Vollständiger Feldabgleich der KSV-Anmeldungen

| Legacy-Feld | SaaS-Feld | Regel / Lücke |
|---|---|---|
| id | id | UUIDv5 im Namespace NAMESPACE_URL aus `ksv-import:<organization_id>:<Legacy-id>`. Quell-ID muss UUID sein. |
| created_at | created_at | ISO-Zeitstempel mit Zeitzone erhalten. |
| child_first_name | child_first_name | Text übernehmen. |
| child_last_name | child_last_name | Text übernehmen. |
| birth_date | child_birth_date | Strikt YYYY-MM-DD, Datum auf Gültigkeit/Plausibilität prüfen. Kein Alter umrechnen. |
| parent_name | parent_first_name + parent_last_name | Separate CSV-Zusatzfelder erforderlich. Zusammengesetzt müssen sie parent_name entsprechen (Leerraum normalisiert). Keine automatische Aufteilung. |
| email | parent_email | Text übernehmen, Format validieren. |
| phone | parent_phone | Text übernehmen, führende Nullen erhalten. |
| selected_camp_week | camp_id | Manuell geprüftes Zusatzfeld camp_slug muss ein bestehendes Camp derselben Org bezeichnen. Wochenstring bleibt Quellbeleg in der CSV. |
| jersey_size | jersey_size | Exakten Größenwert übernehmen, auch Joma-Werte; keine Größenumrechnung. Leer = NULL. |
| allergies | allergies | Text übernehmen; niemals im Bericht ausgeben. |
| notes | kein allgemeines Notizfeld | Nichtleere Werte ablehnen. Sonstige Elternhinweise sind nicht automatisch medical_notes oder pickup_authorized. Entscheidung für Serkan. |
| consent_privacy | privacy_accepted | Explizites true erforderlich; historischen Nachweis prüfen. |
| consent_privacy | kein belegtes terms_accepted | Zusatzspalte terms_accepted muss separat belegt true enthalten. Keine Verdopplung einer Zustimmung. |
| status | status | registered, confirmed, cancelled, waitlist unverändert. Unbekannt = Fehler. |
| payment_status | payment_status | open, paid, refunded, waived, cancelled unverändert. Unbekannt = Fehler. |
| registration_token | registration_token | UUID erhalten; Kollision als Fehler melden. |
| email_sent_at | email_sent_at | Zeitstempel/NULL erhalten; kein Mailversand. |
| stripe_session_id | stripe_session_id | Text/NULL erhalten; Kollision als Fehler, keine Stripe-Anfrage. |
| photo_permission | photo_permission | Boolean explizit erhalten; kein stillschweigendes true. |
| paid_at | paid_at | Zeitstempel/NULL erhalten; nicht aus Zahlstatus erfinden. |

`bank_account_holder`, `bank_iban`, `bank_bic`, `bank_name`, `bank_purpose` aus
RegistrationOut sind berechnete Antwort-/Konfigurationswerte, keine Legacy-Tabellenspalten.
Kein Überschreiben von organizations.iban.
`training_inquiries` aus migration_inquiries.sql ist ausdrücklich JK-only, keine
KSV-Anmeldung (siehe Migrationskommentar und INQUIRIES_ENABLED).

Zusätzliche Zielspalten: organization_id ausschließlich aus geprüftem org-slug.
emergency_contact_name/phone, medical_notes, pickup_authorized,
stripe_payment_intent_id und email_error ohne eindeutige Legacy-Quelle bleiben NULL.
updated_at ist Zielmetadatum. Organisationen, Camps und Konfiguration werden nicht importiert.

## Offene Entscheidungen vor echter Datenübernahme

1. Geprüfte separate Elternnamen bereitstellen; keine Heuristik für Mehrfachnamen.
2. Historische AGB-Zustimmung gesondert nachweisen oder nachholen. Eine CSV-Spalte ist
   kein Ersatz für diesen Nachweis.
3. Verlustfreie Zielablage allgemeiner notes festlegen. Schemaänderungen liegen außerhalb L5.
4. Historische selected_camp_week-Werte explizit den Ziel-Camp-Slugs zuordnen.
5. Lokalen Identitätsschlüssel (UUIDv5 wie oben) und Konfliktverhalten vor echter Übernahme
   bestätigen. Abweichende vorhandene Daten werden nicht überschrieben.

## CSV-Vertrag

UTF-8 mit optionalem BOM, Komma, Kopfzeile. Alle Quellspalten aus der Tabelle müssen
vorhanden sein (optionale Inhalte dürfen leer sein), zusätzlich
`parent_first_name,parent_last_name,camp_slug,terms_accepted`. Vollständiger Header:
`backend_saas/tests/fixtures/ksv_sample.csv`. Keine zusätzlichen oder doppelten Header;
fehlende/überzählige Zellen führen zum Fehler. Äußerer Leerraum wird entfernt,
optionale leere Inhalte werden NULL. Booleans exakt `true`/`false`.
Zeitstempel brauchen ISO-Format mit Zeitzone. Pflichtfelder dürfen nicht leer sein.
Die CSV ist ein angereicherter Exportvertrag, kein unverändert importierbarer Altexport.

## Sicherheit, Bericht und Idempotenz

DATABASE_URL ausschließlich aus der Umgebung; keine .env-Datei und kein App-Import.
L5 akzeptiert nur **127.0.0.1:55443/dev_l5**. Andere Hosts, Datenbanken,
hostaddr-Umleitungen und libpq-Services werden vor Verbindungsaufbau abgelehnt.
Die verbotenen Ziele des Auftrags bleiben unabhängig von Bestätigungen gesperrt.
Enthält die URL Prod-/Staging-Kennungen, erfordert Apply zusätzlich
`--target-confirm 127.0.0.1` (exakt Host ohne Port). Diese Bestätigung erweitert
nicht die lokale Freigabe auf entfernte Systeme.

Standard ist ein DB-seitig schreibgeschützter Dry-Run. JSON: rows, valid, duplicates,
existing, written und errors mit statischem Fehlergrund und Zeilennummer; bei mehrzeiligen
CSV-Zellen die letzte physische Zeile des Datensatzes. Keine Personen-/Gesundheitsdaten.
Exit 0 bei fehlerfreiem Lauf, Exit 2 bei Validierungs-, Konflikt-, Ziel- oder DB-Fehlern.

Apply ist atomar: Eine fehlerhafte Zeile verhindert sämtliche Inserts.
Ein zweiter identischer Lauf meldet existing statt neue Zeilen anzulegen; abweichende
Daten zur selben Import-ID sind ein Konflikt. Gleiche Quell-ID oder Kind/Camp
(Namen ohne Beachtung der Großschreibung + Geburtsdatum), Token und Stripe-ID
werden auf Duplikate geprüft. Gleichnamige gleichaltrige Kinder erfordern manuelle
Klärung; kein stilles Zusammenführen. Globale Token-/Stripe-Kollisionen werden ohne
Ausgabe fremder Inhalte gemeldet. Die Import-ID enthält den Mandanten.

Ein transaktionaler Advisory-Lock serialisiert parallele Läufe dieses Skripts.
Constraints sichern Token und Mandant/Camp zusätzlich ab. Kein Ersatz für einen
Wartungsmodus gegenüber anderen Schreibern. Keine Mails, Stripe-Anfragen,
Schemaänderungen oder Organisations-/Camp-Erstellung durch den Import.

## Lokal ausprobieren

Python mit bestehendem psycopg2-binary; keine neue Dependency. PostgreSQL über das im
Auftrag benannte pg-start.ps1 starten. Die Tests benötigen keine App und kein pytest.
Sie erzeugen bei Bedarf dev_l5 und wenden die unveränderten relevanten Migrationen an
(Basisschema, Eltern-Flow-Felder, Mail-Tracking). Bestehende Schemata bleiben erhalten.
Synthetische Testorganisationen/-camps mit Zufalls-IDs werden je Test wieder entfernt.

```powershell
$env:REVIEW_POSTGRES_PORT='55443'
python -m unittest discover -s backend_saas/tests -p test_import_ksv.py -v
```

Ein fehlender lokaler DB-Zugang ist ein Testfehler, kein Skip. Belege: Zählung, Mapping
aller Zahlstatus, Idempotenz, andere Org unverändert, parallele Läufe, Konflikte,
Datum/Pflichtfelder, Einwilligungen, Token/Stripe, Header und Zielschutz.

Für manuellen Import müssen Organisation ksv-baunatal und Camp sample-week bereits
in dev_l5 angelegt sein (ausschließlich synthetische Kontaktdaten verwenden).
Die Fixture hat 30 Datensätze: 26 gültige, ein kaputtes Datum, eine fehlende Pflichtangabe,
eine doppelte Anmeldung und eine ungeklärte notes-Zeile. Dry-Run meldet vier Fehler
und Exit 2; auch Apply schreibt damit nichts:

```powershell
$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55443/dev_l5'
python backend_saas/scripts/import_ksv.py --csv backend_saas/tests/fixtures/ksv_sample.csv --org-slug ksv-baunatal
# Nach Klärung/Korrektur fehlerhafter Zeilen in einer separaten CSV:
python backend_saas/scripts/import_ksv.py --csv <gepruefte-datei.csv> --org-slug ksv-baunatal --apply
```

Die Tests prüfen einen bereinigten Ausschnitt auch mit Apply und Wiederholung.

## Rollback

Tests räumen ihre Datensätze auf; dev_l5 und Schema bleiben erhalten.
Vor manuellem Apply geprüfte Quell-CSV, Bericht und Ziel-Backup aufbewahren.
Rücknahme ausschließlich nach Prüfung der aus Org-ID/Quell-ID berechneten Import-IDs;
kein pauschales Löschen aller Organisations-Anmeldungen. Kein automatischer DB-Rollback.
Code-Rollback: L5-Commits revertieren.
