# Runbook: Datenbankausfall

Scope: Render FastAPI Backend, Supabase PostgreSQL, psycopg2 Connection Pool, `/health`.

## Vor einem Render-Restart sichern

Keine Secrets, keine Kinderdaten, keine Allergieinformationen kopieren.

Sichern:

- UTC-Zeitpunkt des Ausfalls.
- `/health` HTTP-Status, Antwortstruktur und Latenz.
- Ob der erste Request langsamer war als Folgeanfragen.
- Relevante Render-Logs direkt vor dem Fehler.
- Exception-Klasse, zum Beispiel `OperationalError`, `InterfaceError`, `PoolError`.
- PostgreSQL-Fehlercode (`pgcode`), falls vorhanden.
- Render-Deploy-ID.
- Render-Instanz-/Restart-Zeitpunkt.
- Prozess-Startzeit und letzter Deploy-Zeitpunkt.
- Supabase-Statusseite und Projektstatus.
- Supabase Pooler-Metriken, soweit im Dashboard sichtbar.
- Anzahl unmittelbar vorheriger Requests, wenn Render das anzeigt.
- Zeitpunkt der letzten erfolgreichen Anmeldung oder des letzten erfolgreichen Admin-Reads, ohne personenbezogene Details.
- Auftreten von Log-Events:
  - `db_connection_discarded`
  - `db_connection_checkout_failed`
  - `db_connection_return_failed`
  - `db_transaction_rollback_failed`
  - `db_pool_reset_started`
  - `db_pool_reset_finished`

## Akute Massnahmen

1. `/health` pruefen.
2. Logs und Metadaten aus dem Abschnitt oben sichern.
3. Render-Deploy-ID und letzte Deployment-Zeit notieren.
4. Supabase- und Render-Statusseiten pruefen.
5. Wenn DB weiter nicht erreichbar ist: Render-Service kontrolliert neu starten.
6. Nach Neustart `/health` erneut pruefen.
7. Admin-Login und einen read-only Admin-Listenaufruf pruefen.
8. Incident-Dokument oder Ticket mit Zeitachse aktualisieren.

## Nachbereitung

- Ursache kategorisieren:
  - defekte Connection im lokalen Pool
  - Pool-Erschoepfung
  - Supabase/PgBouncer-Verbindungsabbruch
  - Render Netzwerk/DNS/TLS
  - Runtime/Dependency/Deploy-Drift
  - externe regionale Stoerung
  - unbekannt
- Zeitraum und Auswirkung dokumentieren.
- Anzahl betroffener Nutzer/Requests schaetzen, ohne PII in das Ticket zu kopieren.
- Regressionstest ergaenzen, falls ein neuer Fehlerpfad sichtbar wurde.
- Monitoring-Ausloesung pruefen: wurde der Ausfall erkannt, wie schnell, durch wen?
- Backlog aktualisieren.

## Datenschutzregeln

Nicht in Logs, Tickets oder Chat kopieren:

- Namen von Kindern oder Eltern.
- E-Mail-Adressen.
- Telefonnummern.
- Geburtsdaten.
- Allergien oder medizinische Hinweise.
- JWTs.
- Passwoerter.
- Stripe-Secrets.
- Brevo-Keys.
- Vollstaendige Connection Strings.
- SQL-Parameter mit personenbezogenen Daten.

## Schonender Health-Test

Erlaubt ist ausschliesslich der oeffentliche read-only Endpunkt:

```text
https://sommercamps.onrender.com/health
```

Empfohlen:

- 10 bis 20 Requests.
- Mindestens 1 bis 2 Sekunden Abstand.
- Status, Latenz und Fehlerart erfassen.
- Keine Lasttests.

Ein erfolgreicher kurzer Health-Test beweist nur die momentane Erreichbarkeit.
