feat/cx26-admin-fehler
STATUS: fertig zur Prüfung

TESTS
- npx tsc --noEmit -p frontend: ohne Fehler abgeschlossen.
  TSC_EXIT_CODE=0
- npm run test --prefix frontend: vollständig erfolgreich, keine fehlgeschlagenen Tests.
  Ergebniszeilen unverändert:
 Test Files  88 passed (88)
      Tests  951 passed (951)
TEST_EXIT_CODE=0
- Die abschließende TypeScript-Prüfung nach der Auth-Testanpassung war ebenfalls fehlerfrei: TSC_EXIT_CODE=0.
- Routeninventar erneut geprüft: ADMIN_SEGMENTS=21, MISSING_ERROR_OR_LOADING=0.
- Geschützte Pfade erneut geprüft: PROTECTED_PATH_CHANGES=0.
- Alle 20 direkten Abhängigkeiten entsprechen der Lockdatei: LOCKFILE_VERSION_MISMATCHES=0.
- git diff --check: keine Formatfehler.
- Unabhängiger Code-Review durchgeführt. Body-Timeout einschließlich AbortError bei ausgelöstem Timeout-Signal behoben und durch Regressionstests abgesichert. Abschließender unabhängiger Review ohne weitere Befunde.

MUTATIONSPROBE
GET-only-Bedingung vorübergehend um POST erweitert. Isoliert ausgeführt:
npm run test --prefix frontend -- app/lib/saasAdminApi.resilience.test.ts -t "POST.*never retries a 503"

Ergebniszeilen unverändert:
 Test Files  1 failed (1)
      Tests  2 failed | 22 skipped (24)
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
MUTATION_EXIT_CODE=1
MUTATION_RESTORED=True

Die Tests für Storno und Freigabe erkennen den verbotenen POST-Retry. Mutation im finally-Block vollständig zurückgenommen.

ÄNDERUNGEN
- 21 Seiten-/Layout-Segmente inventarisiert. Alle besitzen error.tsx und loading.tsx: 18 fehlende Paare ergänzt, drei vorhandene Paare wiederverwendet.
- Vereinsbereich: Routengruppe, dashboard, anmeldungen, aufgaben, einrichtung, hilfe, konfiguration, warteliste, zahlungen, camps/new, camps/[campSlug] sowie dessen aufgaben, konfiguration, warteliste und zahlungen.
- Betreiberkonsole: Routengruppe, audit-log, new, registrations, [org] und [org]/preview.
- Export-Route-Handler liefern Dateien und benötigen keine Seiten-Fallbacks. Der strukturelle Ordner camps besitzt keine eigene Seite; seine beiden Untersegmente sind vollständig abgedeckt.
- Gemeinsame ruhige Fehleransichten mit „Erneut versuchen“/reset und Dashboard-Link. Ladeansichten verwenden den bestehenden Skeleton. Farben und Oberflächen bleiben beim bestehenden Designsystem.
- Layouts zeigen bei vorübergehendem Ausfall der Berechtigungsabfrage eine erneut abrufbare Fehleransicht statt einer irreführenden Login-Weiterleitung. Geschützte Kinder werden dann nicht gerendert; abgelaufene Sitzungen gehen weiterhin zum Login.
- Admin-API: ausschließlich GET wird höchstens einmal wiederholt, bei 503 mit gültigem Retry-After (Sekunden oder HTTP-Datum, maximal fünf Sekunden) oder Netzwerk-Timeout (eine Sekunde Wartezeit). Timeout pro Versuch: 60 Sekunden. Auch Timeouts beim Lesen des Antwortinhalts sind abgedeckt.
- Kein Retry bei 4xx, POST, PATCH oder DELETE. Zahlung, Storno und Freigabe sind zusätzlich durch Tests abgesichert.
- 502/503/504 und Offline-Zustand erhalten die vorgegebenen deutschen Meldungen; weitere Netzwerkfehler bleiben verständlich und ohne technische Details. API-Texte und Texte der berührten Aktionen zentral in frontend/app/lib/i18n/de.ts, Anrede „Sie“.
- Zahlungs- und Storno-Aktionen reichen die sichere Verbindungsnachricht an die Oberfläche weiter.
- Neue Tests für Retry-Grenzen, Wartezeiten, Fehlerzuordnung, Mutationsschutz, sämtliche 21 Fehler-/Ladeansichten und Layout-Ausfälle.
- Bestehender Login-Test nutzt den echten AdminAuthError und einen Partial-Mock; die Login-Weiterleitung bleibt geprüft.
- Windows-Testzeitlimit in vitest.config.mjs von 30 auf 120 Sekunden erhöht: Im ersten vollständigen Lauf benötigten bestehende UI-/Dateiscan-Tests etwa 59 bzw. 100 Sekunden. Assertions, Hook-Limit und Einstellungen anderer Betriebssysteme bleiben unverändert.
- Keine neuen Abhängigkeiten und keine Änderungen an package.json/package-lock.json. Nach blockiertem Paketdownload nutzt frontend/node_modules eine lokale Junction zu den vorhandenen Abhängigkeiten in CX16/frontend/node_modules. Zwischenkopien liegen ausschließlich unter dem ignorierten frontend/.next/cache; TypeScript erfasst 376 Projektdateien und keine Cache-Dateien.
- GESCHMACK.md zuerst gelesen; bestehende Komponenten, Theme-Variablen und ruhige Zustände beibehalten.

NICHT_AUSGEFÜHRT
- Kein git add, git commit, Push, Merge oder Deployment.
- Keine produktiven Datenbankzugriffe.
- Keine Änderungen an frontend/middleware.ts, frontend/proxy.ts, frontend/next.config.ts, frontend/tsconfig.json oder backend_saas/**.
- Keine Playwright-Dateien angelegt. Bereits vorhandene frontend/playwright.config.cf1.ts und frontend/e2e/ bleiben unverändert.
- Keine Browser-Screenshots, kein Playwright-Lauf und keine KSV-/JK-Produktionsbuilds; dies ist eine lokale Implementierungsübergabe, kein Commit-/PR- oder Deployment-Schritt.
- Temporären npm-Cache nach abgelehnter Löschung in das ignorierte Verzeichnis frontend/.next/cache/cx26-npm verschoben.
