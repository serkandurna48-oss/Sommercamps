# KSV UX — Nachtarbeit / finale lokale Freigabeunterlage
Stand: 28.10.2026, Branch `ux/ksv-cleaner-parent-20261028`, Basis `4c2a61a8058d41c3c29d54d4d862142cc3fb3b3b`.

## Was Eltern im Design leichter fällt
1. **Start → Termin finden.** Der KSV-Hero besitzt in allen drei unterstützten Themes nur die klare Aktion „Camp auswählen“. Konkurrierende Anmelde-Aktionen in Navigation und mobiler Sticky-Leiste sind für KSV weg. Der Klick führt weiter zum bisherigen Terminbereich mit Tastaturfokus.
2. **Camps vergleichen.** Fünf dynamisch geladene Termine erscheinen als ruhigeres Raster mit größeren Daten-/Preis-Angaben und deutlich lesbaren Leistungsinhalten und Aktionen. Das Tablet-Layout (600–899 px) nutzt nun die verfügbare Breite; bei 768 px wurde eine Campkarte von 230×548 auf 354×426 px verbessert.
3. **Formular sicher abschließen.** Zwischen Angaben zu Kind, Eltern und Einwilligungen stehen für KSV die beiden Pflichtfragen „Position“ und „Verein“ als „Schritt 3 von 4“. Auswahlen sind klarer und mind. 48 px hoch. Bei JK/neutral bleibt die bestehende Beschriftung „Weitere Angaben“ erhalten.

## Code / Mandantentrennung
Nur die öffentliche Frontend-Seite; KSV-spezifische Stile unter `data-org='ksv-baunatal'`. KSV-Hero-Varianten werden per `isKsv` begrenzt. Shared `ExtraQuestions` hat eine optionale `stepLabel`-Prop, die nur die KSV-Registrierung setzt; der bisherige Default ist unverändert. Die Tabletbreite wird ausschließlich auf den KSV-Übersichtscontainer mit `:has(#s-camps)` angewendet. Keine Backend-/Datenbank-, API-, Payment-, Kapazitäts- oder Camp-Datenänderung. Stadium-Hero und genehmigtes Kinderbild, fünf veröffentlichte Camps, Preise, Warteliste, Gesundheits-Einwilligung und Datenschutzlinks bleiben semantisch unverändert.

## Vorher/Nachher und echte Browserdurchläufe
Belege im lokalen Ordner `C:\Users\serka\dev\_reports\leitstand\KSV-UX-NIGHT`.
- Vorher **echte Vercel-Seite** read-only in Chromium, 390/1440 px: `before-{390,1440}-{home,next,form}.png`, HTTP 200; fünf echte Camps und 149 EUR wurden in Live-Baseline angezeigt.
- Nachher **lokale Next-Ansicht mit ausschließlich synthetischem GET-Testfixture und Ersatzschriften** 390/1440 px: `after-{390,1440}-{home,hero,next,form,feedback}.png`.
- Tablet 600/768/899 px nach CSS-Fix: `responsive-{600,768,899}-{home,camps,detail,form}.png`. Finale `responsive-browser-checks.json` belegt 390/600/768/899/1440 px, 5 Test-Camps, 1 Hero-Button, 2 Extra-Radiogruppen, 4 Schritte, keine horizontalen Überläufe und keine JS-Pageerrors, Campkarte→Detail→Form per Maus. Kein Submit, Registrierungs-POSTs im Browser abgefangen.
- Reduzierte Animation und Tastaturfokus getestet. Konkrete realistische Zahlungs-/Wartelisten-POSTs wurden **nicht** ausgeführt; unveränderte Abläufe sind durch vorhandene Unit-Tests abgesichert. Voller Screenreader-Audit fehlt.

