# Übergabe W6Q

STATUS: fertig zur Prüfung

Basis-SHA: `7bdd001c134e88b0f5ca013029f6a3d542e55c37`. Gegenstand ist der lokale, nicht committete Worktree.
Quelle: vollständiger Diff `git diff efd84e4 3d7a1cc` und `git show 3d7a1cc:UEBERGABE-W6d.md`. Inhaltliche Portierung auf die Integrationsbasis, kein Merge.

## TESTS

Abschließender Lauf von `npm.cmd run test --prefix frontend`: Exit-Code 0, 0 failed. Ergebniszeilen wörtlich:

```text
 Test Files  39 passed (39)
      Tests  362 passed (362)
```

Dauer: 448,28 Sekunden. Alle Tests aktiv; kein Watch-Modus.

`npx.cmd tsc --noEmit -p frontend`: Exit-Code 0, keine TypeScript-Fehler (auch nach den ergänzten Integrationstests).
`git diff --check`: ohne Befund.

Teststart: Der erste unveränderte Aufruf scheiterte vor den Tests mit EPERM beim Schreiben von `node_modules/.vite-temp`; `frontend/node_modules` ist eine Junction auf den anderen Worktree L2. Das Testskript lädt die vorhandene ESM-Konfiguration jetzt über `vitest run --configLoader native`, der Vite-Cache liegt unter `.next/cache/vitest` im eigenen Worktree. Keine Installation und keine zweite Vitest-Konfiguration. `maxWorkers: 1`, `testTimeout: 30000` und das aus W6d ergänzte `hookTimeout: 30000` gelten weiterhin nur unter Windows.

Die Accessibility-Suite übernimmt alle zehn W6d-Fälle und verwendet heutige Camp-/CP-Referenzdaten. Sie prüft zusätzlich beide Camp-anlegen-Links, den Fokusabstand an der mobilen Safe-Area und den Werterhalt beim Zuklappen. ActionForm prüft neben der W6d-Fehlerverknüpfung auch mehrteilige Bestätigungen, Vorschau ohne Serveraktion sowie onResult ohne doppeltes Erfolgsfeedback.
Zwei Zwischenläufe mit dem noch nicht an beide Dashboard-Links angepassten Test wurden abgebrochen; sie sind kein Abschlussnachweis.

## LINT

`npm.cmd run lint --prefix frontend`: 0 errors, 9 bestehende Warnungen; erster und abschließender Lauf ohne Lint-Fehler.

```text
✖ 9 problems (0 errors, 9 warnings)
```

Die bestehenden Warnungen betreffen ungenutzte Parameter in configActions/paymentActions/waitlistActions sowie Hook-Abhängigkeiten und einen ungenutzten Parameter in HeroLab. Diese Dateien sind unverändert.

## ÄNDERUNGEN

Alle Pfade in der Tabelle unter `components/saas/` beziehen sich auf `frontend/app/components/saas/`; die übrigen Pfade sind vollständig ab Repository-Wurzel angegeben.

### W6d-Änderung → neuer Ort

