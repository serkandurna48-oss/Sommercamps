feat/cx33-selbststart
STATUS: fertig zur Prüfung

Frontend-Sackgassen des Selbststarts geschlossen. Grundlage: Code-Durchgang, gerenderte Komponenten mit Vitest und unabhängiger Read-only-Review. Kein echter Verein wurde registriert und keine E-Mail versendet. Ausgangs-SHA: `8a3f85a5fa2e0b5ad32750e5c4288343ff59a3e3`; geprüft werden die uncommitteten Änderungen dieses Worktrees.

Der tatsächliche Ablauf unterscheidet sich von der vorgegebenen V1-Reihenfolge: **Registrieren → E-Mail bestätigen → Anmelden → Einrichtung und erstes Camp → Einreichen → Freigabe → Camp veröffentlichen → Elternlink teilen.** Die Freigabe veröffentlicht im Backend bereits die Vereinsseite. Eine vorgelagerte Freigabe vor dem Wizard ist nicht implementiert. Die offenen Backend-/E-Mail-Punkte stehen unten.

## WEG-TABELLE

Alle Frontend-Dateipfade in dieser Tabelle beginnen mit `frontend/app/`.

| Schritt | Route / Datei | Was der Verein sieht | Nächste Aktion | Kann er steckenbleiben? |
|---|---|---|---|---|
| Marketing | `/campspilot`; `(marketing)/campspilot/page.tsx`. `/` führt nur im Marketing-Modus hierher. | „Verein kostenlos anlegen“, zusätzlich „Bereits registriert? Anmelden“ unter dem unteren Registrierungsaufruf. | `/campspilot/registrieren` öffnen; bestehendes Konto über `/campspilot/anmelden` öffnen. | Frontend: nein. Beide Einstiege sind vorhanden. |
| Verein registrieren | `/campspilot/registrieren`; `RegistrierenForm.tsx`, `registrieren/page.tsx` im Marketing-Verzeichnis | Vereinsname, Ansprechpartner, E-Mail, Passwort, Bedingungen. Jetzt ehrlicher Hinweis auf Einrichtung und anschließende Prüfung statt „Sie starten heute noch“. | Formular absenden; bei vorhandenem Konto über „Zur Anmeldung“ weiter. Logo und „Zur Übersicht“ führen zurück. | Frontend: behoben. Ein 409 bietet einen funktionierenden Login-Link und verspricht keinen nicht vorhandenen Passwort-Reset. Registrierung/Versand selbst bleiben Backend-Aufgaben. |
| E-Mail-Bestätigung | Erfolgsansicht derselben Registrierungsroute; `RegistrierenForm.tsx` | Postfach, Spam-Hinweis, Rückkehr zur Anmeldung, Hinweis zum Speichern der Anmeldeseite. Neuversand meldet Anfrage oder Fehler ehrlich. | E-Mail-Link öffnen, anschließend `/pilot/{org}/login`; alternativ zentrale Anmeldung. | Teilweise extern: Bestätigungslink hat kein explizites vereinsbezogenes Rückkehrziel. Das Frontend bietet einen manuellen Weiterweg. |
| Login | `/pilot/{org}/login` und neu `/campspilot/anmelden`; `pilot/[org]/login/{LoginForm.tsx,actions.ts}`, Marketing-`anmelden/page.tsx` | E-Mail/Passwort, Bestätigungshinweis, Neuversand bei verlorener/abgelaufener Mail, verständliche Fehlermeldungen, Rückweg zu CampsPilot. | Anmelden. Zentrale Anmeldung nutzt `/platform` und dessen bestehende Rollenprüfung zum eigenen `/pilot/{org}/dashboard`. | Frontend: behoben. Neuversand funktioniert auch nach Schließen der Registrierungsansicht. Passwort-Wiederherstellung bleibt offen. |
| Warten auf Freigabe | `/pilot/{org}/dashboard` bzw. `/pilot/{org}/einrichtung?schritt=4`; `components/saas/state/{OnboardingCard,ReviewPending,SubmitReviewButton}.tsx` | Nach Einreichen: Prüfstatus, „meist innerhalb eines Werktags“, Erklärung, dass kein erneutes Einreichen nötig ist. | „Freigabestatus aktualisieren“ lädt Schritt 4 vollständig neu; „Hilfe zur Einrichtung“ öffnet `/pilot/{org}/hilfe`. | Frontend: behoben. Kein irreführendes „Jetzt veröffentlichen“ während der Prüfung. Extern: Betreiberfreigabe bleibt erforderlich; dieser Zustand liegt derzeit erst nach der Einrichtung. |
| Einrichtungsassistent | `/pilot/{org}/einrichtung`; `components/saas/screens/EinrichtungScreen.tsx`, `actions/wizardActions.ts` | Vier Schritte: Auftritt, Rechtliches, erstes Camp, Prüfen/Einreichen. Weiter/Zurück und gezielte „ergänzen“-Aktionen. | Angaben speichern, Camp anlegen, zur Freigabe einreichen. Nach Freigabe direkt Camp bzw. Vereinsseite veröffentlichen. | Frontend: behoben. Unveröffentlichte Elternseite wird nicht mehr als vermeintliche Vorschau verlinkt. Die frühere Wizard–Dashboard-Schleife ist geschlossen. |
| Erstes Camp | `/pilot/{org}/einrichtung?schritt=3` oder `/pilot/{org}/camps/new`; `config/CampCreateForm.tsx`, `actions/configActions.ts`, `screens/CampConfigScreen.tsx` unter `components/saas/` | Leere Übersicht hat bereits „Camp anlegen“. Nach Anlegen: Camp-Entwurf mit Ort, Ablauf und Anmeldezeitraum. | Speichern; neuer Link „Weiter zur Einrichtung und Freigabe“ führt zu `/pilot/{org}/einrichtung?schritt=4`. | Frontend: behoben. Nach dem Redirect zur Camp-Konfiguration geht die Führung zum Wizard nicht mehr verloren. |
| Freigabe / Veröffentlichung | `/pilot/{org}/einrichtung?schritt=4`, `/pilot/{org}/konfiguration#publication`, `/pilot/{org}/camps/{camp}/konfiguration`; `OnboardingCard.tsx`, `EinrichtungScreen.tsx`, `config/{PublishToggle,CampPublicationCard}.tsx` | Freigabe und getrennte Sichtbarkeit von Vereinsseite und Camp. „Jetzt veröffentlichen“ führt direkt zum noch notwendigen Schritt. | Camp veröffentlichen; falls Vereinsseite noch Entwurf ist, auch diese veröffentlichen. | Frontend: behoben. Keine Rückschleife; Sie-Ansprache statt Du/technischer 404-Erklärung. Die reguläre Backend-Freigabe setzt die Vereinsseite bereits öffentlich. |
| Link teilen | Veröffentlichungsbereich / Dashboard; `config/{PublishToggle,CampPublicationCard}.tsx`, `state/{ParentLinkActions,LaunchSuccessCard}.tsx` | Elternseite öffnen, „Anmeldelink kopieren“, Erklärung zum Teilen; bei Erfolg „Anmeldelink kopiert.“ | Vollständigen Link mit aktueller Domain und `/pilot/{org}` kopieren und teilen. Bei Clipboard-Fehler erst Elternseite öffnen und dort die Browseradresse kopieren. | Frontend: behoben. Nach Veröffentlichung der Vereinsseite sind auch Camp-Prüfung und Kopieraktion erreichbar. Nur veröffentlichte Camps erscheinen öffentlich. |
| Elternseite / erste Anmeldung | `/pilot/{org}`; `pilot/[org]/{page,ParentFlow,RegistrationFormScreen,DoneScreen}.tsx` | Vereinsseite, Camp-Auswahl, Campdaten, Anmeldeformular, Bestätigung. Bereits vorhandene Leer-, Fehler- und Rückkehrzustände. | Camp wählen, Kind anmelden, Bestätigung lesen. | Kein neuer Frontend-Blocker im Code-Durchgang. Anmeldung/Bestätigungsmail benötigen funktionierendes Backend. `RegistrationFormScreen.tsx` blieb ausdrücklich unverändert. |

