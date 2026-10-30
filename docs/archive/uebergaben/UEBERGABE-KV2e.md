feat/kv2e-druckliste

STATUS: fertig zur Prüfung

COMMIT: 144ed1a

TESTS:
 Test Files  52 passed (52)
      Tests  478 passed (478)   (npm run test --prefix frontend)
Lint:  0 errors  (npm run lint --prefix frontend)
TSC:   0 errors  (npx tsc --noEmit -p frontend)

MUTATIONSPROBE:
Test `mutation probe: 2027-07-05 is a Monday` in `dayListExport.test.ts` prüft
alle vier Spaltenköpfe exakt: `['Mo 05.07.', 'Di 06.07.', 'Mi 07.07.', 'Do 08.07.']`.
Verschiebt man den Startpunkt in `campAttendanceColumns` um einen Tag (z.B. `sd + i + 1`
statt `sd + i`), ändert sich jeder Header (falsches Datum), und der Test schlägt rot.

ÄNDERUNGEN:

1. `frontend/app/components/saas/dayListExport.ts`
   — Neue Funktion `campAttendanceColumns(startDate, endDate)`:
     ≤ 7 Tage → je eine Spalte pro Tag (Header „Mo 04.01." etc.)
     > 7 Tage → einzelne Spalte mit Header „Anwesend"

2. `frontend/app/components/saas/data/DayListPrint.tsx`
   — Ersetzt `DAY_LIST_COLUMNS` (inklusive der alten „Anwesenheit"-Spalte) durch
     `[...DAY_LIST_COLUMNS.slice(0, -1), ...campAttendanceColumns(...)]`
   — Button-Text: „Drucken" → „PDF / Drucken"
   — Hinweiszeile (nur Bildschirm, `.cp-noprint`): „Im Druckdialog ‚Als PDF speichern‚ wählen."
   — Kopf ergänzt: Vereinsname (optional, aus `orgName?`-Prop),
     Camp-Zeitraum (`formatDateRange`), „Stand:" statt „Erstellt:"
   — Schmale Kästchen-Spalten: Klasse `cp-daylist-check-col` auf th/td der Tages-Spalten
   — `cp-daylist-many-cols`-Klasse wenn > 7 Spalten gesamt (9pt-Print)

3. `frontend/app/components/saas/data/ParticipantListPrint.tsx`
   — Identische Anwesenheits-Spalten wie oben (an `PARTICIPANT_PRINT_COLUMNS` angehängt)
   — Button, Hinweiszeile, Kopf, Klassen: analog zu DayListPrint

4. `frontend/app/components/saas/data/ParticipantExport.tsx`
   — Neues optionales Prop `orgName?: string`, wird an beide Print-Dialoge weitergegeben

5. `frontend/app/components/saas/data/ParticipantList.tsx`
   — Neues optionales Prop `orgName?: string`, wird an `ParticipantExport` weitergegeben

6. `frontend/app/components/saas/screens/CampDetailScreen.tsx`
   — Übergibt `orgName={org.name}` an `ParticipantList`

7. `frontend/app/components/saas/ui/ExportBar.tsx`
   — Button-Text: `onPrint ? 'Druckansicht' : 'Drucken'` → immer „PDF / Drucken"

8. `frontend/app/components/saas/tokens.css`
   — `@page { size: A4 portrait; margin: 12mm }` im Print-Block
   — `.cp-daylist-many-cols { font: 9pt … }` (bei > 7 Spalten)
   — `.cp-daylist-check-col { width: 52px; text-align: center }` (screen + print 40px)

9. `frontend/app/components/saas/dayListExport.test.ts`
   — Neue `describe('campAttendanceColumns')`:
     4-Tage-Camp → 4 Spalten; 1-Tag; 7 Tage; > 7 → „Anwesend"; Mutationsprobe

10. `frontend/app/components/saas/data/ParticipantExport.test.tsx`
    — Alle „Druckansicht" → „PDF / Drucken" (Buttons im Dropdown)
    — „Erstellt:" → „Stand:" in Header-Checks
    — Spalten-Checks der Dialoge auf neue per-Tag-Header aktualisiert
      (5-Tage-Camp 2027-07-05–09: Mo–Fr)
    — `expect(dialog.textContent).toContain('Als PDF speichern')` in beiden Dialogen

SCREENSHOT-HINWEISE:
— Dialog öffnen (Exportieren → PDF / Drucken): rechts neben den Datenspalten
  erscheinen schmale Tages-Spalten (z.B. „Mo 05.07." … „Fr 09.07.")
— Die Hinweiszeile „Im Druckdialog …" ist unterhalb der Buttons sichtbar
— Im Browser-Druckdialog: Seitenformat A4 Hochformat, Rahmen 12mm

NICHT_AUSGEFÜHRT:
— Build (`npm run build`) nicht ausgeführt (kein club-spezifischer geteilter Code geändert;
  nur SaaS-Admin-Komponenten unter `components/saas/` betroffen)
— Visuelle Browser-Verifikation des tatsächlichen Druckdialogs nicht möglich (kein Browser)
