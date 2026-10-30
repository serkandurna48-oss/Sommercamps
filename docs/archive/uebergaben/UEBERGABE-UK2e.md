# Übergabe UK2e – Konsistenz Teil 2 (abgeschlossen durch Opus)

STATUS: fertig zur Prüfung (mit Einschränkung)

Codex (UK2e) brach am 21.10. um 18:51 wegen OpenAI-Usage-Limit ab, bevor er eine Übergabe schrieb. Seine letzte Notiz: Ein unabhängiger Review hatte noch Abweichungen bei Leerzuständen, Vereinseinstellungen und Suchfeldern gefunden; deren Nacharbeit war begonnen, ist aber nicht belegt.

## Was im Worktree liegt
- Neue gemeinsame Bausteine: `ui/StatGrid.tsx` (Kennzahl-Raster), `ui/ListRow.tsx` (Zeilenraster), `ui/PriceInput.tsx` (Preis mit Komma, Einheit €), Test `ui/adminLayout.test.tsx`.
- Angepasst: Screens (Camp, Zahlungen, Warteliste, Aufgaben, Einstellungen, Camp anlegen), StatCard, Zeilen, Export-Hinweis („Tagesliste enthält N Teilnehmende (ohne Warteliste und Stornierungen)“), Vorschau-Fixtures, de.ts.

## Von mir (Opus) ergänzt
- `ParticipantExport.test.tsx` an den neuen Export-Hinweistext angepasst (2 Assertions).

## TESTS
- tsc: Exit 0.
- vitest Gesamtlauf: 44 Dateien grün, 1 Datei rot (die 2 o. g. Assertions, behoben), 2 Dateien wegen Worker-Start unter Last nicht gelaufen. Nachlauf der 3 Dateien: `Test Files 3 passed (3)`.
- lint: 0 errors, 9 bestehende Warnungen.

## NICHT_AUSGEFÜHRT / offen
- Tabelle Seite × Regel aus dem Auftrag fehlt (Codex kam nicht mehr dazu).
- Die von Codex' Review gemeldeten Restabweichungen (Leerzustände, Vereinseinstellungen, Suchfelder) sind nicht nachweislich behoben → visuelle Prüfung per Screenshots nach dem Merge.
