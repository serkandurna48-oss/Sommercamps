# Übergabe K27SITE · 27.10.2026

STATUS: Teilweise umgesetzt; lokaler, ungecommiteter Integrationskandidat. Das angeforderte Original für das untere Gruppenfoto fehlt am freigegebenen Transferpfad.

- Branch/HEAD zu Beginn: `feat/k27site` / `8b0cc542d6b5c081e9533fb220e7bb41cd2ce4de`. Kein `git add`, Commit, Push oder Deployment.
- KSV-Pilot: Stadion-Hero erhalten; Desktop-Zoom `1.08` nur für KSV, mobile Position `center 15%` und Zoom unverändert. CTA-Gruppe im Textfluss, Hauptaktion zuerst, Terminaktion nachgeordnet. Sponsor-/Anzeigenblock nach den Terminen mit konfigurierbaren Logo-, Bild-, Text- und Linkfeldern. Noch keine Sponsor-Einträge und keine erfundenen Firmennamen. Kontakt-CTA verwendet die bestehende öffentliche `org.contact_email`, nur wenn vorhanden.
- Allgemeine Texte der Legacy-KSV-Seite in `siteContent.ts` von pauschalem Sommercamp/2026 auf Fußballschule/Camps ohne starre Jahresbehauptung umgestellt. Historische konkrete 2026-Termine in `clubConfig.tsx` wurden nicht geändert; ihre Abstimmung mit dem K27DATA-Kandidaten ist ein Integrations-Gate.
- Das separate untere Galeriefoto wurde **nicht** ersetzt. `C:\Users\serka\dev\_reports\assets\ksv-2027-kinder-original.png` existierte beim Check nicht. Das Stadion-Herobild blieb erhalten.

## Browserbilder und Testbelege

Alle Browserbilder stammen aus `.qa-ksv27/preview.cjs` mit synthetischen lokalen Daten, lokalem HTTP-Server und gesperrten externen Requests. Keine produktive URL oder `.env` wurde verwendet. Fullpage-Bilder wurden visuell geöffnet.

| Ansicht | Vorher | Nachher |
|---|---|---|
| KSV 390 px | `.qa-ksv27/before/ksv-390.png` | `.qa-ksv27/after/ksv-390.png` |
| KSV 1440 px | `.qa-ksv27/before/ksv-1440.png` | `.qa-ksv27/after/ksv-1440.png` |

- Browserlauf: `.qa-ksv27/after-run.log` und `.qa-ksv27/after/browser-results.json`. 390/1440 px ohne Seitenfehler oder Horizontalüberlauf; KSV-Bildposition mobil `50% 15%`, Desktop `50% 30%`; Desktop-Skalierung `1.08`, mobil `none`. Hero-Buttons mindestens 48 px hoch, vollständig im Viewport. KSV/JK/neutral öffnen Campdetail und Anmeldestart in beiden Breiten; Sponsor und KSV-Copy erscheinen nur bei KSV. Zusätzliche Bilder: `.qa-ksv27/after/{jk,neutral}-regression-{390,1440}.png`.
- TypeScript: `.qa-ksv27/tsc.log` — `tsc --noEmit` Exit 0.
- ESLint: `.qa-ksv27/eslint.log` — gezielte geänderte TS/TSX-Dateien Exit 0 (aus `frontend/`). Die erste Ausführung aus dem Repo-Root fand die Konfiguration unter `frontend/` nicht; danach korrekt ausgeführt.
- Vitest: `.qa-ksv27/vitest.log` — 2 Dateien, 38 Tests bestanden. Ein erster Lauf hatte wegen der bewusst geänderten CTA-Beschriftung eine veraltete Testerwartung; diese wurde korrigiert und erneut geprüft. Finale Zusammenfassung: `.qa-ksv27/checks-summary-final.log`.
- Dual-Build: `.qa-ksv27/build-{ksv,jk}.log`, Zusammenfassung `.qa-ksv27/build-summary.log` — beide Exit 1, weil `next/font/google` im abgeschotteten Lauf die bereits eingebundenen Google Fonts nicht laden konnte. Kein Build-PASS behauptet; kein Ersatz über eine andere Netzwerkroute.
- `git diff --check`: ohne Beanstandung.

## Geänderte Dateien

- `frontend/app/pilot/[org]/clubAssets.ts`
- `frontend/app/pilot/[org]/ParentFlow.tsx`
- `frontend/app/pilot/[org]/ParentFlow.test.tsx`
- `frontend/app/pilot/[org]/publicTheme.css`
- `frontend/app/lib/siteContent.ts`
- `.qa-ksv27/preview.cjs` sowie lokale Screenshots/Logs
- `UEBERGABE-K27SITE.md`

## Offene Gates

1. Originalfoto übertragen, Bildrechte/Einwilligungen prüfen und **nur dieses Original** in der unteren Galerie ersetzen; anschließend dieselbe 390/1440-Browserprüfung wiederholen.
2. Sponsor-Felder sind aktuell pro KSV im Quellcode pflegbar. Eine Admin-Oberfläche mit Persistenz gibt der vorhandene öffentliche Organisationsvertrag noch nicht her. Vor Anzeige konkreter Sponsoren Logo/Bild/Text/Ziel-Link und Freigabe belegen.
3. Tatsächlich hinterlegte KSV-Organisationstexte und Camptermine aus dem SaaS-Backend wurden nicht mit echten Daten gelesen oder geändert. Vor Veröffentlichung K27DATA-Inhalt, Legacy-Terminliste und Anmeldeoptionen gemeinsam abgleichen.
4. Unabhängiges Review und Integration mit K27DATA/K27FORM durch den Orchestrator; kein getesteter Commit-SHA, da Commit ausdrücklich erst danach erfolgt.
5. KSV- und JK-Produktionsbuild in einer Umgebung mit regulär verfügbarem Fontzugriff prüfen; die lokalen Builds sind am Fontabruf gescheitert, bevor ein verlässliches Ergebnis zur gesamten Anwendung vorlag.

BLOCKER: extern - Das gewünschte Originalfoto fehlt unter `C:\Users\serka\dev\_reports\assets\ksv-2027-kinder-original.png`.
BLOCKER: extern - Die beiden lokalen Next-Builds konnten die bereits im Projekt verwendeten Google Fonts wegen gesperrtem Netzwerkzugriff nicht laden.
