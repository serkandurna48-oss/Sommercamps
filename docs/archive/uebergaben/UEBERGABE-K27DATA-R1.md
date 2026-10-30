# K27DATA-R1 – Übergabe, 27.10.2026

**Status:** Lokaler Review-Fix auf `fix/k27data-r1`; keine Review-Freigabe und kein neuer Commit, weil `git add` am Git-Index mit Zugriff verweigert scheiterte. Start: sauberer Worktree bei `d6dba8e4b2504665c83ecd05ebf554ae5dcef1d1`, Vergleichsbasis `8b0cc542d6b5c081e9533fb220e7bb41cd2ce4de`.

## Änderungen und Grund

| Pfad | Änderung |
|---|---|
| `backend_saas/app/schemas.py` | `camp_title` für `RegistrationCreated` verpflichtend, weiter von öffentlichen und Admin-Responses ausgeschlossen. Der leere Standard konnte still eine reine CP-Referenz erzeugen. |
| `backend_saas/app/repositories/registrations.py` | `RegistrationTarget.title` verpflichtend; Camp-Anmeldungen liefern `c.title AS camp_title` im selben, an `organization_id` und `camp_id` gebundenen Join. Keine zusätzliche Abfrage pro Anmeldung. |
| `backend_saas/app/routers/admin.py` | Zahlungsstatus- und Detailänderung verwenden den bereits tenantgebunden aufgelösten Camptitel für ihre Antwort. Die Listenroute nutzt den Repository-Row-Vertrag. |
| `backend_saas/tests/test_admin_registrations_api.py` | Alte Kindnamen-Erwartung entfernt; Pflichtfeld, tenantgebundene SQL-Parameter, zwei Camps, Eltern-/Admin-/Mail-Referenz und beide Admin-Aktionsantworten als Vergleichsfälle. |
| `backend_saas/tests/test_journey_end_to_end.py` | Alter CP-Präfix-/Kindnamen-Vergleich ersetzt; synthetischer DB-Ablauf mit Sommer und Winter für dieselbe Familie, API-/Mail-/Admin-Abgleich. |
| `backend_saas/tests/test_registrations_api.py`, `test_registrations_repository.py`, `test_registration_questions.py`, `test_s1_selbstregistrierung.py` | Synthetische `RegistrationTarget`-Fixtures an den verpflichtenden Titel angepasst; öffentliche API-Erwartung campabhängig. |
| `frontend/app/lib/zahlungserinnerung.test.ts` | Zwei Camp-Referenzen in Einzel-Erinnerung und Liste werden unverändert dem jeweiligen Camp zugeordnet. Keine Frontend-Implementierung geändert. |

## Vergleichsbelege aus Code und Testfällen

- Winter `12345678-…` → `Winter-Fußballschule 2027 CP-12345678`; Ostern `87654321-…` → `Oster-Fußballschule 2027 CP-87654321`. Der Admin-API-Test vergleicht die Eltern- und Admin-Modelle und den Mail-Body für beide Camps. `camp_title` bleibt außerhalb der JSON-Antwort; Kindnamen stehen nicht in der Referenz oder der automatisierten Elternmail.
- Der Journey-Test prüft Sommer und Winter mit derselben synthetischen Familie gegen die vorhandene lokale Test-DB-Fixture, sofern eine reguläre Laufzeit und Wegwerf-DB verfügbar sind. Er vergleicht Elternantwort, FakeProvider-Mail, Camp-Adminliste und Zahlungsstatus-Aktionsantwort.
- Die Zahlungserinnerung übernimmt `registration.payment_reference` unverändert. Der neue Frontend-Test prüft zwei verschiedene Camp-Referenzen sowohl im Erinnerungstext als auch in der Liste. Dieser Test wurde **nicht ausgeführt**.
- Der Camp-Listen-Join lautet `c.id = r.camp_id AND c.organization_id = r.organization_id`; die Abfrage filtert zusätzlich `r.organization_id` und `r.camp_id` mit Parametern. Die bestehende Admin-Authentisierung und Camp-Auflösung bleiben erhalten. Global-Owner-Abfrage und Legacy-Backend wurden nicht geändert.

## Tatsächlich gelaufene Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Start-`git status --short --branch`, `git rev-parse HEAD`, `git branch --show-current` | Exit 0; `fix/k27data-r1`, sauber, erwarteter Start-SHA. |
| `git diff --check` | Exit 0, keine Ausgabe. |
| PowerShell-Quellvertrag: tenantgebundener Join/Filter, verpflichtender Response-Titel, zwei Admin-Aktionsantworten, unveränderte Reminder-Übernahme, entfernte Alt-Assertion | Exit 0: `STATIC CONTRACT CHECK: OK ...`. Statischer Beleg, kein Laufzeittest. |
| `Get-Command python -ErrorAction SilentlyContinue` | Exit 0, kein Treffer: `python: nicht im PATH`. |
| `Get-Command node`; `Test-Path frontend/node_modules/.bin/vitest.cmd` | Exit 0; Node vorhanden, Vitest-Runner `False`. |
| `git add -- <genau die 11 Fix-/Test-/Übergabedateien>` | Exit 1: `Unable to create 'C:/Users/serka/Desktop/Projekte/Sommercamps/.git/worktrees/K27DATA-R1/index.lock': Permission denied`. Kein Staging und kein Commit; keine Rechteänderung oder Umgehung versucht. |

**Nicht ausgeführt:** gezieltes `python -m pytest` der betroffenen Module, gesamte `backend_saas/tests`-Suite, lokale DB-Integration und Frontend-Vitest. Die reguläre Python-Laufzeit fehlt im PATH; der vorhandene Python-3.13-Zielpfad war bereits mit „Zugriff verweigert“ gemeldet und wurde nicht erneut oder auf anderem Weg gestartet. Kein Test-PASS aus den statischen Prüfungen abgeleitet. Kein Paket installiert, keine DB, Cloud, echte Mail, Zahlung, Push oder Deploy genutzt.

## Rollback

Nur uncommittete lokale Code-, Test- und Übergabeänderungen, keine Datenänderung. Für den Rollback diese 11 eigenen Dateien im Worktree auf `d6dba8e4b2504665c83ecd05ebf554ae5dcef1d1` zurücksetzen beziehungsweise die neue Übergabedatei entfernen. Nicht pauschal andere Branches oder Datenbanken zurücksetzen; ein Daten-Rollback entfällt.
