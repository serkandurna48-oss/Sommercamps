# KSV Retention: lokaler Prüf- und Freigabeplan

Stand 27.10.2026. Das Skript `retention_dry_run.py` hat ausschließlich einen Leseweg.
Es nimmt eine explizite lokale PostgreSQL-DSN, eine Organisations-UUID und optional
`--as-of YYYY-MM-DD`. Nur Loopback-Hosts sind zugelassen; keine Umgebungsvariable wird
als Datenbankziel übernommen. Es gibt nur aggregierte Zahlen aus parameterisierten,
organisationsgebundenen SELECTs aus. Keine Namen, Kontakte, Tokens oder Gesundheitswerte.

Beispiel ausschließlich mit einer lokal erzeugten Testdatenbank:
`python scripts/retention_dry_run.py --dsn "host=localhost dbname=ksv_retention_test user=test" --organization-id 00000000-0000-0000-0000-000000000001 --as-of 2026-10-27`

## Prüfschritte

1. Nur eine autorisierte Person prüft den Organisationsbezug und `camps.end_date`.
   `health_review_rows` zählt Anmeldungen mit `allergies` oder `medical_notes`,
   deren Campende mindestens 30 Tage zurückliegt. Die mögliche manuelle Maßnahme
   ist das Setzen genau dieser beiden nullable Spalten auf NULL nach Einzelfallprüfung.
   `health_data_consent` bleibt als revisionsfähiger Nachweis erhalten. Für Altbestände
   mit Gesundheitsdaten und `health_data_consent=false` gibt es keine rückwirkende
   Einwilligung: diese Fälle sind gesondert zu bereinigen.
2. `general_manual_review_rows` zählt Anmeldungen ab 12 Monaten nach Campende.
   Eine Freigabe erfolgt erst nach Prüfung offener Zahlungen, Rückerstattungen,
   Streitfälle und erforderlicher Belege. Das Skript löscht keine Zeile und
   anonymisiert keine Felder. Es gibt keine automatische Freigabe anhand von
   `payment_status` allein.
3. In `camp_registrations` liegen allgemeine Daten und Finanzbezüge noch zusammen.
   `parent_first_name`, `parent_last_name`, `parent_email`, `parent_phone`,
   `child_first_name`, `child_last_name`, `child_birth_date` sind NOT NULL;
   `payment_status`, Stripe-IDs und Zahlungszeitpunkte können Belegbezug haben.
   Eine pauschale NULL-Aktualisierung oder DELETE ist deshalb gesperrt. Vor einer
   12-Monats-Löschung müssen steuerliche Buchungsbelege getrennt und die jeweilige
   gesetzliche Frist geprüft werden (für Buchungsbelege grundsätzlich acht Jahre).
4. `emergency_contact_phone` ist im Formular Pflicht, in der DB nullable. Das
   Skript zählt es nicht als freiwilliges Art.-9-Feld. Notfallkontakte,
   `pickup_authorized`, `extra_answers`, Exporte, E-Mail-Kopien und eventuelle
   weitere Datenträger sind bei der manuellen Freigabe gesondert zu prüfen.
5. Für Backups wird erst nach belegter Providerrotation eine Aussage zur
   Löschdauer getroffen. Eine feste Backupfrist ist hier nicht bekannt.

## Automatischer Lauf (Gesundheitsdaten)

Seit 10.11.2026 ruft der Workflow `.github/workflows/daily-jobs.yml` täglich um 04:17 UTC
`POST /internal/cron/daily` auf (Header `Authorization: Bearer <CRON_SECRET>`). Der Job
„Gesundheitsdaten“ setzt `allergies` und `medical_notes` von Anmeldungen, deren Camp mindestens
30 Tage zurückliegt, auf NULL; `health_data_consent` bleibt als Nachweis.

- Nur mit `RETENTION_APPLY=true`. Standard ist `false`: dann zählt der Job nur
  (`health_data_rows` in der Antwort) und schreibt einen Audit-Eintrag `retention.health_data`
  mit `{"rows": n, "mode": "dry_run"}`. Im Apply-Modus steht `mode: "apply"` darin.
- Der Audit-Eintrag enthält keine IDs, Namen oder Gesundheitswerte.
- Empfohlene Reihenfolge je Umgebung: Secret setzen, einige Tage im Zählmodus laufen lassen,
  Zahl mit `retention_dry_run.py` gegenprüfen, dann `RETENTION_APPLY=true` setzen.
- Die allgemeine 12-Monats-Löschung (Punkte 2 bis 5 oben) bleibt manuell. Der Job meldet nur die
  Zahl als `general_review_rows` und löscht oder anonymisiert nichts.

Es gibt weiterhin keinen automatischen Löschlauf für allgemeine Daten. Vor Release sind lokaler
Schema-Test der Migration, dokumentierte Finanzdatentrennung und ein freigegebener operativer
Löschprozess für die 12-Monats-Löschung erforderlich.
