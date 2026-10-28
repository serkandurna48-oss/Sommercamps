# KSV UX NIGHT W1 — lokale Review-Übergabe

Stand: 28.10.2026. Branch `ux/ksv-cleaner-parent-20261028`, unveränderter Basis-HEAD `4c2a61a8058d41c3c29d54d4d862142cc3fb3b3b`. Änderungen liegen uncommitted im Worktree. Kein Push, Merge, Deployment oder Cloud-Schreibzugriff.

## Umfang und sichtbare Änderungen

- `frontend/app/pilot/[org]/page.tsx`: `data-org` am vorhandenen Public-Wrapper. Alle neuen CSS-Regeln gelten ausschließlich für `ksv-baunatal`.
- `frontend/app/pilot/[org]/ParentFlow.tsx`: KSV-Hero in den relevanten Themes Tradition/Akademie hat eine Aktion „Camp auswählen“. Sie nutzt den bestehenden Auswahl-/Fokuspfad. Doppelte Nav-Aktion und redundante mobile Sticky-Auswahlleiste entfallen nur für KSV. Andere Mandanten behalten ihre CTAs.
- `frontend/app/pilot/[org]/publicTheme.css`: kontrollierte Hero-Typografie und Foto-Lesbarkeit, volle mobile CTA-Breite, klar getrennte Karten (1/2/3 Spalten), Datum oberhalb des Kartentitels, deutlich sichtbarer dynamischer Preis, mindestens 44 px CTA-Fläche. Alle bisherigen Karteninformationen bleiben im Markup. Formularabschnitte und Labels sind ruhiger gesetzt; fehlende lokale CSS-Token-Aliase für Radio-Auswahlrahmen sind nur für KSV ergänzt. Position/Verein haben erkennbare Auswahlflächen und Zustände. Texte/Inhalte bleiben während Scroll-Einblendungen sichtbar. Reduced Motion berücksichtigt Karten, Balken und Hero-Bild.
- `frontend/app/pilot/[org]/ParentFlow.test.tsx`: genau eine KSV-Hero-Aktion für Tradition/Akademie; vorhandene Tests sichern die unveränderten JK-/neutralen CTAs und Bildzuordnung.
- `frontend/app/pilot/[org]/cx3-a11y.test.tsx`: Tastatur-Fokusübergabe für KSV und neutralen Mandanten; KSV ohne Sticky-Leiste, neutrale versteckte Leiste weiterhin inert.

Nur zwei UI-Quelldateien plus CSS und Tests geändert. Kein Camp-Datensatz, Preis, Datum, Kapazität, Asset, Form-State, Hook, Guard, API, Payment- oder Consent-Verhalten geändert. Stadium-Hero und Kinder-Galerie bleiben die vorhandenen Assets. Es wurde keine Anmeldung abgesendet.

## Vorher / Nachher und Nachweise

Vor jeder Änderung wurden die gelieferten echten Live-Baselines geöffnet: `before-390-home.png`, `before-1440-home.png`, `before-390-form.png`. Sichtbar waren konkurrierende Hero-Aktionen, kleine Kartenmetadaten sowie noch nicht eingeblendete große Seitenbereiche im Vollseiten-Screenshot. Letzteres ist ein Screenshot-/Reveal-Zustand, kein Beleg für dauerhaft fehlenden Live-Inhalt.

Nachher wurde ein echter lokaler Chromium/Playwright-Browser bei 390 × 900 und 1440 × 900 benutzt. Alle Dateien liegen unter `C:/Users/serka/dev/_reports/leitstand/KSV-UX-NIGHT/`:

- `after-{390,1440}-home.png`: vollständige Startseite, fünf Test-Camps.
- `after-{390,1440}-hero.png`: Hero im tatsächlichen Viewport.
- `after-{390,1440}-next.png`: Campdetail vor Anmeldung.
- `after-{390,1440}-form.png`: leeres Formular.
- `after-{390,1440}-feedback.png`: synthetische Auswahl Torwart/Anderer Verein, sichtbares Freitextfeld und explizite Gesundheitseinwilligung nach Testeingabe.
- `after-390-reduced-motion.png`: vollständige Seite mit Reduced Motion.
- `after-browser-checks.json`, `reduced-motion-check.json`: maschinelle Browserbefunde.

Geprüft und tatsächlich angesehen: Home/Hero/Form bei beiden Breiten, mobile Feedback- und Reduced-Motion-Aufnahme. Browserbefunde: fünf Karten, eine Hero-Aktion, kein horizontaler Überlauf auf Home/Form, zwei Radio-Gruppen, sichtbare Gesundheitseinwilligung nach Testeingabe, ca. 49 px hohe Radio-Zeilen, keine pageerror-Ereignisse. Tastatur: Hero via Enter -> Fokus `s-camps`; Campkarte via Enter -> Detail -> Formular. Reduced Motion: sichtbare Karten, kein Überlauf, fokussierbarer Hero-Button ca. 55 px hoch mit solidem Fokusrahmen. Kein Submit; Registrierungs-POSTs wurden zusätzlich per Playwright abgefangen.

