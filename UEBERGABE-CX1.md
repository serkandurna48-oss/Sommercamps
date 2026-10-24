feat/cx1-linkvorschau
STATUS: fertig zur Prüfung

## TESTS

Vollständiger Frontend-Testlauf, Exit-Code 0. Unter Windows mit `npm.cmd run test --prefix frontend` ausgeführt, da PowerShell den Aufruf von `npm.ps1` blockiert. Ergebniszeilen unverändert:

```text
 Test Files  70 passed (70)
      Tests  690 passed (690)
   Start at  18:19:55
   Duration  26.70s (environment 51%, tests 20%, import 16%, transform 8%, worker 5%)
```

`npx.cmd tsc --noEmit -p frontend`: keine Diagnosen, Exit-Code 0. Ausgegebene Ergebniszeile des Prüfaufrufs:

```text
TSC_EXIT_CODE=0
```

- 16 neue Tests: Beschreibungen, Wortgrenzen und exakte 155-Zeichen-Grenze, Bildpriorität, absolute URLs, Request-Host, Open Graph/Twitter, unbekannte Vereine und API-Fehler sowie dynamisches PNG.
- Bildtest rendert mit dem echten Next-Bildrenderer ein PNG, prüft Signatur und 1200 × 630 Pixel sowie Vereinsname, Farbbalken und Logo. Der Renderer wird im Test über Node geladen, weil die Windows-Vitest-VM dessen `import.meta.url` verändert. Kein neuer Renderer und keine neue Abhängigkeit.
- ESLint für alle fünf geänderten/neuen TypeScript-Dateien: Exit-Code 0, keine Meldungen.
- `git diff --check`: Exit-Code 0.
- Unabhängiges Agentenreview gemäß CLAUDE.md: keine Findings. Geprüft wurden lokale Änderungen auf Basis von HEAD `9c80618666024235732db1b0b0abbfa5a753763c`.

## MUTATIONSPROBE

In `socialMetadata.ts` wurde ausschließlich die Zeile zur Wortgrenzenkürzung vorübergehend entfernt. Der gezielte Metadaten-Testlauf wurde rot:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
MUTATION_EXIT_CODE=1
```

Der Test „kürzt langen Introtext an der Wortgrenze und ergänzt eine Ellipse“ erwartete den Text bis zum letzten vollständigen Wort. Die Mutation lieferte zusätzlich das abgeschnittene Wort `Nachwuchstraini…`. Anschließend wurde der Originalcode wiederhergestellt; der oben dokumentierte vollständige Testlauf ist danach grün.

## ÄNDERUNGEN

- Die öffentliche Route ist in diesem Worktree `/pilot/[org]` selbst. Ihre `generateMetadata` liefert `Camps 2027 – CLUBNAME`, den Introtext mit höchstens 155 Zeichen vor der Ellipse und Kürzung an einer Wortgrenze sowie den geforderten Ersatztext ohne Intro.
- Open Graph enthält Titel, Beschreibung, `website`, `de_DE`, `CampsPilot` und Bild; Twitter verwendet `summary_large_image` mit denselben Inhalten.
- Bildreihenfolge: `hero_image_url`, statisches Hero aus `clubAssets.ts`, dynamisches Vereinsbild. Relative URLs werden mit `NEXT_PUBLIC_SITE_URL` absolut aufgelöst. Eine bestehende Produktions-URL-Konstante, insbesondere `SITE_URL_FALLBACK`, wurde nicht gefunden; deshalb verwendet der Fallback wie beauftragt `headers()` mit dem öffentlichen Request-Host.
- `opengraph-image.tsx` erzeugt 1200 × 630 Pixel mit großem Vereinsnamen, „Fußballcamps 2027“, Vereinsfarbbalken und verfügbarem Logo. Die bestehende Farbpipeline stellt lesbare Schrift auf dem Balken sicher. Verwendet wird die Standardschrift des Renderers, ohne eigenen externen Schriftdownload.
- Unbekannte Vereine und API-Fehler liefern neutrale Metadaten statt einer Ausnahme oder des geerbten KSV-Titels.
- Keine separate öffentliche Campdetail-/Anmelderoute vorhanden: Campauswahl und Anmeldung wechseln innerhalb von `ParentFlow` den React-Zustand. Daher keine zusätzliche Camproute angelegt und keine Adminroute mit öffentlichen Campmetadaten versehen.
- Geschmacksvorgaben berücksichtigt: Vereinsdaten und vorhandene Farb-/Bildquellen wiederverwendet, deutsche Texte, keine neue Elternansprache per Du. Keine sichtbare Änderung am Seitenlayout.

## NICHT_AUSGEFÜHRT

- Kein Deployment, kein Live-Test in WhatsApp und keine Prüfung dessen Vorschau-Cache.
- Keine Produktionszugriffe, keine Datenbankänderungen und keine neuen Abhängigkeiten.
- Kein Produktionsbuild und keine Browser-Screenshots; Metadaten und Bildrenderer wurden lokal mit isolierten Testdaten geprüft. Die Commit-/PR-Buildprüfungen für KSV und JK bleiben dem nachfolgenden Integrationsschritt vorbehalten.
- Kein `git add`, Commit, Push oder Merge. Der Orchestrator übernimmt den Commit; deshalb kein PR-/Review-SHA-Abgleich gegen einen Remote-Commit.
- `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `backend_saas/**` und `supabase/**` unverändert.