| W6d-Änderung | Neuer Ort / Umsetzung im Integrationsstand |
|---|---|
| Gemeinsamer Fokus: 2 px Outline, 2 px Abstand; helle Flächen, dunkle Köpfe, Login-Themes | `components/saas/ui/focus.css` (neu); inhaltlich aus W6d |
| Fokus-CSS zentral einbinden | `components/saas/tokens.css`; zusätzlich mobiler Safe-Area-Abstand +4 px, damit die Fußnavigation den Ring nicht abschneidet |
| Eingabestile ohne outline-none, mit cp-focus | `components/saas/ui/formFieldStyles.ts` |
| Button-Fokus und 44 px Mindestbreite, keine rohe Markenfarbe als Outline | `components/saas/ui/Button.tsx` |
| Field: Hinweise und Fehler auch durch Wrapper verknüpfen, vorhandene Beschreibungen bewahren, aria-invalid setzen/aufheben | `components/saas/ui/Field.tsx` |
| Aktive Filter mit brandStrong auf weißer Oberfläche; Fokus und Mindestbreite | `components/saas/ui/FilterButton.tsx` |
| ActionForm: eindeutige IDs für Bestätigung und Fehler, Beschreibungen am Einstiegs-/Submit-Button | `components/saas/ui/ActionForm.tsx`; heutige ReactNode-Bestätigung, cancelLabel, preview und onResult vollständig erhalten |
| Export-Auslöser/-Optionen mindestens 44×44 px; Aktionsgruppe, normaler Tab-Ablauf und Fokusraum | `components/saas/ui/ExportBar.tsx`; bestehende panelId, aria-controls und Escape-Fokusrückgabe weiterverwendet; auch Reset-/Retry-Ziele angepasst |
| Export nach Schließen wieder auf Auslöser fokussieren | `components/saas/ui/ExportBar.tsx`; Escape und Druckansicht erhalten. Downloads bleiben gemäß Integrationsstand für Download-/Fehlerfeedback und Wiederholung geöffnet |
| Camp-Konfigurationsfehler ans Formular anbinden | `components/saas/config/CampConfigForm.tsx`; CampPublicationCard, Statusübergänge und Vorschau erhalten |
| Camp-Anlegefehler ans Formular anbinden | `components/saas/config/CampCreateForm.tsx`; Slug-Vorschlag, Werterhalt und Vorschau erhalten |
| Vereins-Konfigurationsfehler ans Formular anbinden | `components/saas/config/OrganizationConfigForm.tsx`; Vorschau und Werterhalt erhalten |
| Veröffentlichung: Hinweise und Fehler mit dem Button verknüpfen | `components/saas/config/PublishToggle.tsx`; Rückzieh-Bestätigung und Vorschau erhalten |
| Camp-Zeile: einheitlicher Fokus statt roher Marken-Outline | `components/saas/data/CampRow.tsx` |
| Teilnehmereditor: useId für alle fünf Feld-/Label-Paare und Formularfehler | `components/saas/data/ParticipantDetail.tsx` |
| Bearbeiten mindestens 44×44 px; E-Mail-/Telefonlinks ohne verschachtelte Buttons | `components/saas/data/ParticipantDetail.tsx`; Storno-Kontext und RegistrationActionFeedback bleiben erhalten |
| Teilnehmerauswahl mit beschrifteter 44×44-px-Klickfläche und kontrastsicherem Akzent | `components/saas/data/ParticipantRow.tsx` |
| Geschlossene Teilnehmerdetails inert/aria-hidden, Editor bleibt montiert | `components/saas/data/ParticipantRow.tsx` |
| Teilnehmer-Speichern mit gemeinsam berechneten brandStrong/brandOn | `components/saas/data/ParticipantRow.tsx` → `ParticipantDetail.tsx` |
| Teilnehmer-Suche beschriften, Fokusraum für Filter, Auswahlaktion als kontrastsicherer Link | `components/saas/data/ParticipantList.tsx`; Suchlabel/Markentokens/Link waren bereits integriert, Fokusklasse und Mindestbreite ergänzt; Tageslisten-Export/Sortierung erhalten |
| Zahlungsfilter: Platz für den äußeren Fokusring | `components/saas/data/PaymentSection.tsx`; heutiges flex-wrap bleibt, p-1 ergänzt; CP-Referenz-Suche und Rückgängig unverändert |
| Aufgabenfilter: Platz für äußeren Fokusring | `components/saas/tasks/TaskFilterList.tsx` |
| BandTabs: Fokusraum und gemeinsame Fokusfarbe statt Vereinsfarbe | `components/saas/shell/BandTabs.tsx` und `tokens.css`; useBarHeight, previewHref, aktive Tabs und Fußnavigation erhalten; MatchdayBand/Rücklink unverändert |
| Vereins-Abmelden mindestens 44×44 px mit gemeinsamem Fokus | `components/saas/shell/LogoutButton.tsx`; Vorschau-Logout erhalten |
| Dashboard „Camp anlegen“ mindestens 44×44 px | Früher `frontend/app/pilot/[org]/(org-admin)/dashboard/page.tsx`, jetzt `components/saas/screens/OrgDashboardScreen.tsx`; beide Links abgedeckt, Leerzustand behält 48 px Höhe |
| Vereinslogin: Fehler an beide Eingaben anbinden, aria-invalid, themegerechter Fokus | `frontend/app/pilot/[org]/login/LoginForm.tsx` |
| Plattform-Vereinssuche: sichtbarer Fokus statt outline-none | `frontend/app/platform/(console)/OrganizationList.tsx` |
| Plattformkopf als header mit heller Fokusfarbe; Logout mindestens 44×44 px | `frontend/app/platform/(console)/layout.tsx` |
| Plattformlogin: Feldfokus und Fehlerverknüpfung | `frontend/app/platform/login/LoginForm.tsx` |
| Accessibility-Suite für Fokus, Field, Touch, Export-Escape, Markenfarben, Auswahl, inert und eindeutige IDs | `components/saas/ui/accessibility.test.tsx` (neu); aktuelle Pflichtdaten, beide Dashboard-Links und Integrations-Safe-Area berücksichtigt |
| ActionForm-Test für Bestätigungs-/Fehlerverknüpfung | `components/saas/ui/ActionForm.test.tsx`; zusätzlich preview/onResult mit ReactNode-Bestätigung geprüft |
| Teilnehmer-Workflow vor Bearbeiten aufklappen | `components/saas/data/ParticipantRow.test.tsx` |
| Windows-Teststabilisierung mit einem Worker und 30-s-Test-/Hook-Zeitlimit | `frontend/vitest.config.mjs`; keine `vitest.config.ts`. Zusätzlich nativer Konfigurationslader in `frontend/package.json` und lokaler cacheDir wegen schreibgeschützter Dependency-Junction |
| W6d-Übergabe und Nachvollziehbarkeit | Diese `UEBERGABE-W6Q.md`; historische W6d-Übergabe vollständig gelesen, nicht als aktuelle Testergebnisse übernommen |

Unabhängiger statischer Review gemäß CLAUDE.md durchgeführt; einziger Befund war der abgeschnittene untere Fokusring in der mobilen Safe-Area-Regel. Korrigiert und vom Reviewer nachgeprüft, danach keine weiteren Befunde. Ergänzend React-Best-Practices-Prüfung der geänderten Komponenten.

## NICHT_AUSGEFÜHRT

- Keine Backend- oder Datenbankänderungen; keine Backend-/Datenbanktests, Produktionsaufrufe oder Migrationen.
- Kein Browser-/Screenreader-, echtes Mobilgeräte-, Zoom- oder manueller Tastaturlauf. Touch-Mindestmaße/Fokusabstände durch Code-/DOM-Tests geprüft, nicht am Gerät gemessen.
- Keine Deployments, Paketinstallationen, Watch-Prozesse oder Builds der Legacy-Clubkonfigurationen.
- Kein Merge, Remote-PR-/SHA-Abgleich, Push, `git add` oder `git commit`. Commit und weitere Orchestrierung liegen beim Orchestrator.
