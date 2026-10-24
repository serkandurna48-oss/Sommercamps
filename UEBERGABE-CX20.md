feat/cx20-auslastung
STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend`, unter Windows als `npm.cmd run test --prefix frontend` ausgeführt: 0 fehlgeschlagene Tests. Abschließende Ergebniszeilen unverändert:

```text
 Test Files  84 passed (84)
      Tests  881 passed (881)
   Start at  20:28:49
   Duration  31.10s (tests 51%, import 21%, environment 13%, worker 8%, transform 8%)

TEST_EXIT_CODE=0
```

`npx tsc --noEmit -p frontend`, ausgeführt als `npx.cmd tsc --noEmit -p frontend`: keine Diagnosen. Ergebniszeile des Prüfaufrufs unverändert:

```text
TSC_EXIT_CODE=0
```

- Elf neue Tests rendern den tatsächlichen `OrgDashboardScreen`: chronologische Sortierung ohne Mutation der Eingabedaten, vergangene Camps standardmäßig eingeklappt, laufende Camps einschließlich Enddatum heute, Schwellen 89/90/100 %, aktive Anmeldungen versus Warteliste/Stornos, leere Warteliste, Entwurfsbereich mit Konfigurationslink, Camp-Link/Ort/Zeitraum, Leerzustand, fehlender Ort, geschlossene/archivierte Camps sowie begrenzte Balken bei Überbuchung. ARIA-Werte, zugänglicher Name, sichtbarer Belegungstext und die gesetzte Vereinsfarbvariable werden geprüft.
- ESLint für die vier geänderten/neuen TypeScript-Dateien: `ESLINT_EXIT_CODE=0`. `git diff --check`: `DIFF_CHECK_EXIT_CODE=0`.
- Browserprüfung ausschließlich lokal über `/dev/admin-vorschau/dashboard` mit erfundenen Vorschau-Daten: bei 1440 px Zeilen nebeneinander; bei 390 px untereinander, Balkenbreite 316 px = volle innere Zeilenbreite. Beide ohne horizontalen Überlauf. Balkenfarbe aus Vereinsdaten sichtbar. Kleinster gemessener Textkontrast in der Karte einschließlich Aktionsbutton: **5,013658581926584:1**.
- FullPage-Screenshots: [vorher 1440](C:/Users/serka/dev/_reports/CX20/vorher-1440.png), [vorher 390](C:/Users/serka/dev/_reports/CX20/vorher-390.png), [nachher 1440](C:/Users/serka/dev/_reports/CX20/nachher-1440.png), [nachher 390](C:/Users/serka/dev/_reports/CX20/nachher-390.png). Abschließende Nachher-Aufnahmen mit reduzierter Bewegung.
- Einschränkung der visuellen Prüfung: Der lokale Dev-Server konnte Google Fonts wegen Netzwerksperre (`EACCES`) nicht laden und verwendete Ersatzschriften für Archivo/Geist. Beide Vergleichszustände wurden mit derselben Einschränkung aufgenommen; die endgültige Schriftwirkung bleibt im Integrationsreview zu prüfen. Der lokale Server wurde nach Abschluss beendet.
- Unabhängiges lokales Agentenreview gemäß `CLAUDE.md`: keine Findings; abschließende Farbkorrektur ebenfalls geprüft. Geprüfter Stand: uncommittierter Worktree auf Basis von HEAD `024a7507d035ef50fe85529eb819a7198a29a8b9`.
- Komponentenprüfung nach `vercel:react-best-practices`: serverseitige Ableitung, keine zusätzlichen Requests, kein neuer Clientzustand, native aufklappbare Bereiche, stabile Camp-Schlüssel, benannte Fortschrittsbalken.

## MUTATIONSPROBE

In `frontend/app/components/saas/data/DashboardCampsCard.tsx` wurde `ratio >= 0.9` vorübergehend durch `ratio >= 0.95` ersetzt. Aufruf:

```text
npm.cmd run test --prefix frontend -- app/components/saas/screens/OrgDashboardScreen.test.tsx -t "zeigt bei 90 Prozent"
```

Der Test wurde rot, weil bei 90 belegten von 100 Plätzen „fast voll“ fehlte:

```text
Expected: "fast voll"
Received: "Ihre Camps+ Camp anlegenbelegung1.–5. Nov. 2026Sportplatz Musterstadt90 von 100 Plätzen belegtZum Camp"

 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
   Start at  20:26:39
   Duration  2.22s (environment 78%, tests 9%, worker 7%, import 6%)

