feat/cx12-zahlungserinnerung

STATUS: fertig zur Prüfung

## TESTS

`npm run test --prefix frontend` – Exit 0, 0 fehlgeschlagen. Ergebniszeilen wörtlich:

```text
 Test Files  69 passed (69)
      Tests  701 passed (701)
   Start at  19:19:35
   Duration  71.30s (environment 54%, tests 17%, import 16%, transform 8%, worker 5%)

TEST_EXIT_CODE=0
```

`npx tsc --noEmit -p frontend` – keine Diagnoseausgabe, Exit 0. Protokollierte Ergebniszeile:

```text
TSC_EXIT_CODE=0
```

Ausführung unter Windows über `npm.cmd` und `npx.cmd`. ESLint für sämtliche neun geänderten/neuen TypeScript-Dateien: Exit 0, keine Befunde. `git diff --check`: Exit 0. Vorhandene Abhängigkeiten wurden in den Worktree kopiert; keine neuen Dependencies oder Änderungen an Paketdateien.

18 reine Funktionstests und zusätzliche Interaktionstests prüfen IBAN-Gruppierung, Betrag, exakte Referenz einschließlich Groß-/Kleinschreibung und Leerzeichen, fehlende IBAN, Statusausschlüsse, Sie-Anrede, Sammelliste trotz Such-/Statusfilter, fehlende/abgelehnte Clipboard-API und erfolgreiches Wiederholen nach einem Fehler.

Browserprüfung mit erfundenen lokalen Vorschau-Daten: Vereins- und Camp-Zahlungen jeweils bei 1440 und 390 Pixeln. IBAN-Sperre samt Tooltip, Einzel- und Sammelkopie, Bestätigung, schreibgeschützter Fallback und Wiederholen bestanden. Kein horizontaler Seitenüberlauf. Für den IBAN-Test nur vorübergehend eine Beispiel-IBAN in den Vorschau-Daten gesetzt und anschließend unverändert wiederhergestellt. Clipboard-Erfolg und -Ablehnung wurden im Browser kontrolliert simuliert.

FullPage-Screenshots vorher/nachher, Fallback-Screenshots, Browser-Skript und Logs liegen unter [Prüfnachweise](C:/Users/serka/dev/_reports/auftraege/CX12). Beispiele: [Mobil mit Fallback](C:/Users/serka/dev/_reports/auftraege/CX12/after-with-iban-camp-zahlungen-390-fallback.png), [Desktop mit Fallback](C:/Users/serka/dev/_reports/auftraege/CX12/after-with-iban-zahlungen-1440-fallback.png). Neue aktive Kopierbuttons: gemessene Textfarbe `rgb(23, 28, 25)` auf Weiß, Kontrast **17,26:1**. Bestehende Theme-Tokens und Komponenten verwendet; keine Vereinswerte fest im Produktcode.

Unabhängiger Code-Review gemäß CLAUDE.md, einschließlich der abschließenden Fallback-Anpassung: keine Fehlerbefunde. Basis-HEAD: `871570fb0c2742b0fdd0a9929a953964b92f7cdd`; geprüft wurde der uncommittierte Worktree.

## MUTATIONSPROBE

Die Zeile `Verwendungszweck: ${r.payment_reference}` wurde vorübergehend aus dem Erinnerungstext entfernt. Anschließend gezielt ausgeführt:

```text
npm run test --prefix frontend -- app/lib/zahlungserinnerung.test.ts -t "preserves the exact payment reference"
```

Der Test wurde erwartungsgemäß **rot**. Ergebniszeilen wörtlich:

```text
AssertionError: expected [ 'Guten Tag Alex Beispiel,', …(15) ] to include 'Verwendungszweck:  CP-aB09  00-X '
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
MUTATION_EXIT_CODE=1
```

Originalcode im `finally`-Block wiederhergestellt. Der oben dokumentierte vollständige grüne Testlauf erfolgte danach. [Mutationsprotokoll](C:/Users/serka/dev/_reports/auftraege/CX12/mutation.txt).

## BEISPIELTEXT

Erfundene Beispieldaten, wie im Funktionstest:

