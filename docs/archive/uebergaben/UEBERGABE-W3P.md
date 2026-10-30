# Übergabe W3P

STATUS: fertig zur Prüfung

Stand: 21.10.2026. Basis-SHA des integrierten Worktrees: `0d23f4d31e1f61f95a1f8b2501570c61fb44b46f`.
Vollständige Grundlage: `git diff efd84e4 3767f3a`. Geprüft wird der uncommittete Worktree; kein Staging und kein Commit.

## TESTS

Abschließender vollständiger Lauf von `npm.cmd run test --prefix frontend` auf dem endgültigen Code: Exit 0, **0 failed**. Ergebniszeilen wörtlich:

```text
 Test Files  36 passed (36)
      Tests  337 passed (337)
```

Laufstart 05:16:56, Dauer 556.89 s. Keine Tests übersprungen und keine Testkonfiguration für diesen Auftrag verändert.
Der erste vollständige Lauf hatte 335 bestandene und zwei fehlgeschlagene Tests. Beide Testanpassungen sind korrigiert: Der CampConfig-Page-Aufruf erhält die inzwischen erforderlichen searchParams; der zusätzliche Vorschautest erwartet keinen Exportdialog in der bestehenden No-op-Vorschau.

Die 17 W3c-Tests wurden übernommen und an Payment-Referenz, Camp-Prop, Sortierauswahl und die aktuellen Page-/Screen-Verträge angepasst. Die Vorschau-Suite umfasst zusätzlich die neue Tagesübersicht, die drei gemeinsamen Camp-Unterseiten, den Erstcamp-Leerzustand, Filter/Sortierung und die Auswahl des richtigen Camps. Alle Screens bleiben in den vorhandenen Tests auf echte /pilot-/platform-Links und echte Aktionen geprüft.

## LINT

- `npm.cmd run lint --prefix frontend`: Exit 0, `✖ 9 problems (0 errors, 9 warnings)`. Alle neun Warnungen liegen in unveränderten Aktionsdateien und HeroLab.tsx.
- `npx.cmd tsc --noEmit -p frontend`: Exit 0, keine TypeScript-Fehler.
- `git diff --check`: Exit 0; nur Hinweise zur LF/CRLF-Normalisierung.

## Jede W3c-Änderung und ihr neuer Ort

Pfade in der Tabelle sind relativ zu `frontend/app/components/saas/`, sofern nicht anders angegeben.

| W3c-Änderung | Neuer Ort und Verhalten |
|---|---|
| Rücklink „← Alle Camps“, mindestens 44 px, vor dem Campnamen; sichtbare h1 im kompakten Kopf | `shell/MatchdayBand.tsx`; mit `AdminLink` auch vorschaufähig. Aktiv in `screens/CampDetailScreen.tsx`, `CampPaymentsScreen.tsx`, `CampWaitlistScreen.tsx`, `CampTasksScreen.tsx`, `CampConfigScreen.tsx`. |
| Begriffe „Camp-Einstellungen“ und „Vereinseinstellungen“ | `navTabs.ts`, `screens/OrgConfigScreen.tsx`; bestehender Titel in `CampConfigScreen.tsx` bleibt erhalten. |
| Mobile Fußnavigation: mindestens 56 px, Safe Area, umbrechende Beschriftungen und passend positionierte Ladehinweise | `shell/BandTabs.tsx` und `tokens.css`. |
| Tatsächliche Leistenhöhen einschließlich Padding messen | Neues `shell/useBarHeight.ts`: ResizeObserver mit border-box, Bereinigung beim Entfernen. |
| Auswahlleiste oberhalb der Navigation und Reserve für beide Leisten im Inhalt | `ui/SelectionBar.tsx`, `tokens.css`, `shell/AdminShell.tsx`. Der Layout-Abstand gilt auch in der Vorschau. Die org-admin-`layout.tsx` verwendet weiterhin AdminShell. Auswahlleiste bleibt beim Druck ausgeblendet. |
| E-Mail an Ausgewählte als einzelner Link statt verschachteltem Button, berechnete Markenfarben | `data/ParticipantList.tsx`. |
| Kompakter Dashboard-Kopf; „Heute neu: N Anmeldungen“ vor den Aufgaben; letzte drei Eingänge mit Kind, Camp und Berliner Uhrzeit | `screens/OrgDashboardScreen.tsx` und neues `data/TodayRegistrations.tsx`. |
| Vollständige campübergreifende heutige Anmeldungen und Link auf neueste Camp-Eingänge | Neues `screens/NewRegistrationsScreen.tsx`; Datenloader in `frontend/app/pilot/[org]/(org-admin)/anmeldungen/page.tsx`. Einträge verlinken das Camp mit `sort=newest`. |
| Berliner Kalendertag, Zeitzone/DST, Ausschluss zukünftiger/ungültiger Eingänge, Datum/Uhrzeit und Sortierfunktionen | Neues `registrationDates.ts`; ausschließlich vorhandenes created_at, kein gespeicherter Lesestand. |
| Getrennte Leerzustände für einen Tag ohne Eingänge, einen Verein ohne Camps und bestehende Camps ohne Aufgaben | `data/TodayRegistrations.tsx` und `screens/OrgDashboardScreen.tsx`: „Heute noch keine neuen Anmeldungen“, „Dein erstes Camp vorbereiten“ mit „Camp anlegen“, weiterhin „Alles erledigt“ bei bestehenden Camps ohne Aufgaben. |
| Standardsortierung „Neueste zuerst“, Alternative „Name A–Z“, beschriftete Suche | `data/ParticipantList.tsx`. Bestehendes ParticipantExport samt Tagesliste und Storno-Feedback bleibt erhalten. |
| Eingangsdatum und Uhrzeit pro Teilnehmerzeile | `data/ParticipantRow.tsx` mit `registrationDate`. |
| Kontaktfilter und Zähler berücksichtigen nur aktive Anmeldungen | `commandCenterLogic.ts`, konsistent mit der Aufgabenmenge. |
| Zentrale Aufgaben-Zieladressen: offene Zahlungen, fehlender Kontakt, Warteliste | `dashboardLogic.ts` (`taskHref`). |
| Aufgabenkarte führt direkt zur Arbeitsansicht; kein verschachtelter Link/Button | `tasks/TaskCard.tsx`, weiterhin mit AdminLink. |
| Aufgabenzeile führt direkt zur Arbeitsansicht; Link mindestens 44 px | `tasks/TaskRow.tsx`, weiterhin mit AdminLink. |
| Teilnehmer-URL-Filter und Sortierung serverseitig auslesen; Liste bei Parameterwechsel neu initialisieren | Camp-`page.tsx` bereitet die Parameter auf; `screens/CampDetailScreen.tsx` reicht initialFilter/initialSort und den Schlüssel aus Camp-Slug und Parametern an ParticipantList. Auch beim Camp-Wechsel werden Suche und Auswahl zurückgesetzt. |
| Zahlungs-URL-Filter serverseitig auslesen; initialer Filter und Neuinitialisierung | Camp-`zahlungen/page.tsx`, `screens/CampPaymentsScreen.tsx` und `data/PaymentSection.tsx`. Der bereits integrierte Standard **Offen** bleibt erhalten; die Verwendungszweck-Suche und ihre Zahlungssemantik bleiben unverändert. |
| W3c-Änderungen an Camp-Aufgaben- und Wartelistenseiten | In die neuen `screens/CampTasksScreen.tsx` und `CampWaitlistScreen.tsx` übertragen; die vorher noch vollständigen Pages sind jetzt Datenloader. Integrierter Inhalt wurde übernommen. |
| W3c-Änderungen an Camp-Konfiguration und Vereinskonfiguration | In `screens/CampConfigScreen.tsx` bzw. `OrgConfigScreen.tsx`; die Veröffentlichungskarte und der Hinweis nach dem Anlegen bleiben erhalten. |
| W3c-Funktions- und Interaktionstests | `dailyWorkflow.test.tsx`; prüft über die dünnen Pages auch die gemeinsamen Screens. |
| Historische W3c-Übergabe | Nicht als aktuelles Prüfergebnis kopiert; diese Datei dokumentiert die tatsächliche W3P-Portierung und ihre eigenen Prüfungen. |

