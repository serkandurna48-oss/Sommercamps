design/m6-hero-lab-r3

STATUS: fertig zur Prüfung

COMMIT: fix: M6-R3 Hero-Varianten mit langem Leitsatz

TESTS:
- npm run test --prefix frontend → 146 passed (146), 0 failed
- npx tsc --noEmit → kein Fehler
- Neue Tests (heroLab.test.tsx): „Variante 1/2/3: JK-71-Zeichen-Leitsatz trägt data-scale="md"" — alle grün

NICHT_AUSGEFÜHRT:
- npm run build (kein npm install erlaubt, Build-Infra nicht verfügbar in dieser Umgebung)
- Visuelle Browser-Prüfung bei 1440×900 und 390×844