## GESCHLOSSEN

| Sackgasse / Korrektur | Testnachweis |
|---|---|
| Marketing und vorhandenes Konto ohne bekannte Vereinsadresse → zentrale Anmeldung | `marketing.test.tsx`, `RegistrierenForm.test.tsx`, `pilot/[org]/login/selfstart.test.tsx` |
| Irreführendes Sofortstart-Versprechen, fehlende Erklärung nach E-Mail-Versand | `RegistrierenForm.test.tsx` prüft Freigabehinweis, Spam-Hinweis und vereinsbezogenen Login-Link. |
| Stiller Fehler beim erneuten Mailversand | `RegistrierenForm.test.tsx`: 202, 429, 503, Verbindungsfehler; Login-Link bleibt erhalten. |
| Verlorene/abgelaufene Mail nach Schließen der Erfolgsansicht | Login-`selfstart.test.tsx`: Neuversand aus dem Login für 202, 429, 503 und Verbindungsfehler ohne Passwortpflicht. |
| Technische Loginmeldung und fehlender Rückweg | Login-`selfstart.test.tsx`: deutscher Wiederholhinweis, Bestätigungshinweis, Rücklink nach `/campspilot`. |
| Wartender Verein ohne klare Statusabfrage | SaaS-`selfstart.test.tsx` und `SubmitReviewButton.test.tsx`: Dauer, korrekte Aktualisierungsroute, Hilfe; kein voreiliges Veröffentlichen. |
| Netzwerkfehler hält Einreichung dauerhaft auf „Wird eingereicht“ | `SubmitReviewButton.test.tsx`: Fehlermeldung und erneutes Öffnen des Einreichungsdialogs. |
| Vorschau einer unveröffentlichten Elternseite führt zu 404 | SaaS-`selfstart.test.tsx`: verständlicher Hinweis statt Elternlink, Einreichungsaktion bleibt vorhanden. |
| Freigabe → Wizard → Dashboard ohne Veröffentlichungsaktion | SaaS-`selfstart.test.tsx`: direkte Vereins-/Camp-Konfigurationsrouten abhängig vom Veröffentlichungsstand. |
| Camp angelegt, Rückweg zur Einrichtung fehlt | SaaS-`selfstart.test.tsx`: Speichern-Hinweis und neuer Weiter-Link zu Schritt 4. |
| Nach Veröffentlichung der Vereinsseite fehlen Elternlink und Kopierbestätigung | `PublishToggle.test.tsx`: Camp-Übersicht, Elternroute, vollständige Clipboard-URL, Erfolg und Fehlerfall. |
| Unklare Clipboard-Fehler und Du-Ansprache beim Veröffentlichen | `LaunchSuccessCard.test.tsx`, `CampPublicationCard.test.tsx`: zuerst Elternseite öffnen, korrekte Route und Sie-Texte. |

