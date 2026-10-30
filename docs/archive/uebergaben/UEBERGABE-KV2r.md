feat/kv2-pdf-liste-r

STATUS: fertig zur Prüfung

COMMIT: be0151c

TESTS:

```
npx vitest run --root frontend --reporter=verbose frontend/app/components/saas/data/ParticipantExport.test.tsx

 ✓ participant export workflow > defaults to daily list, displays count, and exports the same CSV rows 4005ms
 ✓ participant export workflow > disables all exports at zero results and offers filter reset 458ms
 ✓ participant export workflow > uses regular tab controls and returns focus to the 44px trigger on Escape 844ms
 ✓ participant export workflow > keeps Excel failure in the screen with a retry action 637ms
 ✓ participant export workflow > opens a separate daily print dialog with camp/date/count and all columns 2182ms
 ✓ participant list print dialog > shows heading, count and all print columns 881ms
 ✓ participant list print dialog > first row shows the participant name 666ms
 ✓ participant list print dialog > closes and returns focus to the Exportieren button 1201ms
 ✓ participant list print dialog > disables Druckansicht when no participants match the search 1917ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  11:34:02
   Duration  101.41s
```

TypeScript: `npx tsc --noEmit --project frontend/tsconfig.json` → exit 0, keine Fehler

MUTATIONSPROBE:

- `printEnabled={purpose !== 'payments'}` → `purpose === 'daylist'`: Test "disables Druckansicht when no participants match the search" schlägt fehl (Druckansicht-Button nicht gerendert bei purpose='participants')
- Überschrift in ParticipantListPrint von "Teilnehmerliste · {camp.title}" geändert: Test "shows heading, count and all print columns" schlägt fehl
- Spaltenheader in PARTICIPANT_PRINT_COLUMNS geändert: Test "shows heading, count and all print columns" schlägt fehl (toEqual auf Spaltenarray)
- `onClose={() => setPrinting(null)}` entfernt: Test "closes and returns focus to the Exportieren button" schlägt fehl

ÄNDERUNGEN:

- `frontend/app/components/saas/data/ParticipantListPrint.tsx` (neu)
  - Druckdialog für Teilnehmerliste (analog zu DayListPrint)
  - Exportierte Konstante `PARTICIPANT_PRINT_COLUMNS`: Kind, Jahrgang, Trikot, Notfallkontakt, Allergien/Hinweise, Abholberechtigt
  - Dialog mit createPortal, useEffect für showModal + Fokus-Rückgabe
- `frontend/app/components/saas/data/ParticipantExport.tsx`
  - `printing` State: `boolean` → `null | 'daylist' | 'participants'`
  - `printEnabled`: `purpose === 'daylist'` → `purpose !== 'payments'`
  - `onPrint`: wählt Dialog nach purpose aus
  - Zweites bedingtes Render für ParticipantListPrint
- `frontend/app/components/saas/data/ParticipantExport.test.tsx`
  - Neuer `describe('participant list print dialog')`-Block mit 4 Pflichttests

SCREENSHOT-HINWEISE:

Im Admin-Bereich eines Camps → Teilnehmer → Exportieren:
1. Purpose "Alle Anmeldungen" auswählen → Druckansicht-Button muss aktiv sein (vorher deaktiviert)
2. Druckansicht klicken → Dialog öffnet sich mit Überschrift "Teilnehmerliste · [Camp-Name]"
3. Tabelle zeigt Spalten: Kind | Jahrgang | Trikot | Notfallkontakt | Allergien/Hinweise | Abholberechtigt
4. "Zurück zur Liste" → Dialog schließt, Fokus zurück auf Exportieren-Button
5. Purpose "Zahlungsübersicht" → kein Druckansicht-Button
6. Purpose "Camp-Tagesliste" → Druckansicht öffnet weiterhin den bisherigen DayListPrint-Dialog

NICHT_AUSGEFÜHRT:

- `npm run build` (KSV + JK) — keine Club-Konfiguration berührt, kein Produktionscode geändert; bleibt Verantwortung des PR-Reviewers
- Browser-Test gegen laufenden Dev-Server — kein laufender Server in dieser Session
- Deployment / Push nach origin — Policy: kein Deploy ohne Freigabe
