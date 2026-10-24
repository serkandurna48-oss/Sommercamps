feat/cx19-formular-komfort

STATUS: fertig zur Prüfung

TESTS

Finale Fassung nach Rücknahme der Mutation geprüft. Basis-HEAD: `024a7507d035ef50fe85529eb819a7198a29a8b9`; Änderungen liegen uncommitted im aktuellen Worktree.

`npm run test --prefix frontend` — Exitcode 0, 0 fehlgeschlagen. Ergebniszeilen wörtlich:

```text
 Test Files  84 passed (84)
      Tests  899 passed (899)
   Start at  20:29:05
   Duration  29.04s (tests 58%, import 14%, transform 12%, environment 10%, worker 7%)
```

`npx tsc --noEmit -p frontend` — Exitcode 0. Keine Ausgabe; TypeScript gibt bei Erfolg keine Ergebniszeile aus.

Zusätzlich:

- ESLint für die drei geänderten/neuen TSX-Dateien: Exitcode 0, keine Ausgabe.
- `git diff --check`: Exitcode 0, keine Ausgabe.
- 29 neue React-DOM/jsdom-Tests: Touch-Verhalten, sofortige Fehlerkorrektur, identische Blur-/Submit-Texte, Pflichtfelder und Einwilligungen, Telefonnummern, Zusatzfragen einschließlich Radio-Fokuswechsel, Datumseingabe und Cursor, Backspace/Delete, Paste-Normalisierung, Schaltjahr, Altersgrenzen am Campbeginn, beforeunload-Registrierung/Cleanup sowie Geschwister-Vorbefüllung und Campwechsel.
- Bestehende CX3-, CX8- und CX13P-Tests im Gesamtlauf enthalten und grün.
- Unabhängiger Read-only-Review: zwei Randfälle gefunden und behoben (Touch-Reset beim Campwechsel, Löschen führender Datumsnullen); Nachprüfung ohne weitere konkrete Befunde.

MUTATIONSPROBE

Die Bedingung `if (submitAttempted || touched[field])` wurde vorübergehend entfernt. Dadurch wurden Pflichtfehler bereits beim ersten Rendern angezeigt und mit der vorhandenen Klasse `.bad` als Fehler markiert.

Aufruf: `npm run test --prefix frontend -- registrationComfort -t "zeigt vor Touch"`.

Der Test „zeigt vor Touch weder Fehlermeldungen noch rote Felder, auch während der ersten Eingabe“ wurde erwartungsgemäß rot: 18 Elemente mit `aria-invalid="true"` oder `.bad` statt 0. Ergebniszeilen wörtlich:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 28 skipped (29)
```

Mutierter Testlauf: Exitcode 1. Originaldatei im finally-Block vollständig wiederhergestellt; anschließender Gesamtlauf mit 899 bestandenen Tests und Typprüfung grün.

ÄNDERUNGEN

- `frontend/app/pilot/[org]/RegistrationFormScreen.tsx`: gemeinsame Validierung für Blur, Submit und Fortschrittsanzeige. Fehler vor dem ersten Blur verborgen, nach Submit wie bisher vollständig sichtbar; gültige Korrekturen entfernen Fehler sofort. Telefonnummern erlauben Ziffern, Leerzeichen und optional ein führendes Pluszeichen.
- Geburtsdatum: schrittweise automatische Punkte, Ziffernbegrenzung auf acht Stellen, Cursor-/Auswahlkorrektur und Löschen an Trennzeichen. `inputMode="numeric"` und punktetaugliches Pattern. Einfügen von `4.1.2017` ergibt `04.01.2017`; Kurzdatumsnormalisierung erfolgt ausschließlich bei Paste, damit normale Löschvorgänge möglich bleiben.
- Freundlicher, barrierefrei verknüpfter Altershinweis anhand von `camp.age_min`, `camp.age_max` und Campbeginn. Kein clientseitiges Absendehindernis außerhalb der Altersspanne.
- beforeunload nur bei ausgefüllten, noch nicht erfolgreich abgesendeten Angaben. Cleanup nach Leerung, erfolgreichem Submit und Unmount; Warnung bleibt nach fehlgeschlagenem Submit erhalten. Geschwister-Vorbefüllung wird ebenfalls geschützt.
- `frontend/app/pilot/[org]/ExtraQuestions.tsx`: Touch-Validierung auch für erforderliche Zusatzfragen. Wechsel innerhalb einer Radiogruppe löst noch keinen Fehler aus. Campwechsel setzt den lokalen Fragenzustand zurück.
- `frontend/app/pilot/[org]/registrationComfort.test.tsx`: neue Interaktions- und Regressionstests, keine Playwright-Datei.
- Fokusführung, Serverfehlerbehandlung und Geschwister-Elterndaten bleiben erhalten. Neue Texte verwenden „Sie“. Bestehende Theme-Klassen für Fehler und Hinweise werden weiterverwendet; keine neuen Designwerte oder Abweichungen von GESCHMACK.md/DESIGN.md.

NICHT_AUSGEFÜHRT

- Kein `git add`, kein Commit, Push, Merge oder Deployment. Commit übernimmt der Orchestrator.
- Keine Builds, manuellen Browserprüfungen, Screenshots oder Playwright-Läufe. Die Interaktionen wurden mit React-DOM/jsdom geprüft; ein nativer Browser-Warndialog wurde nicht visuell geprüft.
- Keine Backend-/Produktionszugriffe. Die verbotenen Pfade `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` und `backend_saas/**` wurden nicht geändert.
- Keine Playwright-Dateien unter `frontend/` angelegt oder geändert. Bereits vorhandene Playwright-Dateien gehören zum Ausgangsstand.