Neue Texte bleiben bei bestehender Nutzung im Wörterbuch `frontend/app/lib/i18n/de.ts`. Vorhandene Gestaltung und Theme-Variablen werden weiterverwendet; keine neuen Pakete oder erfundenen Vereinsdaten. Der Neuversand-Timer der Registrierung wird beim Verlassen aufgeräumt.

## OFFEN

- `backend_saas/app/supabase_auth.py`, `generate_confirmation_link`: Bestätigungslink mit explizitem sicheren Rückkehrziel zur Vereinsanmeldung erzeugen; derzeit nur `type` und `email`, daher abhängig von der Auth-Konfiguration.
- `backend_saas/app/notifications/sending.py`, `send_signup_confirmation_email`: dauerhaften Anmeldelink und verständlichen Weiterweg nach der Bestätigung in die Mail aufnehmen.
- `backend_saas/app/notifications/sending.py`, Freigabemail: Anmeldelink und nächsten Schritt „Camp prüfen und veröffentlichen“ ergänzen; die Freigabe veröffentlicht die Vereinsseite, noch nicht das Camp.
- `backend_saas/app/repositories/organizations.py`, Freigabe/Review-Ablauf: für die gewünschte V1-Reihenfolge eine Kontofreigabe vor dem Wizard von der Veröffentlichung der fertig eingerichteten Vereinsseite trennen. Aktuell wird erst nach Einrichtung und erstem Camp eingereicht.
- `frontend/app/pilot/[org]/login/actions.ts` und Auth-/E-Mail-Konfiguration: Passwort-Wiederherstellung als eigenen gesicherten E-Mail-Ablauf ergänzen. Keine nicht vorhandene Reset-Funktion mehr in der Registrierung versprechen.

BLOCKER: extern - Der gewünschte Freigabeschritt vor der Einrichtung sowie zuverlässige Rückkehrlinks aus Bestätigungs- und Freigabemails benötigen Änderungen am ausgeschlossenen Backend bzw. E-Mail-Ablauf. V1 ist daher noch nicht als echter Gesamtprozess abgenommen.

## TESTS

Gezielte Erstprüfung: `.qa-cx33/targeted.log` — 7 Testdateien, 52 Tests bestanden. Der erste Gesamtlauf (`.qa-cx33/test-full-first.log`) hatte 975 bestandene Tests und genau eine veraltete Erwartung in `frontend/app/dev/admin-vorschau/preview.test.tsx`: Der Test erwartete noch den alten Wizard-Link statt der nun direkt erreichbaren Veröffentlichung. Diese Erwartung wurde korrigiert; die Prüfung auf ausschließlich lokale Vorschau-Links bleibt bestehen. Abschließender Gesamtlauf `npm run test --prefix frontend` erfolgreich; `.qa-cx33/test-full.log`. Wortgetreue Ergebniszeilen:

