feat/cx16-seo
STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend`, unter Windows als `npm.cmd run test --prefix frontend` ausgeführt: Exit-Code 0, kein fehlgeschlagener Test. Abschließende Ergebniszeilen unverändert:

```text
 Test Files  82 passed (82)
      Tests  860 passed (860)
   Start at  20:06:58
   Duration  19.95s (tests 54%, import 17%, transform 13%, worker 9%, environment 8%)
```

`npx tsc --noEmit -p frontend`, ausgeführt als `npx.cmd tsc --noEmit -p frontend`: keine Diagnosen, Exit-Code 0. Ergebniszeile des Prüfaufrufs unverändert:

```text
TSC_EXIT_CODE=0
```

- 18 neue Tests prüfen die fünf tatsächlichen Metadatenfunktionen: Titellänge ≤ 60, Beschreibung ≤ 155, Canonical-URLs, Open Graph, `index` auf der Hauptseite und `noindex` auf Rechteseiten/Registrierung. Außerdem Sitemap, sämtliche tatsächlichen Admin-Pfade, den gemeinsamen CX1-Origin-Fallback und serverseitig gerendertes JSON-LD einschließlich Angriffstext, optionalem Ort, kostenlosem Camp, geschlossener Anmeldung, leerer Liste und API-Fehler.
- ESLint für alle 13 geänderten/neuen TypeScript-Dateien: `ESLINT_EXIT_CODE=0`.
- `git diff --check`: `DIFF_CHECK_EXIT_CODE=0`.
- Unabhängiges lokales Agentenreview gemäß CLAUDE.md: keine Findings. Basis: uncommittierter Worktree auf HEAD `4cda608ee06073787316079cf9de4da6eedc6670`. Die anschließend ergänzte Test-Fixture wurde durch den abschließenden Testlauf, TypeScript und ESLint geprüft.
- Komponentencheck mit `vercel:react-best-practices`: JSON-LD bleibt serverseitig; keine zusätzlichen API-Aufrufe, Clientzustände oder Abhängigkeiten.

## MUTATIONSPROBE

In `frontend/app/pilot/[org]/CampStructuredData.tsx` wurde ausschließlich `.replace(/</g, '\\u003c')` vorübergehend entfernt. Aufruf:

```text
npm.cmd run test --prefix frontend -- app/pilot/[org]/structuredData.test.tsx -t "maskiert jedes"
```

Ergebniszeilen unverändert:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  20:05:34
   Duration  529ms (transform 37%, import 24%, worker 16%, environment 13%, tests 10%)

MUTATION_EXIT_CODE=1
```

Der Test „maskiert jedes < und verhindert das Ausbrechen aus dem JSON-LD-Script“ wurde rot: Der Campname mit `</script><script>alert(1)</script>` beendete den JSON-LD-Block vorzeitig. Erwartet wurde `\u003c/script>`, gelesen wurde nur der JSON-Anfang bis `Fußballcamp `. Das Original wurde im `finally`-Block wiederhergestellt. Der vollständige grüne Testlauf oben erfolgte danach.

## ÄNDERUNGEN

- `/campspilot`: deutscher Titel „Anmeldung Fußballcamp online – CampsPilot“, sachliche Beschreibung für Vereine und Fußballschulen, absolute Canonical-URL, Open Graph mit `de_DE` und `CampsPilot`, `index, follow`.
- `/campspilot/impressum`, `/datenschutz`, `/teilnahmebedingungen` und `/registrieren`: jeweils eigene Metadaten, Canonical- und Open-Graph-URL sowie `noindex, follow`. Die Rechtsbeschreibungen benennen den tatsächlich vorhandenen Zustand „noch nicht freigegeben“; keine erfundenen Rechtsinhalte.
- Gemeinsamer Marketing-Helfer `seoMetadata.ts`; Site-URL über die unverändert wiederverwendete Funktion `getSiteUrl()` aus CX1 (`socialMetadata.ts`): `NEXT_PUBLIC_SITE_URL`, sonst öffentlicher Request-Host samt Proxy-/localhost-Logik. Sitemap und Robots nutzen dieselbe Funktion.
- `app/sitemap.ts` als `MetadataRoute.Sitemap`: derzeit ausschließlich `/campspilot`. Der bestehende öffentliche Client `frontend/app/lib/saasApi.ts` besitzt nur Einzelvereinsabruf `fetchOrganization(orgSlug)` und Campliste `fetchCamps(orgSlug)`. Die einzige Vereinsliste `fetchOrganizationsAdmin(token)` in `saasAdminApi.ts` benötigt Plattform-Admin-Zugriff. Deshalb greift die ausdrücklich erlaubte Ausnahme: keine Vereins-/Camp-URLs, kein Backendzusatz, keine erfundenen Slugs und kein Adminzugriff. Es gibt zudem keine eigenständigen öffentlichen Campdetail-Routen; `/pilot/[org]/camps/...` sind Adminseiten. Ein Sitemap-Test mit gemockter öffentlicher Vereinsliste entfällt, weil dieser Endpunkt nicht existiert.
- `app/robots.ts` als `MetadataRoute.Robots`: erlaubt `/`, sperrt `/platform`, `/dev`, `/api` und die tatsächlichen URL-Präfixe der Routengruppe `(org-admin)` einschließlich aller Camp-Unterseiten; zusätzlich Vereinslogin. `(org-admin)` erscheint nicht in URLs. Der Sitemap-Link ist absolut.
- Vereinsseite rendert pro Camp aus der bestehenden öffentlichen Campliste einen `application/ld+json`-Scriptblock mit `SportsEvent`, Name, Anfang/Ende, vorhandenem Ort, Preis aus Cent in EUR und Vereinsname als Veranstalter. Eine geschlossene Anmeldung wird nicht mit einem unveröffentlichten Camp verwechselt. Jedes `<` wird vor der HTML-Ausgabe maskiert.
- Bestehenden TypeScript-Fehler in `hero-scrim.test.tsx` behoben: Der Mock von `ClubAssets` enthielt das inzwischen erforderliche Feld `galleryAltTexts` nicht. Ergänzt wurde ausschließlich `galleryAltTexts: {}`; kein Produktverhalten geändert.
- GESCHMACK.md zuerst gelesen und berücksichtigt: deutsche Texte, belegbare Inhalte, vorhandene Datenquellen, keine erfundenen Zahlen oder Versprechen. Keine sichtbare Layoutänderung.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge oder Deployment. Der Orchestrator übernimmt den Commit; daher kein Remote-PR-/Review-SHA-Abgleich.
- Keine produktiven Datenzugriffe und keine Backend-/Datenbankänderungen. Tests verwenden isolierte Fixtures und Mocks.
- Keine Änderungen an `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` oder `backend_saas/**`. Keine Playwright-Dateien angelegt.
- Kein Produktionsbuild, Browserlauf, Screenshot oder Live-Indexierungstest. Die Commit-/PR-Buildprüfungen für KSV und JK bleiben dem Integrationsschritt vorbehalten. Suchmaschinenplatzierungen wurden nicht gemessen oder zugesagt.
- Keine neuen Abhängigkeiten installiert. Für lokale Prüfungen wurde `frontend/node_modules` als ignorierte Junction auf die vorhandenen Abhängigkeiten des Worktrees CX11 eingerichtet. Die dort installierten Next.js-Anleitungen zu Metadaten, Sitemap, Robots und JSON-LD wurden gelesen.
