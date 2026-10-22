test/uc4b-ablauftest

STATUS: fertig zur Prüfung

COMMIT: 71354761d8f9632ed29551f6faa847af0bd90273
  test: UC4 Ablauftest Eltern bis Admin

TESTS:
  Backend (Isolation — maßgeblich):
    python -m pytest backend_saas/tests/test_journey_end_to_end.py -v
    → 1 passed in 279.89s  ✓

  Backend (Volle Suite — informativer Kontext):
    python -m pytest backend_saas/tests -q
    → 8 failed, 573 passed, 29 subtests passed in 2550.92s
    Ursache der 8 Fehler (nicht durch diese Änderung verursacht):
      - test_import_ksv.py ×2: subprocess.TimeoutExpired — pre-existing, Import-Skript
        versucht DB-Verbindung und läuft in 15-Sekunden-Limit
      - test_import_ksv.py ×1: tritt in voller Suite auf, nicht in Isolation
      - test_review_postgres.py ×3 + test_tenant_postgres_access.py ×2:
        DB-Contention bei parallelen Postgres-Fixtures; in Isolation (gemeinsam):
        python -m pytest backend_saas/tests/test_review_postgres.py
                         backend_saas/tests/test_tenant_postgres_access.py -q
        → 10 passed in 685.10s  ✓
    Mein test_journey_end_to_end.py hat PASSED auch in der vollen Suite.

  Frontend (Isolation — maßgeblich):
    npx vitest run --root frontend frontend/app/pilot/[org]/journey-end-to-end.test.tsx
    → 4 passed  ✓

  Frontend (Volle Suite — informativer Kontext):
    npm run test --prefix frontend
    → 1 failed, 313 passed — Ursache: vitest-pool Worker-Timeout-Contention
      bei 37 parallelen Workern (pre-existing, nicht durch diese Änderung verursacht)

LINT:
  npm run lint --prefix frontend
  → 0 errors, 9 warnings (pre-existing, nicht durch diese Änderung)

TSC:
  npx tsc --noEmit -p frontend
  → 0 errors  ✓

ÄNDERUNGEN:
  backend_saas/tests/test_journey_end_to_end.py   (neu, 413 Zeilen)
  frontend/app/pilot/[org]/journey-end-to-end.test.tsx  (neu, 246 Zeilen)
  docs/ops/ablauftest.md                           (neu, 82 Zeilen)

  Keine bestehenden Dateien geändert.

NICHT_AUSGEFÜHRT (bewusst ausgelassen, laut Auftrag):
  - Echte Mail-Versendung (FakeProvider statt SMTP)
  - Echter Browser / E2E-Browser-Test (kein Playwright/Cypress)
  - Stripe-Zahlung (kein Webhook-Test)
  - Supabase Auth gegen echten JWT-Service (Token gemocked)
  - Admin-Button „Aus Warteliste nachrücken" (kein UI-Trigger dafür, Promotion
    wird über API-Response geprüft)
  - Multi-Org-Paralleltest (zwei Orgs gleichzeitig)
