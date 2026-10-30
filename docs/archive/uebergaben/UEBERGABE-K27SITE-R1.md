# Übergabe K27SITE-R1 — isolierte KSV-CTA

Status: Lokale Nachbesserung umgesetzt; Produktfreigabe weiter blockiert. Branch `fix/k27site-r1`, Start- und aktueller HEAD `1adfafe8bdc49d13dadafaa232f8fdd8f2abc846`, Start-Arbeitsbaum sauber. Änderungen sind nicht committed. Kein Push oder Deployment.

## Änderung gegenüber dem Start-SHA

- `frontend/app/pilot/[org]/clubAssets.ts`: `heroCtaEmphasis: true` ausschließlich beim vorhandenen KSV-Assetmapping. Stadionbild, Desktop-Zoom `1.08`, mobile Bildposition `center 15%` und Sponsor-Konfiguration bleiben erhalten.
- `frontend/app/pilot/[org]/ParentFlow.tsx`: KSV bekommt weiter „Jetzt anmelden“ vor „Termine ansehen“ und die Klasse `hero-cta-emphasis`. Neutrale Tradition bekommt die bisherigen Buttons „Camps ansehen“ vor „Jetzt anmelden“. Beide bleiben Buttons mit `scrollToCamps`; Anmeldeablauf und Sponsor-Position sind unverändert.
- `frontend/app/pilot/[org]/publicTheme.css`: Die neu hinzugefügten CTA-Abstands- und Tap-Flächen-Regeln gelten nur mit `hero-cta-emphasis`.
- `frontend/app/pilot/[org]/ParentFlow.test.tsx`: gezielte Assertions für KSV, neutrale Tradition, JK-Akademie und CSS-Geltungsbereich.

`git diff --stat` vor diesem Bericht:

```text
 frontend/app/pilot/[org]/ParentFlow.test.tsx | 29 +++++++++++++++++++++++++---
 frontend/app/pilot/[org]/ParentFlow.tsx      | 15 +++++++++++---
 frontend/app/pilot/[org]/clubAssets.ts       |  3 +++
 frontend/app/pilot/[org]/publicTheme.css     |  4 ++--
 4 files changed, 43 insertions(+), 8 deletions(-)
```

## Prüfungen und Belege

- `git diff --check`: Exit `0`, keine Ausgabe.
- Abhängigkeitsfreie, gezielte Quellprüfung: Exit `0`, Ausgabe:

```text
PASS KSV flag only in configured asset
PASS KSV CTA class conditional
PASS KSV CTA labels and order
PASS neutral tradition labels and order
PASS new CTA styles scoped
PASS KSV hero and sponsor mapping retained
PASS registration handlers retained
```

- Vitest, TypeScript, Lint und neuer Browserlauf **nicht ausgeführt**: `frontend/node_modules` fehlt; das vorhandene `Sommercamps/frontend/node_modules` ist leer. Keine Pakete installiert. Die neuen Vitest-Assertions sind deshalb noch kein bestandener Lauf.
- Gespeicherte Bilder **vor R1**, read-only visuell geprüft: [KSV 390](.qa-ksv27/after/ksv-390.png), [KSV 1440](.qa-ksv27/after/ksv-1440.png), [Neutral 390](.qa-ksv27/after/neutral-regression-390.png), [Neutral 1440](.qa-ksv27/after/neutral-regression-1440.png), [JK 390](.qa-ksv27/after/jk-regression-390.png), [JK 1440](.qa-ksv27/after/jk-regression-1440.png). Diese Preview ersetzt Next-Komponenten und Motion, nutzt nicht die echten Seitenschriften und bildet JK als synthetische Akademie-Fixture ab. Sie belegt **nicht** die R1-Darstellung.
- Im neutralen 1440-Bild brechen Preise ziffernweise um. Es gibt kein neutrales Vorherbild. `git diff 8b0cc542d6b5c081e9533fb220e7bb41cd2ce4de HEAD` enthält keine Preis-Regeln oder `CampRow.tsx`-Änderung; auch R1 ändert beides nicht. Eine durch diesen Diff verursachte Regression ist nicht bestätigt, daher kein Preis-Fix im Scope.

## Offene Gates

1. `C:\Users\serka\dev\_reports\assets\ksv-2027-kinder-original.png` fehlt (`Test-Path`: `False`). Das gewünschte untere Originalfoto wurde nicht ersetzt; kein Ersatzbild erzeugt.
2. Gespeicherte KSV-/JK-Next-Builds bleiben wegen Google-Font-Abruf blockiert: `.qa-ksv27/build-summary.log` meldet exakt `ksv_build=1 jk_build=1`. Kein neuer Build und kein Font-Override.
3. Vitest und echte 390/1440-Anwendungsprüfung am R1-Stand mit Schrift, Tastatur und Kontrast stehen aus. Gespeicherte Bilder sind nur Belege des Vorgängerstands.
4. Lokaler Commit durch Dateisystemrecht blockiert: `git add -- ...` meldet exakt `fatal: Unable to create 'C:/Users/serka/Desktop/Projekte/Sommercamps/.git/worktrees/K27SITE-R1/index.lock': Permission denied`. Die Git-Worktree-Metadaten liegen außerhalb der beschreibbaren Wurzeln. Kein Rechte- oder Tool-Umweg versucht; deshalb gibt es keinen neuen Commit-SHA.

Kein Netzwerk, keine echten Daten, keine Änderungen an Gebühren, Backend, Datenbank, Paketen oder Deployment.
