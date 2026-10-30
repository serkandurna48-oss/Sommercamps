STATUS: Lokale Reparatur abgeschlossen; Commit durch Dateisystem-Sandbox blockiert, K27FORM-Produktabnahme offen.

Branch: `fix/k27form-r1`; Start-HEAD: `d08845deb4a587bad933af96a8b1870506c59531`; Vergleichsbasis: `8b0cc542d6b5c081e9533fb220e7bb41cd2ce4de`. Start-Arbeitsbaum war sauber.

## Reparaturen

1. `frontend/app/lib/exportCsv.ts`: Formelzeichen `=`, `+`, `-`, `@` nach führendem Unicode-Leerraum/Formatzeichen oder nach Zeilenumbrüchen werden als Text exportiert. Der Schutz liegt im gemeinsamen Serializer und gilt damit auch für andere nutzerkontrollierte CSV-Zellen und Spaltenüberschriften. Semikolon, Anführungszeichen und Zeilenumbrüche bleiben korrekt CSV-kodiert; alleinstehendes CR wird nun ebenfalls zitiert. XLSX-Pfad und sensible Export-Standards sind unverändert.
2. `registrationQuestionTemplates.ts` und `RegistrationQuestionsBuilder.tsx`: Vorlagen werden nur für eigene Schlüssel angeboten und übernommen. `constructor`, `toString`, `__proto__` erhalten keine Vorlage. KSV behält die bestehende opt-in-Vorlage mit unabhängigen Kopien.
3. `.qa-k27form/dev-server.log`: Ausschließlich zwei zusätzliche leere Schlusszeilen entfernt. Der Log-Inhalt blieb erhalten.

## Verifikation

- Node 24.19.0, synthetische direkte Assertions auf den TypeScript-Modulen: 16 CSV-Fälle einschließlich CRLF, Unicode, Standardtext und Header/Zeilen sowie Negativ-/Kopierfälle für Vorlagen → Exit 0. Zusätzlicher zitierter Formelwert `=1+1;Kommentar` → Exit 0.
- Neue Vitest-Regressionstests in `exportCsv.test.ts`, `ParticipantExport.test.tsx` und `RegistrationQuestionsBuilder.test.tsx` angelegt. Nicht ausgeführt: In diesem isolierten Worktree fehlen `frontend/node_modules`, Vitest und tsc; keine Installation vorgenommen.
- `git diff --check` für Arbeitsänderungen → Exit 0; `git diff --check 8b0cc54` für Basis gegen getrackten Arbeitsstand → Exit 0. `git diff --check 8b0cc54 HEAD` bleibt wegen des unmöglichen Commits auf dem alten HEAD bei Exit 2 (QA-Log-Zeile 1478). Ein neuer HEAD und dessen Pflichtcheck sind daher nicht belegbar.
- `git add` der ausschließlich gezielten Dateien scheiterte mit `fatal: Unable to create .../Sommercamps/.git/worktrees/K27FORM-R1/index.lock: Permission denied`. Daher kein Staging und kein Commit. Kein Versuch, die Sandbox oder den Git-Index zu umgehen.

## Offene Gates

Kein API-/DB-Rundlauf, keine Fremdmandanten-Integration gegen isolierte DB, kein XLSX-Rundlauf, kein Build für KSV/JK, kein `SKIPPED_TESTS=0`-Nachweis und kein R2-Rollback-Beleg. Diese Prüfungen bleiben bis zu einer erlaubten isolierten Testumgebung offen. Keine Cloud-, externen Endpunkt-, Mail-, Zahlungs-, Rechte-, Push-, Merge- oder Deploy-Aktion.