```text
 Test Files  92 passed (92)
      Tests  976 passed (976)
   Start at  02:25:05
   Duration  1492.30s (tests 49%, import 29%, transform 11%, worker 7%, environment 4%)
EXIT_CODE=0
```

Damit: 0 fehlgeschlagene Tests. Die letzte Platzierungsänderung am Marketinglink wurde zusätzlich mit den unten dokumentierten 23 Marketing-/Barrierefreiheitstests geprüft; TypeScript wurde danach erneut ohne Fehler ausgeführt.

Die Aufrufe verwenden unter Windows `npm.cmd`/`npx.cmd`, weil PowerShell den Starter `npm.ps1` über die Execution Policy sperrt. Keine Installation: vorhandene Pakete werden verwendet; `frontend/node_modules` ist lokal mit dem vorhandenen Haupt-Checkout verknüpft. Für `npx` sind Offline-Modus und keine automatische Zustimmung gesetzt.

`npx tsc --noEmit -p frontend` nach Wiederherstellung der Mutationsprobe: keine Compiler-Ausgabe, keine Fehler. Wortgetreue Ergebniszeile des Aufruf-Wrappers aus `.qa-cx33/tsc.log`:

```text
EXIT_CODE=0
```

`git diff --check` und der gezielte Git-Diff aller ausgeschlossenen Pfade: jeweils `EXIT_CODE=0`; Nachweise `.qa-cx33/diff-check.log` und `.qa-cx33/protected-files.log`.

Unabhängiger Read-only-Review nach `CLAUDE.md`, ergänzt um die React-Prüfroutine: keine weiteren relevanten Frontend-Befunde nach dem Fix für verlorene Bestätigungsmails. Der Reviewer hat keine Tests ausgeführt.

Marketing-Abschlussprüfung nach Verschieben des Loginlinks aus der schmalen Kopfleiste in den bestehenden unteren Seitenbereich: `.qa-cx33/marketing-final.log`. Wortgetreue Ergebniszeilen:

```text
 Test Files  2 passed (2)
      Tests  23 passed (23)
EXIT_CODE=0
```
## MUTATIONSPROBE

Ausgeführt mit `.qa-cx33/mutation-probe.cjs`: ausschließlich den neu ergänzten Link „Weiter zur Einrichtung und Freigabe“ aus `CampConfigScreen.tsx` entfernt. Der Test prüft das tatsächlich gerenderte Element und dessen Ziel `/pilot/testverein/einrichtung?schritt=4`.

Rot, wortgetreu aus `.qa-cx33/mutation-red.log`:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
AssertionError: Weiter zur Einrichtung und Freigabe: expected undefined to be defined
EXIT_CODE=1
```

Original anschließend im `finally`-Block wiederhergestellt. Grün, wortgetreu aus `.qa-cx33/mutation-green.log`:

```text
 Test Files  1 passed (1)
      Tests  1 passed | 7 skipped (8)
EXIT_CODE=0
```

`.qa-cx33/mutation-restored.log` belegt identische Bytes vor/nach der Probe (`RESTORED=true`, beide SHA-256: `b809715c21a149f9e1430a900e4dcc982b947f21104bf3333151da4872ed4450`). Ein erster Aufruf mit fehlerhaft übergebenem Windows-Testfilter hatte nur übersprungene Tests; er zählt ausdrücklich nicht als Mutationsnachweis und bleibt in `.qa-cx33/mutation-filter-attempt.log` erhalten.

## NICHT_AUSGEFÜHRT

- Kein `npm install`, keine neuen Dependencies, keine Backend-/E-Mail-Änderungen.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `backend_saas/**` oder `frontend/app/pilot/[org]/RegistrationFormScreen.tsx`.
- Keine Playwright-Dateien angelegt, insbesondere nicht unter `frontend/`; vorhandene `playwright.config.cf1.ts` und `e2e/` unverändert.
- Kein Live-/Staging-Durchlauf, keine echten Registrierungen oder E-Mails, keine produktiven Daten. Kein Browser-/Screenshot-Nachweis; die Übergabe beschreibt den Code-Durchgang und lokale Tests.
- Keine Builds, Deployments, Pushes, Merges, `git add` oder `git commit`. Commit übernimmt der Orchestrator.