## Tatsächlich ausgeführte Prüfungen / Review
- Erster Volltestlauf: `full-suite-final.log`, 1203/1203 grün, Exit 0 nach W1.
- Zweiter Volltestlauf nach Kompakt-/Schritt-3-/Tablet-Fixes: `full-suite-post-review.log`, 106 Testdateien / 1204 Tests grün, Exit 0.
- Kleinster weiterer Patch nach W2-Review stellt exakt die JK-/neutralen ExtraQuestions-Labels wieder her: `targeted-final-scope.log`, 4 Testdateien / **77/77 Tests grün**, Exit 0.
- Letzte vollständige Suite und Typecheck/Lint **nach diesem abschließenden Scope-Patch**: bei Erstellung dieses Dokuments noch ausstehend; Folgeprotokoll und `STATUS.md` sind maßgeblich. Vorher bereits TypeScript und Lint jeweils Exit 0, `git diff --check` Exit 0.
- Zwei **unabhängige Read-only-Codex-Diff-Reviews**: `W1-REVIEW-RESULT.txt` (zwei kleine P3, beide korrigiert) und `W2-REVIEW-RESULT.txt` (keine Release-Blocker, eine P3 Scope-Abweichung, jetzt korrigiert). Kein weiterer Code-Worker, keine neuen Features.

## Grenzen vor Produktionsfreigabe
**Nichts deployed, gepusht oder mit Kundendaten getestet.** Zwei tatsächliche Next-Produktionsbuilds (KSV und JK) scheiterten an unerreichbaren externen `next/font`-Google-Fonts-Downloads, siehe `build-ksv.log` und `build-jk.log`. Erfolgreicher realer Produktions-Build sowie Lauf mit echter API und echten Fonts stehen aus. Die visuellen Nachher-Screenshots sind **keine pixelgenaue Gegenüberstellung desselben Daten-/Fontstands**; richtige reale fünf Camps und Preise wurden nur im Vorher-Live-Screenshot bestätigt. Erst echte KSV- und JK-Preview-Regression in einer erreichbaren Umgebung, dann Serkans Freigabe, dann Deployment.

## Verifizierter Abschluss (28.10.2026, lokale Host-Prüfung nach dem letzten Scope-Fix)

Die vorherigen, als "ausstehend" genannten Prüfungen sind inzwischen vollständig nachgeholt:

- **TypeScript:** `npx tsc --noEmit` – Exit 0, Protokoll `typecheck-after-scope.log`.
- **ESLint für betroffene TS/TSX-Dateien:** Exit 0, Protokoll `lint-after-scope.log`.
- **Vollständige Frontend-Regressionssuite:** **106 Testdateien / 1205 bestandene Tests, Exit 0**, nach sämtlichen Korrekturen, Protokoll `full-suite-after-scope.log`.
- **Echter Host-Produktionsbuild:** `npm run build` mit Next.js 16.2.4 **Exit 0**, alle Routen gebündelt; `build-after-scope-host.log`. Die zuvor fehlgeschlagenen Font-Abrufe aus einer älteren Laufumgebung sind für diesen aktuellen Host-Build **kein Blocker mehr**.
- **Zusätzlicher End-to-End-Browsercheck auf lokal gestarteter Produktionsbuild mit öffentlichen echten KSV-API-GET-Daten**, 390 und 1440 px: beide HTTP 200, fünf Camps zu 149 Euro, ein Hero-Button, beide Pflichtfragen Position und Verein, Schrittanzeige 1–4, Allergieeingabe blendet die separate ausdrückliche Gesundheits-Einwilligung ein, keine horizontalen Überläufe, keine JavaScript-Pageerrors, kein Registrierungs-POST. Ergebnis `after-real-browser-checks.json`, Screenshots `after-real-{390,1440}-{hero,camps,form}.png`.
- Bildmontagen `vergleich-390.png` und `vergleich-1440.png` zeigen links echte Live-Baseline und rechts den lokal gebauten neuen Code mit echten öffentlichen Campdaten; es handelt sich **nicht** um eine bereits live veröffentlichte Änderung.

**Release-Status:** Technisch lokal gebaut und ausführlich geprüft, **noch nicht gepusht oder deployed**, deshalb weiterhin menschliche visuelle Abnahme erforderlich. Keine echte Anmeldung/Bezahlung ausgelöst; unabhängiger finaler JK-/neutraler Browser-Rundgang und vollständiger Screenreader-Test bleiben vor Live-Freigabe optional bzw. nach Risikobeurteilung zu prüfen. Das lokale Checkout-/Datenbankverhalten wurde nicht verändert.