```text
Guten Tag Alex Beispiel,

die Zahlung für Mia für Sommercamp (5.–9. Juli 2027) ist bisher noch nicht bei uns eingegangen.

Bitte überweisen Sie den offenen Betrag mit folgendem Verwendungszweck:

Kontoinhaber: Beispiel Sportverein e. V.
IBAN: DE89 3704 0044 0532 0130 00
Betrag: 149,00 €
Verwendungszweck: CP-Ab09-001 Exact

Falls Sie bereits überwiesen haben, betrachten Sie diese Erinnerung bitte als gegenstandslos. Vielen Dank!

Mit freundlichen Grüßen
Alex Verein
Beispiel Sportverein e. V.
verein@example.com
```

Sammelliste, eine Anmeldung pro Zeile:

```text
Alex Beispiel – Mia Muster – Sommercamp – 149,00 € – CP-Ab09-001 Exact
```

## ÄNDERUNGEN

- `frontend/app/lib/zahlungserinnerung.ts`: reine Textfunktionen, IBAN-Gruppierung, Freigabeprüfung und gemeinsame deutsche Beschriftungen. Kontoinhaber und Preis-/Datumsformatierung entsprechen der Elternansicht; bei fehlendem rechtlichem Namen derselbe Vereinsname-Fallback. Der Verwendungszweck wird unverändert übernommen.
- `frontend/app/lib/zahlungserinnerung.test.ts`: Funktionstests einschließlich der Referenzprüfung für die Mutationsprobe.
- `PaymentTextCopy.tsx`: Clipboard-Aktion, Inline-Bestätigung „Text kopiert“, zugänglich beschrifteter read-only Textarea-Fallback mit Textauswahl bei Fokus.
- `PaymentRow.tsx`: „Erinnerung kopieren“ nur für aktive offene Zahlungen. Ohne IBAN deaktiviert, Tooltip „IBAN in den Vereinseinstellungen fehlt“. Fallback unterhalb der gesamten Zahlungszeile, damit der Text auch mobil lesbar bleibt.
- `PaymentSection.tsx`: „Alle offenen als Liste kopieren“ oberhalb der Liste, unabhängig vom Such-/Statusfilter. Ohne offene Anmeldungen deaktiviert. Die Sammelliste benötigt keine IBAN.
- `OrgPaymentsScreen.tsx` und `CampPaymentsScreen.tsx`: reichen ausschließlich benötigte, bereits vorhandene Vereinsdaten an die gemeinsame Komponente weiter.
- `PaymentSection.interaction.test.tsx` erweitert; bestehender `journey-end-to-end.test.tsx` um das erforderliche Vereins-Prop ergänzt.

Statusdefinition wie in der bestehenden Zahlungsansicht: `registered` oder `confirmed` mit `payment_status=open`. Stornierte Anmeldungen, Warteliste sowie bezahlte, erlassene und erstattete Zahlungen werden ausgeschlossen. Die Vereinsansicht umfasst alle ihre Camps; die Campansicht nur ihr jeweiliges Camp. Betrag aus dem bereits vorhandenen Camppreis, wie bisher in der Zahlungsansicht.

## NICHT_AUSGEFÜHRT

- Kein `git add`, Commit, Push, Merge, Deployment oder E-Mail-Versand. Die Übergabe betrifft lokale Änderungen; Commit übernimmt der Orchestrator.
- Keine Produktionsdaten, Datenbankänderungen oder zusätzlichen API-Aufrufe; keine Live-Backend-/Banktests.
- Keine Produktionsbuilds für KSV/JK und kein PR-SHA-Abgleich: dieser Auftrag verlangt lokale Tests/Typprüfung, keinen Commit oder PR.
- Original-Webfonts konnten wegen gesperrtem Google-Fonts-Netzzugriff nicht geladen werden. Browserprüfung/Screenshots nutzen lokale Ersatzschriften; dies begrenzt die typografische Prüfung.
- `frontend/middleware.ts`, `frontend/proxy.ts`, `frontend/next.config.ts`, `frontend/tsconfig.json` und `backend_saas/**` unverändert. Keine Playwright-Dateien unter `frontend/`; Browser-Skript und Bildnachweise liegen ausschließlich im Berichtsverzeichnis außerhalb des Frontends.