MUTATION_EXIT_CODE=1
```

Das Original wurde im `finally`-Block wiederhergestellt. Der vollständige grüne Abschlusslauf erfolgte danach.

## DATENQUELLE

- Ausschließlich die bereits für das Dashboard geladenen Props `camps` und `registrationsByCamp`; kein zusätzlicher Abruf und kein neuer Endpunkt.
- Bestehender Loader: `frontend/app/components/saas/orgAdminData.ts`, `loadOrgAdminData()`. Er lädt Camps über `fetchCampsAdmin()` und zu jedem Camp die Anmeldungen über `fetchRegistrationsAdmin()` aus dem bestehenden Admin-Client.
- Titel, Start-/Enddatum, Ort, Kapazität und Veröffentlichungsstatus kommen aus `CampAdmin`. Die bisherige Dashboard-Zählung `computeCampStats()` wird unverändert verwendet: `registered` und `confirmed` belegen Plätze, `waitlist` wird separat gezählt, `cancelled` zählt nicht zur Belegung.
- Keine Ersatzquelle erforderlich. Datumsgrenze wie bei `pickNextCamp()`: aktuelles UTC-Kalenderdatum; erst ein Enddatum vor diesem Tag gilt als vergangen.

## ÄNDERUNGEN

- Die bisherige Camp-Liste im Dashboard ist jetzt die Karte „Ihre Camps“, einschließlich bestehender Aktion „Camp anlegen“.
- Veröffentlichte Camps aufsteigend nach Startdatum; aktuelle und zukünftige Camps zuerst, vergangene in einem standardmäßig geschlossenen Bereich „Vergangene Camps (N)“.
- Jede veröffentlichte Zeile zeigt Titel, deutschen Zeitraum, Ort, dauerhaft sichtbaren Belegungstext und einen benannten Fortschrittsbalken mit `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` und `aria-valuetext`. Ab 90 % „fast voll“, ab 100 % „ausgebucht“; Wartelistenzahl nur bei mindestens einem Eintrag.
- Bei Überbuchung bleiben tatsächliche Zahlen im Text erhalten; Balken und ARIA-Zahlenwert werden auf die Kapazität begrenzt.
- Eigener Bereich „Entwürfe“ mit „Entwurf – noch nicht sichtbar“ und „Veröffentlichen“ zur bestehenden Route `/pilot/{org}/camps/{camp}/konfiguration`. Keine automatische Veröffentlichung.
- Geschlossene und archivierte Camps bleiben in einem eigenen eingeklappten Bereich erreichbar, damit bisher erreichbare Camps nicht aus der Verwaltung verschwinden.
- Bestehende Theme-Tokens und Tailwind-Abstände wiederverwendet. Die Karte setzt `--cp-brand` lokal aus der bereits vorhandenen `computeBrandTokens()`-Berechnung, weil `AdminShell` diese Variable derzeit nicht setzt. Keine festen Vereinsfarben oder Vereinsinhalte eingeführt.
- Deutsche Texte zentral in `frontend/app/lib/i18n/de.ts`; keine informelle Anrede. `GESCHMACK.md` wurde zuerst gelesen; vorhandene Kartenoptik und neutrale Zustände bleiben erhalten.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit; kein Remote-PR-/Review-SHA-Abgleich.
- Kein Produktionszugriff, keine produktiven Daten, keine Backend-/Datenbankänderung, keine neuen Abhängigkeiten.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` oder `backend_saas/**`.
- Keine Playwright-Dateien unter `frontend/` angelegt oder geändert. Die dort bereits vorgefundenen `playwright.config.cf1.ts` und `e2e/` bleiben unverändert. Browserprüfung per einmaligem Node-Aufruf; Bilddateien außerhalb des Repositorys unter `C:/Users/serka/dev/_reports/CX20/`.
- Keine Produktionsbuilds für KSV/JK und keine authentifizierte Live-Prüfung. Die Prüfung betrifft das lokale Dashboard mit bestehenden Vorschau-Daten sowie den vollständigen Frontend-Testlauf und TypeScript.
