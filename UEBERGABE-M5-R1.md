design/m5-polish-r1

STATUS: fertig zur Prüfung

COMMIT: be07cc1  fix: M5-R1 Navigation lesbar, Logo, Abstaende, Laufband

TESTS: npm run test --prefix frontend → 136 passed (136), 0 failed
       npx tsc --noEmit --project frontend/tsconfig.json → 0 Fehler

URSACHE_ABSTAENDE:
Jeder Inhaltsblock hatte eigenes symmetrisches padding-block: 56px/88px (.sec, .how-sec, .faq-sec).
Zwei aufeinanderfolgende Blöcke stapelten diese → bottom 56 + top 56 = 112 px mobil (sichtbarer Spalt),
bottom 88 + top 88 = 176 px Desktop. Fix: alle drei Klassen auf jeweils 28 px (mobil) / 44 px (Desktop)
halbiert; je zwei Hälften ergeben 56 px / 88 px Soll-Spalt. #s-camps-Override (64 px padding-top für
Hero → erster Abschnitt) bleibt unverändert.

NICHT_AUSGEFÜHRT:
- Kein Push, kein Merge nach main
- Keine Build-Prüfung (npm run build) — nur Tests und tsc wie beauftragt
