feat/cx25-konfig-vorschau
STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend` – Exit 0. Ergebniszeilen unverändert:

```text
 Test Files  85 passed (85)
      Tests  886 passed (886)
   Start at  23:21:44
   Duration  542.93s (tests 55%, transform 18%, import 15%, worker 8%, environment 5%)
```

`npx tsc --noEmit -p frontend` – Exit 0, keine Ausgabe, keine Fehler.

- Bestehende `EinrichtungScreen.test.tsx` unverändert und im grünen Gesamtlauf enthalten.
- Neue Tests: Name/Logo/Farbe, Theme-Klassen, Kontrast, Picker→Hex, Hex→Picker einschließlich Kurzhex und zugängliche Fehler bei ungültigen Hex-Werten.
- Integrationstests: Live-Vorschau, verhindertes Speichern ungültiger Farben, Erhalt der Formularwerte nach Speicherfehlern und Zurücksetzen bei neuen Vereinsdaten.
- `git diff --check` ohne Fehler. Unabhängiger Code-Review abgeschlossen; keine offenen Funktionsbefunde.
- Frühere Läufe waren langsam bzw. wurden abgebrochen. Drei bestehende Anmeldetests scheiterten in einem abgebrochenen Gesamtlauf; ein betroffener Test bestand anschließend einzeln unverändert. Der oben dokumentierte abschließende Gesamtlauf enthält alle 886 Tests und ist vollständig grün.

## MUTATIONSPROBE

Picker-Callback vorübergehend durch eine leere Funktion ersetzt. Der Synchronisationstest wurde wie erwartet rot (Testprozess Exit 1):

```text
 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
AssertionError: expected '#123456' to be '#b8912b' // Object.is equality
```

Original-Callback im `finally`-Block wiederhergestellt; danach vollständiger Gesamtlauf grün. Prüfskript und Log: `C:\Users\serka\dev\_reports\CX25\mutation.cjs` bzw. `mutation.log`.

## ÄNDERUNGEN

- `brand/BrandPreview.tsx` und `brand/ColorField.tsx` ersetzen lokalen Vorschau-/Farbfeld-Code und werden im Einrichtungsassistenten und in den Vereinseinstellungen verwendet.
- Einstellungen zeigen Name, sicheres Logo und Farbe live: Vorschau ab Desktop neben den Gestaltungsfeldern, auf Mobilgeräten darunter.
- Tradition, Akademie und Kompakt verwenden die bestehenden öffentlichen Theme-Regeln und `.btn.primary`. Die Button-Schriftfarbe kommt aus `readableTextOn`. Berechneter Kontrast für Gold `#b8912b` mit `#111111`: 6,41:1.
- Theme-Auswahl ausdrücklich als reine Vorschau gekennzeichnet. Der bestehende Admin-Speicherpfad unterstützt keine Theme-Änderung; Backend-Schnittstelle nicht erweitert.
- Ungültige Hex-Werte erhalten einen Feldfehler. Kurzhex `#RGB` wird für den nativen Picker expandiert.
- Windows-Testpool in `frontend/vitest.config.mjs`: `vmForks` → `vmThreads`. Ein Worker, VM-Isolation, Zeitlimits und sämtliche Tests bleiben erhalten; vollständiger Lauf mit dieser Konfiguration grün.
- Keine Paketdateien geändert. Bestehende Abhängigkeiten aus `cp-t1-theme` lokal über ignorierte Verzeichnisverknüpfungen genutzt, da Installationsversuche an Cache-/Download-Beschränkungen scheiterten.
- Geschützte Dateien unverändert. Keine neuen Playwright-Dateien; bestehende `frontend/playwright.config.cf1.ts` und `frontend/e2e/` nicht bearbeitet.

## NICHT_AUSGEFÜHRT

- Keine abgeschlossene Browserprüfung und keine Vorher-/Nachher-fullPage-Aufnahmen bei 1440/390 Pixeln. Abweichung von GESCHMACK.md: Der eigene Next-Server meldete „Ready“, lieferte im Prüffenster aber keine HTTP-Antwort. Das lokale Prüfskript brach mit `Timeout: Next.js` ab; auch direkter Browserzugriff scheiterte am Zeitlimit. Responsive Anordnung und Theme-CSS sind durch Code-/Komponententests, aber nicht durch Browseraufnahmen belegt. Kontrast aus geprüften Farbwerten berechnet, nicht im Browser gemessen.
- Keine Dual-Club-Builds, kein vollständiger Lint-Lauf, kein Deployment.
- Kein `git add`, kein `git commit`; Commit erfolgt durch den Orchestrator.
