<!--
  CampsPilot SaaS PR. Workflow: docs/cto/03-git-und-deployment.md
  Base branch: `demo/jan` (Staging). Never open feature PRs against `main`:
  `main` deploys the production frontend.
  Mark items that do not apply as "N/A" instead of deleting them.
-->

## Kundennutzen und Fertig-Kriterium

<!-- Welcher Nutzerablauf wird besser? Woran sieht man, dass es fertig ist? -->

## Änderungen

<!-- Stichpunkte, konkret. -->

## Betroffene Mandanten

- [ ] Alle SaaS-Vereine (geteilter Code)
- [ ] Nur KSV (`ksv-baunatal`, tenant-scoped)
- [ ] Nur JK / anderer Verein: ______
- [ ] Legacy `backend/` oder klassische Vereinsseite
- [ ] Keiner (Doku, Tooling)

## Prüfung

- [ ] CI „SaaS checks“ grün auf dem **letzten** Commit (SHA: ______)
- [ ] Lokal: `scripts/dev/test-saas.ps1` bzw. `scripts/dev/test-saas.sh`
- [ ] Neuer Code hat einen Test, der ohne die Änderung fehlschlägt
- [ ] Auf Staging durchgeklickt (nur synthetische Testdaten), Link: ______
- [ ] Mobile geprüft (falls UI)
- [ ] Falls Legacy betroffen: `npm run build` mit `NEXT_PUBLIC_ACTIVE_CLUB=ksv` **und** `=jk`, `python -m py_compile backend/main.py`

## Datenbank, Env, Abhängigkeiten

- [ ] Neue Migration: ______ (idempotent, in Staging-Supabase angewendet, Rollback beschrieben)
- [ ] Neue Env-Var: ______ (in `.env.example` + Render/Vercel **Staging** gesetzt; Prod-Wert notiert)
- [ ] Neue Dependency: ______ (Grund)
- [ ] N/A

## Datenschutz

- [ ] Keine echten Eltern-/Kinddaten in Code, Tests, Logs, Screenshots
- [ ] Neue personenbezogene Felder? Datenschutzerklärung/Retention geprüft
- [ ] N/A

## Risiko und Rollback

<!-- Was geht im schlimmsten Fall kaputt? Wie zurück (Revert, Redeploy vorheriger SHA, Migration)? -->

## Screenshots

<!-- Bei UI-Änderungen: vorher/nachher, Desktop + Mobile. Sonst löschen. -->
