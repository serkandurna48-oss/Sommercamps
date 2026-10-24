feat/kv4b-zusatzfragen-listen
STATUS: fertig zur Prüfung
COMMIT: (nach Commit eintragen)

## TESTS

### Frontend (Vitest)
Ausgeführt: `npx vitest run --root frontend --reporter=verbose`
Ergebnis: **528 passed, 5 failed** — die 5 Fehler sind präexistierend:
- `adminConsistency.test.ts` — Glob-Zählung (Datei-Pfad-Issue, unabhängig)
- `preview.test.tsx` — Timeout (langer Render-Test, unabhängig)
- `accessibility.test.tsx` — fehlendes `focus.css` (Pfad-Issue, unabhängig)
- `adminLayout.test.tsx` (2×) — fehlendes `tokens.css` (Pfad-Issue, unabhängig)

Neue Tests in `dayListExport.test.ts` (describe `buildPrintExtraColumns`):
- ✓ KSV: Position + Verein → 2 Spalten mit korrekten Werten (deckt DayListPrint und ParticipantListPrint ab)
- ✓ 5 Fragen → 3 Einzelspalten + „Weitere"
- ✓ Leere Antwort → „–"
- ✓ Gelöschte Frage erscheint unter „Weitere" mit gespeichertem Schlüssel
- ✓ Mutationsprobe: Reihenfolge umkehren → Test schlägt fehl

### TypeScript
`npx tsc --noEmit --project frontend/tsconfig.json` → **0 Fehler** (exit code 0)

### Backend (pytest)
`python -m pytest backend_saas/tests/test_admin_exports_api.py -v`
Ergebnis: **11 passed, 0 failed** (inkl. 2 neue Tests)
- ✓ `test_export_daylist_extra_answers_columns_present_with_correct_values`
- ✓ `test_export_participants_extra_answers_all_questions_no_truncation`

## MUTATIONSPROBE
`buildPrintExtraColumns([...ksvQuestions].reverse())` liefert `['Verein', 'Position']` statt `['Position', 'Verein']` → Test `cols.map(c => c.header).toEqual(['Position', 'Verein'])` schlägt dann fehl. Belegt in Zeile 100, `dayListExport.test.ts`.

## ÄNDERUNGEN

### Frontend (neue Logik)
- `frontend/app/lib/exportCsv.ts:9` — `ExportColumn<T>` erhält optionales `title?: string` (HTML-Tooltip für `<th>`)
- `frontend/app/components/saas/dayListExport.ts` — neue Funktion `buildPrintExtraColumns(questions)`:
  - ≤ 3 Fragen → je eine schmale Spalte (Kurzlabel max. 14 Zeichen, `title` = volles Label, Antwort oder „–")
  - > 3 Fragen → erste 3 + Spalte „Weitere" (Überlauf + verwaiste Schlüssel gelöschter Fragen)

### Frontend (UI-Kette)
- `DayListPrint.tsx` — neues Prop `questions?: RegistrationQuestion[]`; Extra-Spalten nach „Kind" eingefügt; `title` auf `<th>`, 9 pt auf „Weitere"-`<td>`
- `ParticipantListPrint.tsx` — identisch zu DayListPrint
- `ParticipantExport.tsx` — Prop `questions` durchgereicht an Print-Komponenten
- `ParticipantList.tsx` — Prop `questions` hinzugefügt, an ParticipantExport weitergegeben
- `CampDetailScreen.tsx` — `questions={org.registration_questions ?? []}` an ParticipantList

### Backend (Tests)
- `backend_saas/tests/test_admin_exports_api.py` — 2 neue Tests:
  - KSV-Fixture (Position + Verein) → Spalten im Daylist-XLSX vorhanden, Werte korrekt, Reihenfolge stimmt (Mutationsprobe)
  - 5 lange Labels → alle 5 als vollständige Spaltenüberschriften im Participants-XLSX (keine Kürzung)

## SCREENSHOT-HINWEISE
- Tagesliste drucken: Position- und Verein-Spalte erscheinen direkt nach „Kind"
- Spalten > 3: erste 3 als individuelle Spalten, Rest in 9-pt-Spalte „Weitere"
- Tooltip: Hover auf gekürzten Spaltenkopf zeigt volles Label

## NICHT_AUSGEFÜHRT
- CSV-Export (Tagesliste, Teilnehmerliste) enthält noch keine Zusatzfragen-Spalten — im Auftrag nicht explizit gefordert; Excel-Export (Backend) war bereits vollständig implementiert
- Gelöschte Fragen bei ≤ 3 aktiven Fragen erscheinen nicht in einer gesonderten „Weitere"-Spalte (nur wenn > 3 aktive Fragen existieren und damit „Weitere" ohnehin vorhanden ist)
- Lint-Ergebnis (`npm run lint`) lag bei Commit-Zeitpunkt noch aus (TypeScript sauber, Tests grün)
