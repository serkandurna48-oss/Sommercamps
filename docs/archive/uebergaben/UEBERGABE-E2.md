ops/e2-smoke-check

STATUS: fertig zur Prüfung

COMMIT: wird mit diesem File erstellt (ops: E2 Smoke-Check-Skript für Abnahme)

TESTS:
  python -m pytest backend_saas/tests -q
  → 542 passed, 0 failed (inkl. 14 neue Tests in test_smoke_check.py)

NEUE DATEIEN:
  backend_saas/scripts/smoke_check.py   — Smoke-Check-Skript
  backend_saas/tests/test_smoke_check.py — 14 Tests mit httpx.MockTransport
  docs/ops/go-live-welle2.md             — Abschnitt 4 um Skript-Aufruf ergänzt

BEISPIELAUSGABE (konstruiert, kein echter Server erreichbar in dieser Umgebung):

  $ python scripts/smoke_check.py \
      --api-url https://BACKEND_API_URL \
      --frontend-url https://FRONTEND_URL \
      --org jk-performance-academy

  OK – Health – GET /health – 312 ms
  OK – Org jk-performance-academy – öffentliche Daten – name='JK Performance Academy'
  OK – Org jk-performance-academy – Campliste – 2 Camp(s), erstes: 'sommercamp-2027'
  OK – Org jk-performance-academy – Frontend /pilot/jk-performance-academy – 200, Org-Name enthalten
  OK – Org jk-performance-academy – Impressum – 200 (/pilot/jk-performance-academy/impressum)
  OK – Org jk-performance-academy – Datenschutz – 200 (Brevo-Erwähnung bestätigt)
  OK – Org jk-performance-academy – Teilnahmebedingungen – 200 (/pilot/jk-performance-academy/teilnahmebedingungen)

  ALLE OK – 7/7 Prüfungen bestanden

  Mit Testanmeldung (--register-email):
  ...
  OK – Anmeldung – POST /registrations – 201, token=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

    Token:            xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    Verwendungszweck: CP-XXXXXXXX

    -- SQL-Block zum Löschen (NUR AUSGABE, nicht ausgeführt) --
    DELETE FROM camp_registrations WHERE registration_token = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

NICHT_AUSGEFÜHRT:
  - Kein echter Backend- oder Frontend-Server erreichbar; Beispielausgabe ist konstruiert.
  - SQL-Block wird nur ausgegeben, nie ausgeführt (kein DB-Zugriff im Skript).
  - --register-email schreibt eine echte Anmeldung; Lösch-SQL danach selbst ausführen.
