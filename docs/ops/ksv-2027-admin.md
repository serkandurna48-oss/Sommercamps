# KSV 2027: kurze Admin-Anleitung (lokaler Kandidat, 27.10.2026)

## Termine und Plätze

Die fünf vorbereiteten Termine stehen in `backend_saas/seeds/ksv-2027-drafts.json`.
Sie sind **noch nicht in eine Kundendatenbank übernommen**. Im Admin nach einer
separaten, geprüften Übernahme: `/pilot/ksv-baunatal/dashboard` → Camp →
`/pilot/ksv-baunatal/camps/{campSlug}/konfiguration`. Dort lassen sich Titel,
Start-/Enddatum, Anmeldezeitraum, Kapazität, Preis und Texte wie Ort, Betreuung,
Verpflegung und Leistungen bearbeiten. Start- und Enddatum sind inklusive
Kalendertage; Anmeldezeiten sind Uhrzeiten und brauchen eine explizite Zeitzone.
Ein Camp bleibt bis zur **separaten Veröffentlichung** im Status `draft`.

Vor Übernahme je Camp den 2027-Preis, die Altersgrenzen, Öffnungszeiten und die
70 Plätze bestätigen. Die historischen Werte `5–12 Jahre` aus
`backend/camp_config.py` und `149,00 EUR` aus `backend/.env.example` /
`backend_saas/seeds/ksv-baunatal.sql` sind **Vorlagen, keine bestätigten
2027-Konditionen**. Bankdaten aus Beispieldateien sind keine Freigabequelle.

## Zusatzfragen

Vorgeschlagene Konfiguration: `backend_saas/seeds/ksv-2027-questions.json`.
Die bestehenden Feldkeys sind **`position`** und **`verein`**; der Vertrag ist
`RegistrationQuestion` in `backend_saas/app/schemas.py`, Antworten liegen in
`camp_registrations.extra_answers`. `other_label` aktiviert ein Freitextfeld
für „Anderer Verein“ (maximal 80 Zeichen). „Kein Verein“ ist als explizite
Auswahl vorgesehen. Der bestehende Vertrag speichert nur den Antworttext,
keinen historischen Fragen-Snapshot. Bei Änderung der Konfiguration können
alte Antworten andere/fehlende Labels im Admin oder Export bekommen. Deshalb
vor dem Setzen prüfen, ob `position`/`verein` bereits produktive Antworten
haben; vorhandene Antworten niemals umschreiben. Die geplante K27FORM-
Bedienoberfläche übernimmt Builder und Anzeige. Die aktuelle Route
`/pilot/ksv-baunatal/konfiguration` enthält noch ein JSON-Textfeld; sie ist
**kein** fertiger Builder.

## Liste und PDF

Camp öffnen: `/pilot/ksv-baunatal/camps/{campSlug}`. Die Teilnehmerliste hat
CSV/Excel-Export und „PDF / Drucken“. Letzteres öffnet den Browser-Druckdialog;
„Als PDF speichern“ erfolgt dort, es ist kein Direktdownload. Die vorhandenen
CPFB1/CPEX1-Funktionen für Spaltenauswahl und Export sind separat zu prüfen.
Backend-Routen: `GET /admin/organizations/ksv-baunatal/camps`,
`GET /admin/organizations/ksv-baunatal/camps/{campSlug}/registrations`,
`GET /admin/organizations/ksv-baunatal/camps/{campSlug}/export.xlsx?view=participants`.
Alle Admin-Routen erfordern Anmeldung. Diese Anleitung ist Code-Inventar,
kein bestandener Browser- oder Integrationstest der 2027-Drafts.
