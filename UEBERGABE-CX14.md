feat/cx14-hero-scrim
STATUS: fertig zur Prüfung

TESTS

`npm run test --prefix frontend` — Exit 0, Ergebniszeilen wörtlich:

```text
 Test Files  69 passed (69)
      Tests  702 passed (702)
```

`npx tsc --noEmit -p frontend` — keine Ausgabe, keine Fehler. Ergebnis des Exit-Code-Wrappers wörtlich:

```text
TSC_EXIT_CODE=0
```

- Beide geforderten Befehle unverändert über `cmd /c` ausgeführt (PowerShell sperrt die npm/npx-PS1-Starter).
- ESLint für alle vier geänderten TS/TSX-Dateien: Exit 0, keine Ausgabe. `git diff --check`: Exit 0.
- 28 neue Regressionstests: alle drei Themes, Org-Foto und Club-Fallback, ohne Foto einschließlich Leerzeichen-URL, mobile/desktop/default Position, Reduced Motion, Scrim-Kontrast und Statistik-Schichtung.
- Chromium: 12 Prüfungen (drei Themes × 390/767/768/1440 px). KSV bis 767 px `50% 15%`, ab 768 px `50% 30%`; CSS-Fallback ebenfalls `50% 30%`. Kein horizontaler Überlauf.
- Pixelprüfung mit weißer Fotofläche: mindestens **10,25:1** für den Fließtext an allen vier Ecken der Textfläche. Oberer rechter Bildbereich unverändert weiß (255/255/255). Statistikziffern bleiben oberhalb des Scrims sichtbar.
- Reduced Motion im Browser: Bildanimation 0,01 ms statt 14 s; Scrim und Position bleiben erhalten. `motion.ts` und bestehende Reduced-Motion-Regeln unverändert.
- Unabhängige Code-Nachprüfung: keine offenen Befunde.

Nachweise unter `C:\Users\serka\dev\_reports\CX14`: `tests.log`, `tsc.log`, `mutation.log`, `contrast-browser.json`, `nachher-browser.json`.

Fullpage-Screenshots vorher/nachher: `vorher-{theme}-{breite}.png` und `nachher-{theme}-{breite}.png`, jeweils tradition/akademie/kompakt bei 1440×900 und 390×844. Beispiel Akademie: [Desktop](C:/Users/serka/dev/_reports/CX14/nachher-akademie-1440.png), [Mobil](C:/Users/serka/dev/_reports/CX14/nachher-akademie-390.png).

MUTATIONSPROBE

Die Klasse `hero-scrim` vorübergehend aus `heroCopyClass` entfernt und `hero-scrim.test.tsx` ausgeführt. Erwartet rot, Exit 1; Ergebniszeilen wörtlich:

```text
 Test Files  1 failed (1)
      Tests  9 failed | 18 passed (27)
```

Sechs Bildfälle und drei Reduced-Motion-Fälle erkennen den fehlenden Scrim. Änderung im `finally`-Block zurückgenommen. Anschließend Statistik-Regression ergänzt und vollständige finale Suite erfolgreich ausgeführt (702 Tests).

ÄNDERUNGEN

- `ParentFlow.tsx`: gemeinsame Foto-/Scrim-Klassen; CSS-Variablen für Desktop und Mobil direkt am Bild. Keine Resize-Listener. Ohne Bild kein Scrim. Akademie-Fotos erhalten keinen ganzflächigen Schleier mehr. Kompakt unterstützt ebenfalls ein konfiguriertes Hero-Foto.
- `publicTheme.css`: statischer Verlauf an der tatsächlichen Textfläche, oben und rechts außerhalb des Textes auslaufend, mobil nach unten. Farben, Deckkraft, Breite und Abstände über Variablen. Begrenzte Desktop-Textbreite hält den rechten Bildbereich frei. Weiße Foto-Texte und separat geschützte Kennzahlen. Alte feste `object-position`-Deklarationen entfernt, damit die responsive Regel in allen Themes gewinnt.
- `clubAssets.ts`: optionales `heroPositionMobile`; KSV `center 15%`, Desktop unverändert `center 30%`. Fallback mobil → Desktop → `center 20%`.
- `hero-scrim.test.tsx` neu; bestehender Kompakt-Test in `ParentFlow.test.tsx` prüft den Text-Hero nun ausdrücklich ohne konfiguriertes Bild.
- Begründete Präzisierung gegenüber DESIGN.md: Verlauf folgt statt festen Bildprozenten der Texthöhe, damit auch umgebrochener Text die Kontrastuntergrenze hält. Kompakt mit Foto folgt dem ausdrücklichen CX14-Auftrag; ohne Foto bleibt der Text-Hero bestehen.

NICHT_AUSGEFÜHRT

- Kein Live-/Staging-Aufruf, keine echte Registrierung und kein API-End-to-End-Test. Screenshots und Pixelprüfungen verwenden lokal servergerenderte ParentFlow-Fixtures mit vorhandenem KSV-Pokalfoto, Beispieldaten und System-Ersatzschriften; kein Nachweis der aktuell ausgelieferten Kundendaten oder Webfonts.
- Keine Produktionsbuilds für KSV/JK, kein Deployment, kein Push/Merge. Kein `git add`, kein Commit; Übergabe des Arbeitsdiffs an den Orchestrator.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json`, `backend_saas/**` oder bestehenden Bilddateien. Playwright-Hilfsdateien ausschließlich im ignorierten `.next/cx14/` außerhalb von `frontend/`; Screenshot-Ausgaben ausschließlich im Berichtsverzeichnis.
