# PostHog: Trichter im Anmeldeformular (Stand 18.11.2026)

Alles nur nach Einwilligung im Banner (`frontend/app/lib/saasAnalytics.ts`). Kein SDK, kein Cookie, keine Aufzeichnung.

Einwilligung Version 2 (`campspilot-analytics-consent-v2`, ab 18.11.2026): Die alte Zustimmung deckte nur Beginn, Erfolg und Fehlschlagen ab. Alle Eltern werden deshalb einmal neu gefragt; eine Antwort zur Version 1 wird gelöscht und nicht übernommen. Folge: Bis genug Eltern neu zugestimmt haben, sind die Zahlen kleiner als vorher.

## Ereignisse

| Ereignis | Wann | Eigenschaften |
|---|---|---|
| `camp_page_viewed` | Vereinsseite geöffnet | – |
| `camp_registration_started` | Formular geöffnet | – |
| `camp_registration_section_completed` | Abschnitt erstmals vollständig | `section` 1–4 |
| `camp_registration_failed` | Absenden scheitert | `error_kind`, `status_code`, `fields`, `first_field`, `field_count` |
| `camp_registration_abandoned` | Formular bearbeitet und ohne Absenden verlassen | `last_section`, `sections_done` |
| `camp_registration_succeeded` | Anmeldung gespeichert | `result` |

Abschnitte: 1 Kind, 2 Eltern und Anschrift, 3 Notfallkontakt, 4 Einwilligungen (inkl. Zusatzfragen und Zahlart).

`fields` enthält nur unsere Feldschlüssel aus einer festen Liste (`ANALYTICS_FIELD_KEYS`), nie Beschriftungen oder Eingaben. Zusatzfragen der Vereine erscheinen als `extra_question`, alles Unbekannte als `other`. Die Einwilligung zu Gesundheitsangaben erscheint bewusst nur als `other`: Der Schlüssel allein würde verraten, dass Allergien eingetragen wurden.

## So sind die Zahlen zu lesen

- Gezählt wird ab der ersten Eingabe der Eltern. Ein für ein Geschwisterkind vorausgefülltes Formular zählt erst, wenn jemand etwas ändert.
- „Abschnitt vollständig“ heißt: Alle Pflichtfelder des Abschnitts sind zum ersten Mal gültig. Abschnitte können in beliebiger Reihenfolge fertig werden (Autofill). Trichter in PostHog deshalb **ohne feste Reihenfolge** der Abschnitte bauen.
- `last_section` beim Abbruch ist die Zahl der von oben lückenlos fertigen Abschnitte (0 bis 4), `sections_done` die Zahl aller fertigen.
- Die Sitzungskennung gilt pro Browser-Tab. Wer das Formular verlässt und wieder öffnet, erzeugt „abgebrochen“ und danach neue Abschnitts-Ereignisse in derselben Sitzung. Abbruchquote also als „Sitzungen mit Abbruch und ohne Erfolg“ rechnen, nicht als rohe Ereigniszahl.
- Ein Campwechsel im Formular (Geschwister) zählt nicht als Abbruch. Ist ein Trainingstermin inzwischen vergeben, wird das Formular geschlossen und als Abbruch gezählt.
- Abbrüche werden eher zu niedrig gezählt: Mobile Browser melden das Schließen eines Tabs im Hintergrund nicht zuverlässig.
- Die öffentliche Demo sendet aus dem Formular nichts.

## Staging und Prod trennen

Jedes Ereignis trägt `environment` (`production`, `staging`, `development`).

**Pflicht in Vercel:** `NEXT_PUBLIC_ANALYTICS_ENVIRONMENT=production` für Production und `=staging` für Preview setzen. Ohne die Variable wird aus `NEXT_PUBLIC_VERCEL_ENV` abgeleitet; die gibt es nur, wenn in Vercel „Automatically expose System Environment Variables“ eingeschaltet ist. Fehlt beides, heißt die Umgebung `development` und der Prod-Filter bleibt leer.

Auswertungen für Prod filtern auf `environment = production`. Ereignisse vor diesem Stand haben die Eigenschaft nicht.

Ein eigenes PostHog-Projekt für Staging ist im aktuellen Tarif nicht möglich (Grenze: 1 Projekt, geprüft am 18.11.2026).

## Was die Zahlen nicht zeigen

Eltern, die die Nutzungsanalyse ablehnen oder den Banner nicht beantworten, werden nicht gezählt.