## Vorschau und erhaltene Integration

- `preview/AdminPreviewContext.tsx` erhält filter/sort und den Camp-Kontext in lokalen Vorschau-URLs. No-op-Aktionen bleiben unverändert.
- `frontend/app/dev/admin-vorschau/[screen]/page.tsx` verwendet die neuen gemeinsamen Screens einschließlich Tagesliste sowie Camp-Zahlungen, -Warteliste und -Aufgaben. Das gewählte Camp und die URL-Filter werden übernommen.
- `frontend/app/dev/admin-vorschau/fixtures.ts` erzeugt vier erfundene heutige Eingänge; `screens.ts` verlinkt die neuen Ansichten samt Leerzuständen.
- `frontend/app/dev/admin-vorschau/preview.test.tsx` erweitert die bestehenden Isolations- und No-op-Prüfungen.
- Unabhängige lokale Codeprüfung gemäß CLAUDE.md abgeschlossen: keine Befunde. Keine Änderungen an Backend, Datenbank, Server-Aktionen, Storno-Bestätigung, Veröffentlichungskarte oder ParticipantExport.

## Umgebung

Die anfänglich vorhandene externe node_modules-Verknüpfung ließ Vitests temporäre Dateien nicht zu (EPERM). Für die Prüfung wurden vorhandene Abhängigkeiten aus dem W3c-Worktree in den aktuellen Worktree kopiert; beide package-lock.json haben denselben SHA-256. Keine Paketinstallation und keine Änderung an package.json/package-lock.json. Der npm-Hinweis zu global-ignore-file stammt aus der Umgebung.

Prüfprotokolle: `C:/Users/serka/dev/_reports/W3P-20261021-052753`.

## NICHT_AUSGEFÜHRT

- Kein git add, git commit, Push, Merge, Deployment oder Remote-PR-/SHA-Abgleich; Commit und weitere Integration übernimmt der Orchestrator.
- Kein npm install, keine neuen Abhängigkeiten, kein Watch-Modus.
- Keine Datenbankänderungen, Migrationen oder produktiven Datenbankzugriffe.
- Keine Backend-Suite, keine Next.js-Produktionsbuilds.
- Kein Login-/API-End-to-End-Lauf und keine neue visuelle Browser-/Mobilgeräteprüfung. Mobile Änderungen sind aus W3c portiert; dessen historische Browsermessungen werden nicht als aktuelle W3P-Prüfung behauptet.