Wichtige Grenze: Netzwerkzugriffe auf öffentliche API und Google Fonts schlugen im Worker fehl. Daher verwenden Nachher-Aufnahmen einen lokalen GET-only-Testserver (`fixture-api.cjs`) mit fünf synthetischen Camps und Ersatzschriften. Die Testpreise/-termine sind ausschließlich QA-Fixtures, keine Produktdefaults oder Korrekturen. Live-Baseline und lokaler Stand unterscheiden sich zudem bereits vor diesem Patch in Inhalt/Asset-Konfiguration. Die Bilder sind daher kein pixelgenauer Vergleich desselben Datenstands. Der ursprüngliche fehlgeschlagene Nachher-Lauf zeigte den Ladefehler; die finalen `after-*`-Dateien wurden anschließend mit der funktionierenden lokalen Ansicht überschrieben.

## Prüfungen

Ausgeführt aus `frontend`, sofern nicht anders angegeben:

- `npm.cmd test -- --reporter=dot`: 105 Testdateien bestanden, eine fehlgeschlagen; 1201 Tests bestanden, einer fehlgeschlagen (1202 insgesamt). Einziger Fehler: alter `.h-btn-line`-Selektor im KSV-Fokustest nach absichtlichem Entfernen der zweiten Aktion.
- Nach Korrektur und Erweiterung auf neutralen Mandanten: `npm.cmd test -- ParentFlow.test.tsx cx3-a11y.test.tsx RegistrationFormScreen.test.tsx --reporter=dot`: **3 Dateien / 61 Tests bestanden**. Die vollständige Suite wurde nach dieser Testkorrektur nicht erneut ausgeführt; ein komplett grüner finaler Gesamtlauf ist damit noch kein behaupteter Nachweis.
- TypeScript: erster Projekt-Typecheck erfolgreich (tsconfig setzt `noEmit: true`). Abschließender expliziter `--noEmit`-Lauf: **bestanden, Exit 0** (`node -e "process.argv=['node','tsc','--noEmit'];require('typescript/lib/tsc')"` aus `frontend`).
- `npm.cmd run lint`: Fehler ausschließlich in untracked CommonJS-Capture-Hilfsskripten unter `.ux-night` (`no-require-imports`), einschließlich bereits vorhandenem `capture-before.cjs`. Neue QA-Skripte wurden in den Reportordner verschoben, temporäre Updater entfernt. Kein Lint-Config-/Guard-Bypass im Repository. Lint des Projekts mit `npm.cmd run lint -- --ignore-pattern .ux-night/**`: **bestanden, Exit 0**. Die Ausnahme betrifft ausschließlich das vorhandene untracked Capture-Verzeichnis, keine Produktdateien.
- `git diff --check`: bestanden (nur Git-Zeilenendenhinweise).
- Produktions-Builds: `npm.cmd run build` mit leerem/unset `NEXT_PUBLIC_ACTIVE_CLUB` und anschließend `NEXT_PUBLIC_ACTIVE_CLUB=jk`: **beide Exit 1**, jeweils `next/font`-Fehler beim Google-Fonts-Abruf (u. a. Archivo, Fraunces, Geist, Oswald). Siehe `build-ksv.log` und `build-jk.log` im Reportordner. Kein erfolgreicher Produktions-Build-Nachweis in dieser netzbeschränkten Umgebung.

PowerShell sperrt `npm.ps1`; deshalb wurde der normale `npm.cmd`-Launcher genutzt. Keine Pakete installiert. Browser-Skripte sind im Reportordner; aus dem Frontend-Arbeitsverzeichnis ausführen, damit bestehendes Playwright auflösbar ist. Keine Änderungen an anderen Worktrees.

## Risiken und nächster Schritt

Host-Reviewer prüft den Diff, startet den finalen kompletten Frontend-Testlauf, beide Club-Builds und eine Vorschau mit erreichbarer öffentlicher API und echten Schriften. Insbesondere tatsächliche fünf Live-Termine/149 EUR, Hero-Crop, Warteliste, Zahlungstexte, Datenschutzlinks und KSV/JK-Isolation nochmals ohne echte Anmeldung abgleichen. Waitlist-/Payment-Logik wurde nicht geändert; ein realer Zahlungs-/Submit-End-to-End-Test war ausdrücklich nicht Teil dieser lokalen Prüfung. Das bestehende Form-State-/Back-Verhalten wurde nicht umgebaut.

Danach kann der Host gezielt die fünf geänderten Frontend-Dateien und diese Übergabe stagen/committen. Die vorhandene untracked `frontend/.ux-night/capture-before.cjs` gehört nicht zum UI-Patch. Kein Deployment aus diesem Worker.

## Unabhängiger Review

Read-only-Reviewer gemäß CLAUDE.md: keine relevanten regressiven Befunde im Diff. Exakter KSV-Scope, erhaltener Fokuspfad und unveränderte Form-/Payment-/Waitlist-Pfade bestätigt. Home bei 390/1440 und mobiles Formular unabhängig visuell geprüft. Keine unabhängigen Tests oder echten Live-Datenprüfungen; keine Deployment-Abnahme. Lokale Vorschau- und Fixture-Server wurden nach der Prüfung beendet.
