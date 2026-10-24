feat/cx9-camp-duplizieren

STATUS: fertig zur Prüfung

Camp-Duplizierung im bestehenden Formular umgesetzt. Arbeitsdiff auf Basis
`871570fb0c2742b0fdd0a9929a953964b92f7cdd`, kein neuer Commit.

## TESTS

`npm run test --prefix frontend` — Exit 0, Ergebniszeilen unverändert:

```text
 Test Files  70 passed (70)
      Tests  697 passed (697)
   Start at  19:04:26
   Duration  19.47s (tests 47%, import 19%, environment 13%, transform 11%, worker 9%)
```

`npx tsc --noEmit -p frontend` — keine Compiler-Ausgabe, keine Fehler.
Zusätzlich ausgegebener Shell-Exitcode, unverändert:

```text
TSC_EXIT_CODE=0
```

Unter Windows wurden die gleichwertigen Starter `npm.cmd` und `npx.cmd` verwendet,
weil die PowerShell-Skriptausführung gesperrt ist. Vorhandene Abhängigkeiten aus
dem übergeordneten `node_modules` genutzt; keine Installation oder neuen Dependencies.

Abgedeckt: vollständiges Mapping aller Camp-Konfigurationsfelder, keine Übernahme
von IDs, neue Titel-/Slug-Vorgabe, leere Pflichttermine, Draft aus jedem Quellstatus,
Formularwerte auch nach Fehlern, Anmeldezeiten mit Zeitzone, unbekannte Quelle,
fehlende Sitzung und Ladefehler, sekundärer Detailseiten-Link, gemockte
Create-/Update-Aufrufe einschließlich Reihenfolge und Payloads, Slug-Konflikt,
PATCH-Teilerfolg, Weiterleitung und Erfolgshinweis, neue Texte ohne Du-Anrede.

`git diff --check` ohne Befund. Unabhängige lesende Prüfung abgeschlossen:
zwei Währungsbefunde behoben, abschließend keine verbleibenden Befunde.

## MUTATIONSPROBE

In `config/campDuplicate.ts` vorübergehend beide Zuordnungen geändert:
`start_date: source.start_date` und `end_date: source.end_date` statt leerer Werte.
`npm run test --prefix frontend -- campDuplicate.test.ts` wurde erwartungsgemäß rot:

```text
 Test Files  1 failed (1)
      Tests  5 failed | 2 passed (7)
MUTATION_EXIT_CODE=1
```

Der Diff zeigte die alten Termine `2026-07-06` und `2026-07-10` statt `""`.
Mutation anschließend vollständig zurückgesetzt; obiger Gesamtlauf und TypeScript-
Check prüfen den wiederhergestellten Stand.

## API-ENTSCHEIDUNG

Quelle: bestehende Typen und Funktionen in `frontend/app/lib/saasAdminApi.ts`.

- `CampCreateInput` akzeptiert Slug, Titel, Camp-Termine, Altersgrenzen, Kapazität,
  Preis und Status. Die Kopie verwendet unverändert `createCampAdmin` mit
  ausdrücklich `status: 'draft'`.
- `CampConfigUpdate` unterstützt zusätzlich `location`, `care_info`, `meals_info`,
  `includes`, `registration_start`, `registration_end` und `currency`.
  Diese Werte werden anschließend mit `updateCampAdmin` an den vom Create-Aufruf
  zurückgegebenen neuen Slug geschrieben; auch dieser Aufruf setzt Draft.
- `registration_questions` gehört zu `OrganizationAdmin` / `OrganizationConfigUpdate`,
  nicht zu einem Camp. Eine Kopie innerhalb desselben Vereins verwendet automatisch
  dieselben Zusatzfragen. Kein Organisations-Update, kein erfundenes Camp-API-Feld.
- Anmeldebeginn und Anmeldeschluss werden übernommen und bleiben bearbeitbar.
  Nur Beginn und Ende des Camps werden geleert. Der Hinweis bittet zusätzlich um
  Prüfung des übernommenen Anmeldezeitraums.
- POST und PATCH sind nicht atomar. Scheitert PATCH, bleibt der neue Entwurf erhalten.
  Weiterleitung zu dessen Konfiguration mit ausdrücklicher Warnung statt Erfolgsmeldung
  oder Aufforderung zu einem zweiten POST. Fehlende Angaben müssen dort ergänzt werden;
  auch die Währung ist hierfür jetzt bearbeitbar.

## ÄNDERUNGEN

- `screens/CampDetailScreen.tsx`: sekundäre Aktion „Camp duplizieren“ zu
  `camps/new?von=SLUG`.
- `camps/new/page.tsx` und `screens/CampCreateScreen.tsx`: Quelle mit Admin-Token
  innerhalb des aktuellen Vereins laden; unbekannter Slug ergibt das normale leere
  Formular mit kurzem Hinweis. API-Ausfälle werden nicht als unbekannte Quelle getarnt.
- `config/campDuplicate.ts`: explizites, separat getestetes Mapping; Titel mit
  ` (Kopie)`, neu vorgeschlagener Slug, leere Camp-Termine, Draft.
- `config/CampCreateForm.tsx`: vorhandenes Formular wiederverwendet und für Kopien
  vorbelegt; zusätzliche kopierte Angaben bearbeitbar, Datumsfelder weiterhin Pflicht.
- `actions/configActions.ts`: Create plus erforderliches Update, Fehlerbehandlung,
  Sie-Anrede und Navigation zur neuen Konfiguration.
- `camps/[campSlug]/konfiguration/page.tsx` und `screens/CampConfigScreen.tsx`:
  „Kopie angelegt – bitte Termin prüfen und veröffentlichen.“ bzw. Warnhinweis bei
  unvollständiger Übernahme.
- `config/CampConfigForm.tsx`: Währung zur Korrektur ergänzbar; Preisbeschriftung
  passend zur variablen Währung.
- Tests ergänzt in `config/campDuplicate.test.ts`, `config/CampCreateForm.test.tsx`,
  `actions/configActions.test.ts` und `camps/new/page.test.tsx`.

Gestaltung: bestehende Buttons, Felder, Karten, Breiten und Theme-Variablen verwendet;
keine neuen Farbwerte, keine Dependencies. Neue Vereinshinweise verwenden „Sie“.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`,
  `frontend/next.config.ts`, `frontend/tsconfig.json`, `backend_saas/**` oder `supabase/**`.
- Keine Playwright-Dateien angelegt, auch nicht unter `frontend/`.
- Keine Live-API-/Datenbank-Schreibtests oder produktiven Daten verwendet.
- Kein Browserlauf, keine Screenshots/visuelle Kontrastmessung, kein Produktionsbuild
  und kein vollständiger Lint-Lauf. Layout verwendet die bestehenden Komponenten;
  Funktionsprüfung erfolgte mit React-/Routentests und gemockten API-Funktionen.
  Die in GESCHMACK.md für Design-Aufträge verlangten Bildschirmnachweise liegen
  für diese Funktionserweiterung daher nicht vor.
