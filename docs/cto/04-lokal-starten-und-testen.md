# 4. Lokal starten und testen

## Voraussetzungen

- Git, **Node 24**, **Python 3.13**, **Docker Desktop** (für Wegwerf-Postgres)
- Windows: PowerShell. Mac/Linux: bash.
- Keine `.env`-Dateien mit echten Werten nötig. Die Skripte setzen Testwerte selbst.

```bash
git clone https://github.com/serkandurna48-oss/Sommercamps.git campspilot
cd campspilot
git switch demo/jan
```

## Ein Befehl für alle Tests (wie die CI)

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev/test-saas.ps1          # Windows
```
```bash
scripts/dev/test-saas.sh                                                    # Mac/Linux
```

Optionen: `-Backend` / `--backend`, `-Frontend` / `--frontend`, `-Build` / `--build`.
Das Skript startet Postgres 17 in Docker auf `127.0.0.1:55443`. Die DB-Tests legen
pro Testmodul eine frische Datenbank an und spielen alle Migrationen ein; am
Ende wird der Container gelöscht. Liegt eine `backend_saas/.env` im Worktree,
bricht das Skript ab (die Einstellungen würden sonst gelesen).

Erwartung (Stand `775345d` + CTO-Branch, 29.10.):
- Backend: **699 Tests grün**, davon 55 nur mit Postgres (Ablauf-, RLS-,
  Mandanten-, Review-, Import-, Schema-Upgrade-Tests). Dauer ~15 s.
- Frontend: **1217 Vitest-Tests grün** (~2 min), `tsc` grün, Lint 0 Fehler
  (1 Warnung), `next build` grün.

Ohne Postgres schlagen die Import-Tests absichtlich fehl (`test_import_ksv.py`).
Das ist gewollt: kein „grün durch Überspringen“.

## Browser-Test der Elternanmeldung (E2E)

```bash
scripts/dev/test-saas.sh --backend   # startet nebenbei nichts; Postgres muss auf 55443 laufen
scripts/e2e/run-e2e.sh               # Seed → API :8113 → next build/start :3113 → Playwright
```

Legt eine frische DB `e2e_campspilot` an (Verein `e2e-verein`, Camp mit 1 Platz),
meldet im echten Browser ein Kind an (Platz) und ein zweites (Warteliste), prüft
Pflichtfelder und danach die Datenbank. Läuft in der CI als Job `saas-e2e`.
Erstmalig: `cd frontend && npx playwright install chromium`.

## Lokaler Elternflow im Browser (ohne Login)

```powershell
py -3.13 -m venv scripts/dev/.venv
scripts/dev/.venv/Scripts/python -m pip install -r backend_saas/requirements.txt
cd frontend; npm ci; cd ..
powershell -ExecutionPolicy Bypass -File scripts/dev/start-local.ps1
# http://127.0.0.1:3112/pilot/jk-academy-demo   (API: http://127.0.0.1:8112/docs)
powershell -ExecutionPolicy Bypass -File scripts/dev/stop-local.ps1
```

Legt die DB `dev_l2` mit allen Migrationen und einem synthetischen Demo-Verein an.
Login/Admin funktioniert lokal **nicht** (kein Supabase Auth). Admin-Abläufe
testest du auf Staging. Danach ist Port 55443 belegt: Tests dann mit
`test-saas.ps1 -UseExistingPostgres` (sicher, die Tests legen eigene DBs an).

## Staging benutzen

- Elternseite: `https://campspilot-git-demo-jan-serkans-projects-a49183cd.vercel.app/pilot/<slug>`
  (Shareable Link von Serkan).
- API-Doku: `https://campspilot-staging.onrender.com/docs`
- Nur synthetische Daten: `*@example.com`, Kind „Testkind“, keine echten Namen.
- Mails aus der API gehen nur an Adressen in `NOTIFICATION_ALLOWED_RECIPIENTS`.
  Alles andere wird blockiert und steht als `email_error` an der Anmeldung.
  Ausnahme: Mails, die Supabase Auth selbst verschickt (Passwort-Reset), laufen
  nicht durch diesen Schutz – dort nur eigene Testadressen verwenden.

## Häufige Fehler

| Meldung | Ursache | Lösung |
|---|---|---|
| `Port 55443 is busy` | anderes Postgres läuft | stoppen oder `-UseExistingPostgres` (nur Wegwerf-DB!) |
| `REVIEW_POSTGRES_PORT=55443 erforderlich` | Backend-Tests ohne DB | über das Skript starten |
| „Camps gerade nicht erreichbar“ im Build | `NEXT_PUBLIC_SAAS_API_URL` fehlt beim Build | ist Build-Zeit-Variable; Skript setzt sie |
| Test hängt bei Timern | `vi.useFakeTimers()` friert jsdom-FileReader ein | nur `Date`/`setTimeout` faken (siehe `DoneScreen.actions.test.tsx`) |
