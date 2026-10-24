feat/cx29-seo-meta

STATUS: fertig zur Prüfung

UMGESETZT

- Gemeinsamer SEO-Helper in frontend/app/lib/seo.ts: NEXT_PUBLIC_SITE_URL, Fallback https://campspilot.de, absolute Canonicals und Beschreibungen mit maximal 155 Zeichen einschließlich Ellipse an Wortgrenzen.
- Alle fünf Marketingseiten verwenden den Helper mit deutschen Metadaten, Open Graph (de_DE, website) und vorhandenem Marketing-Vorschaubild.
- Öffentliche Vereins- und Camp-Metadaten übernehmen Vereins-/Campnamen, optionale Camp-Beschreibung und Bild. Reihenfolge: Camp-Bild, Vereinslogo, Vereins-Hero, vorhandenes Clubbild, generiertes Fallback-Bild. Keine erfundenen Vereinsdaten oder fest eingetragene Jahreszahl im Fallback.
- Teilbare Camp-URL: /pilot/{org}?camp={slug}. Sie öffnet direkt das ausgewählte Camp. Auch „Anmeldelink kopieren“ in der Camp-Verwaltung und „Per WhatsApp teilen“ auf der Bestätigungsseite liefern diese URL. Ein Camp-Wechsel bei der Geschwisteranmeldung aktualisiert die öffentliche Kennung, ohne persönliche Daten in der URL zu speichern.
- React cache teilt die vorhandenen Datenzugriffe zwischen Metadaten und Seiteninhalt. Kein zusätzlicher API-Endpunkt und keine Backend-Änderung.
- Admin-, Plattform- und Login-Routen erben robots.index=false aus übergeordneten Layouts. Öffentliche Vereins-/Camp-Metadaten überschreiben dies gezielt mit index=true.
- robots.txt sperrt /pilot/, /platform/ und /api/ sowie /admin und /dev/. Sitemap enthält ausschließlich die indexierbare Marketingseite /campspilot. Rechtsplatzhalter und Registrierungsformular bleiben wie bisher noindex.

TESTS

Vollständiger Abschlusslauf: npm run test --prefix frontend, 0 fehlgeschlagen. Ergebniszeilen unverändert aus .qa-cx29/test-full.log:

```text
 Test Files  90 passed (90)
      Tests  933 passed (933)
EXIT_CODE=0
```

TypeScript: npx tsc --noEmit -p frontend, keine Diagnostik/Fehler. Protokollierter Prozess-Exit-Code aus .qa-cx29/tsc.log:

```text
EXIT_CODE=0
```

Ausführung über die vorhandenen npm-/npx-CLI-Dateien mit .qa-cx29/run-check.cjs. Der Starter protokolliert auch stdout/stderr der Unterprozesse vollständig; npx lief offline. Keine Installation oder Änderung von npm-Konfigurationen.

Zusätzlich: 85 gezielte SEO-/Routen-Tests grün (.qa-cx29/targeted-green.log). Der vollständige Abschlusslauf enthält auch die Tests für WhatsApp, kopierte Camp-Links und Geschwisteranmeldung. Die ursprüngliche URL-Gleichheitsprüfung wurde auf ausschließlich öffentliche Camp-Kennungen angepasst; Prüfungen gegen persönliche Daten in URL, Cookies und Storage bleiben bestehen.

Diff-Prüfung erfolgreich, Branch korrekt, keine gesperrte Datei geändert: .qa-cx29/scope-check.log.

MUTATIONSPROBE

/api/ wurde vorübergehend aus disallow in frontend/app/robots.ts entfernt. Der eigenständige Test für diesen Pfad schlug fehl:

```text
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
EXIT_CODE=1
```

Protokoll: .qa-cx29/mutation-red.log. Anschließend bytegenau wiederhergestellt; identische SHA-256-Prüfsummen in .qa-cx29/mutation-restore.log. Erneuter Test:

```text
 Test Files  1 passed (1)
      Tests  14 passed (14)
EXIT_CODE=0
```

Protokoll: .qa-cx29/mutation-green.log.

SEITEN MIT TITEL

| URL | Titel |
| --- | --- |
| /campspilot | Anmeldung Fußballcamp online – CampsPilot |
| /campspilot/datenschutz | Datenschutz – CampsPilot |
| /campspilot/impressum | Impressum – CampsPilot |
| /campspilot/teilnahmebedingungen | Teilnahmebedingungen – CampsPilot |
| /campspilot/registrieren | Verein registrieren – CampsPilot |
| /pilot/{org} | Fußballcamps – {Vereinsname} \| Anmeldung |
| /pilot/{org}?camp={slug} | {Campname} – {Vereinsname} \| Anmeldung |
| / | Bestehender Titel aus SITE_CONTENT.metaTitle und CLUB_CONFIG; jetzt zusätzlich Canonical und Vereinslogo |
| Unbekannter Verein / API-Fehler | CampsPilot |

HINWEISE

- Die ausdrücklich beauftragte /pilot/-Sperre in robots.txt verhindert auch das Crawling öffentlicher Vereins-/Campseiten durch regelkonforme Suchmaschinen. Die Share-Metadaten sind vorhanden.
- Die aktuelle öffentliche Camp-Schnittstelle enthält noch kein Beschreibungs-/Bildfeld. Die optionalen Felder werden ausgewertet, falls geliefert; ansonsten greifen der neutrale Text und das Vereinsbild. Keine Schemaerweiterung vorgenommen.
- Unabhängiger Review abgeschlossen, keine offenen Befunde. Basis-SHA: 177c2e5e270f6a4fa33054fe6a872c8818644846.
- GESCHMACK.md zuerst gelesen: deutsche Texte, keine erfundenen Daten, vorhandene Vereinsbilder und zentrale Datenquellen. Keine visuellen Änderungen.

NICHT_AUSGEFÜHRT

- Keine Installation von Paketen, kein git add, Commit, Push, Merge oder Deployment.
- Keine Änderungen an middleware.ts, proxy.ts, next.config.ts, tsconfig.json, backend_saas/** oder pilot/[org]/(org-admin)/**.
- Keine neuen Playwright-Dateien; bestehende Playwright-Konfigurationen unverändert.
- Keine Produktionsabfragen, kein WhatsApp-/Google-Liveabruf, kein Browser-Smoke-Test, kein Produktionsbuild und kein vollständiger ESLint-Lauf.
- Die ersten PowerShell-Aufrufe von npm/npx wurden durch die Skriptausführungsrichtlinie blockiert. Frühere abgebrochene Prüfläufe zählen nicht als erfolgreich; maßgeblich sind die oben verlinkten vollständigen Abschlussprotokolle. Der installierte CLI-Einstieg wurde verwendet, ohne Systemeinstellungen zu ändern.
