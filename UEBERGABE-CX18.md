feat/cx18-freigabe-konsole
STATUS: fertig zur Prüfung

TESTS

`npm run test --prefix frontend` – Ergebniszeilen unverändert:

```text
 Test Files  85 passed (85)
      Tests  885 passed (885)
```

0 fehlgeschlagen, Exitcode 0. Protokoll: `.qa-cx18/tests-final.log`.

`npx tsc --noEmit -p frontend` – keine Ausgabe, keine TypeScript-Fehler. Ergebnis des Prozessaufrufs:

```text
Exitcode: 0
```

Protokoll: `.qa-cx18/tsc-final.log`. Beide Befehle wurden unter Windows mit den gleichnamigen `.cmd`-Startern ausgeführt.

- Tests für alle sechs Prüfpunkte, leere/fehlende Angaben, Camp ohne Datum/Preis, umgekehrte Termine, kostenlose Camps und zusammengehörige Campangaben.
- Komponenten-/Integrationstests für gesperrte Freigabe, Tooltip, explizite Ausnahmebestätigung, Abbruch mit Fokusrückgabe, Vorschau im neuen Tab, Ablehnungsgrund, Sortierung, Badge einschließlich 0 sowie Aktualisierung nach Entscheidungen.
- `node e2e/cx18-browser.cjs`: lokale Chromium-Prüfung mit echten Listen-/Review-Komponenten und synthetischen Daten bei 1440 und 390 px bestanden. Kein horizontaler Überlauf; feste Aktionsleiste, Tastatur-Tooltip, Escape, Ausnahme, normale Freigabe und Ablehnung geprüft. Fehlchip-Kontrast: **6,20:1**.
- Vollseitenscreenshots der isolierten Testansichten vorher/nachher: `.qa-cx18/before-{list,detail}-{1440,390}.png` und `.qa-cx18/after-{list,detail}-{1440,390}.png`; zusätzlich `after-override-{1440,390}.png`. Vorher-Komponenten stammen aus HEAD und werden nur im Testserver ersetzt; keine Rücksetzung des Worktrees.
- ESLint für `app/platform`, `app/lib/saasAdminApi.ts` und `app/lib/adminNavigation.test.tsx`: Exitcode 0. `git diff --check`: ohne Befund.
- Unabhängiger Code-Review gemäß CLAUDE.md: keine konkreten relevanten Befunde. Geprüft wurde der uncommittete Worktree auf Basis von `ececbd7faba5a70a7d4830a466451239ac0c39f0`.

MUTATIONSPROBE

`node e2e/cx18-mutation.cjs` setzt die Logo-Prüfung vorübergehend auf `done: true`. Erwartetes ROT:

```text
 Test Files  3 failed (3)
      Tests  5 failed | 30 passed (35)
```

Erkannt durch Berechnung, roten Fehlchip, Freigabesperre und Ausnahmeweg. Protokoll: `.qa-cx18/mutation-red.log`. Originaldatei im `finally` wiederhergestellt; anschließender vollständiger Testlauf grün.

ÄNDERUNGEN

- Warteliste zeigt Vereinsname, Kontaktperson/E-Mail, relative Einreichung mit exaktem Zeitpunkt auf Hover, AVV-Version und tatsächlichen Annahmezeitpunkt, Camp-Gesamtzahl sowie Entwürfe/veröffentlichte Camps.
- Gemeinsame clientseitige Checkliste für Logo, Farbe, Kontakt-E-Mail, Anschrift, Teilnahmebedingungen und mindestens ein Camp mit Terminen und Preis. Fehlende Angaben erscheinen als rote Textchips. Ein ausdrücklich gesetzter Preis von 0 zählt als kostenloses Camp.
- Die bisherige Vereinsliste lieferte nur eine Camp-Gesamtzahl. Die Serverseite lädt deshalb die Camps ausschließlich eingereichter Vereine über den vorhandenen Admin-Endpunkt. Die Client-Komponenten berechnen alles aus diesen übergebenen Daten, ohne eigene Nachladeabfragen. `avv_accepted_at` wird aus der bestehenden API typisiert übernommen.
- Älteste Einreichung zuerst; fehlende/ungültige Zeitpunkte zuletzt. Freigabe-Badge auch in der mobilen Konsolennavigation. Erfolgreiche Entscheidungen revalidieren das Plattform-Layout einschließlich Liste und Badge.
- Feste untere Aktionsleiste: bestehende Vorschau im neuen Tab, Freigeben, Ablehnen mit Grund. Unvollständige Checkliste sperrt die normale Freigabe mit Tooltip. „Trotzdem freigeben“ öffnet eine Bestätigung innerhalb der Seite mit fehlenden Angaben und Veröffentlichungshinweis; kein nativer Bestätigungsdialog.
- Gestaltung gemäß GESCHMACK: bestehende Theme-/Statusvariablen, neue Layoutwerte als CSS-Variablen, keine abgeschnittenen Listenangaben, keine erfundenen Vereinsinhalte. Keine neuen Abhängigkeiten oder Datenbankänderungen. Browser- und Mutationsskripte ausschließlich unter `e2e/`; lokale QA-Artefakte unter `.qa-cx18/` sind von Git ausgeschlossen.

NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` oder `backend_saas/**`.
- Kein Zugriff auf Produktivdaten, keine echten Freigaben, kein Mailversand.
- Keine authentifizierte Ende-zu-Ende-Prüfung gegen das Backend, keine KSV-/JK-Produktionsbuilds, kein Safari-/Firefox-Test und keine Zeitmessung mit einem realen Betreiber.
- Grenze gegenüber den Gestaltungsvorgaben: Screenshots zeigen isolierte Komponentenansichten mit synthetischem Seitenrahmen und Systemschrift, keine vollständig authentifizierte Produktionsseite. API und Server-Aktion sind im Browsertest ersetzt; ihre Anbindung und Revalidierung sind separat durch Integrationstests geprüft.
