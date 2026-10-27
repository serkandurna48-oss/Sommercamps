# KSV v1.1 Datenschutz – lokale Übergabe (27.10.2026)

Branch `fix/ksv-v11-health-retention`, Basis/HEAD `954038a`. Kein Commit, Push,
Merge, Cloud- oder Produktivzugriff; keine Migration ausgeführt.

## Änderungen

- `frontend/app/pilot/[org]/RegistrationFormScreen.tsx`,
  `frontend/app/lib/saasApi.ts`: eigenständige ausdrückliche Checkbox bei
  Gesundheitsangaben, clientseitige Sperre und separater Request-Wert.
- `backend_saas/app/schemas.py`, `backend_saas/app/repositories/registrations.py`,
  `backend_saas/app/routers/registrations.py`: unabhängige Validierung,
  Speicherung des Consent-Wertes, generische Fehlerprotokollierung ohne
  Exception-Text oder Request-Daten.
- `supabase/migrations/20261027120000_health_data_consent.sql`: additive,
  idempotente Spalte `boolean NOT NULL DEFAULT false`; Altanmeldungen bleiben
  unverändert. Supabase CLI ist lokal nicht verfügbar; Datei wurde daher
  manuell im bestehenden Migrationsschema erstellt und nicht angewendet.
- `backend_saas/scripts/retention_dry_run.py`,
  `backend_saas/scripts/RETENTION-RUNBOOK.md`: nur lokales, organisationsbezogenes
  und schreibgeschütztes Zählwerkzeug mit 30-Tage- und 12-Monats-Schwelle;
  dokumentierter manueller Lösch- und Freigabeplan.
- `frontend/app/pilot/[org]/datenschutz/page.tsx`,
  `frontend/app/datenschutz/page.tsx`: Fristen, separate Art.-9-Einwilligung,
  manuelle Durchführung und ungeklärte Backuprotation präzisiert.
- `backend_saas/tests/test_registrations_api.py`,
  `backend_saas/tests/test_registrations_repository.py`,
  `backend_saas/tests/test_retention_dry_run.py`,
  `frontend/app/pilot/[org]/RegistrationFormScreen.test.tsx`: Negativ-,
  Positiv-, Altclient-, Frist-, Idempotenz- und Tenant-Scope-Prüfungen.

## Tatsächlich ausgeführte Prüfungen

| Befehl | Exitcode | Ergebnis |
|---|---:|---|
| `py -3.13 -m pytest` in `backend_saas` | 1 | `py` in dieser Shell nicht vorhanden; keine Python-Tests ausgeführt. |
| `npm.cmd run test --prefix frontend` | 1 | 1199/1201 Tests bestanden. Zwei vorhandene Galerie-Erwartungen (`cx3-a11y`, `d1b`) widersprechen den aktuellen Bilddateien; außerhalb dieses Auftrags. |
| Gezielter Vitest-Lauf `RegistrationFormScreen.test.tsx` | 0 | 12/12 bestanden. |
| Gezielter Vitest-Lauf `legal.test.tsx` und `pages.test.tsx` | 0 | 20/20 bestanden. |
| TypeScript `tsc --noEmit -p frontend/tsconfig.json` | 0 | Keine Fehler. |
| `git diff --check` | 0 | Keine Whitespace-Fehler. |

## Verbleibende Release-Gates

1. Python 3.13/pytest lokal verfügbar machen und die Backendtests ausführen;
   Migration gegen eine **isolierte lokale** Testdatenbank zweimal prüfen.
2. Historische Gesundheitsangaben ohne dokumentierte ausdrückliche
   Einwilligung prüfen und bereinigen; kein rückwirkendes `true` setzen.
3. Operativen manuellen 30-Tage-Löschlauf inklusive Freigabe, Nachweis und
   Ausnahmebehandlung festlegen. Das Dry-Run-Skript löscht selbst **keine** Daten.
4. Finanzbelege von Anmeldedaten trennen und offene Zahlungspflichten prüfen,
   bevor die 12-Monats-Löschung freigegeben wird. NOT-NULL-Felder verhindern
   eine pauschale Teilanonymisierung; steuerlich erforderliche Buchungsbelege
   sind nach Gesetz getrennt zu erhalten (grundsätzlich acht Jahre).
5. Providerrotation für Backups belegen. Derzeit ist keine konkrete
   Backup-Löschfrist verifiziert.
6. Legacy-KSV-Formular (`frontend/app/components/RegistrationForm.tsx` /
   `backend/`) getrennt bewerten: die neue Einwilligungsvalidierung betrifft
   den SaaS-Piloten. Der Legacy-Rechtstext beschreibt die notwendige
   Einwilligung, der Legacy-Flow hat in diesem Auftrag keine neue Checkbox.
7. Vor Release die zwei bestehenden Galerie-Testfehler und den Gesamt-Testlauf
   klären; die projektüblichen Build-/Browserchecks stehen noch aus.
