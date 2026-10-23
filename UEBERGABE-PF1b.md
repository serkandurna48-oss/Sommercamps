fix/pf1b-pool
STATUS: fertig zur Prüfung
COMMIT: (wird nach git commit befüllt)

---

## TESTS

### Backend — python -m pytest backend_saas/tests/test_db.py -v
```
11 passed in 55.16s
```
Neue Tests:
- test_pool_serves_all_threads_without_pool_error — PASSED
- test_database_busy_when_pool_permanently_exhausted — PASSED
- test_503_with_retry_after_on_database_busy — PASSED
- test_semaphore_released_after_exception — PASSED

### Frontend — npx vitest run --root frontend
```
527 passed, 4 failed (alle 4 pre-existing, nicht in unseren Dateien)
```
Pre-existing failures (nicht durch diesen Fix verursacht):
- adminConsistency.test.ts > keeps every admin date formatter (glob CWD-Problem)
- accessibility.test.tsx > shares a 2px focus outline (ENOENT: focus.css, falscher Pfad)
- adminLayout.test.tsx × 2 (ENOENT: tokens.css, falscher Pfad)

Neue Tests (alle PASSED):
- BandTabs.test.tsx > alle Menü-Links im Band haben prefetch={false}
- saasAdminApi.test.ts > fetchMe dedupliziert innerhalb einer Anfrage: zweimal aufgerufen → ein fetch
- saasAdminApi.test.ts > bei 503 dann 200 → Erfolg mit genau 2 fetch-Aufrufen

---

## MUTATIONSPROBE

test_pool_serves_all_threads_without_pool_error ist gleichzeitig die Mutationsprobe:
Wenn _sem.release() aus dem finally-Block in get_connection() entfernt wird,
gibt das Semaphore seine Slots nie frei. Nach den ersten 3 Threads blockieren
die verbleibenden 17 mit 0,01s timeout + sofortigem DatabaseBusy → errors ≠ []
→ Test rot.

test_semaphore_released_after_exception testet zusätzlich, dass release() auch
nach einem getconn()-Fehler aufgerufen wird.

---

## ÄNDERUNGEN

### Backend
- backend_saas/app/config.py: DB_POOL_MAX (Standard 15, min 2), DB_POOL_MIN (Standard 1), DB_POOL_WAIT_SECONDS (Standard 5)
- backend_saas/app/db.py:
  - DatabaseBusy Exception
  - _sem: threading.BoundedSemaphore
  - init_pool: liest Env-Vars, erstellt Semaphore
  - close_pool: setzt _sem zurück
  - get_connection: BoundedSemaphore.acquire(timeout=...) → DatabaseBusy statt PoolError; Verbindung immer zurückgegeben (putconn), defekte mit close=True; Semaphore immer freigegeben (finally)
- backend_saas/app/main.py: Exception-Handler für DatabaseBusy → 503 + Retry-After: 2 + JSON {"detail": "Server ausgelastet, bitte erneut versuchen"}
- backend_saas/tests/test_db.py: 4 neue Tests (Pool, DatabaseBusy, 503, Semaphore)

### Frontend
- frontend/app/lib/saasAdminApi.ts:
  - adminFetch: bei 503 genau ein Wiederholversuch nach 400 ms
  - fetchMe: mit cache() aus react dedupliziert (Layout und Seite teilen sich einen Aufruf)
- frontend/app/components/saas/shell/BandTabs.tsx: prefetch={false} auf allen Tab-Links
- frontend/app/platform/(console)/layout.tsx: prefetch={false} auf den drei Nav-Links (Vereine, Anmeldungen, Änderungsverlauf)
- frontend/app/lib/saasAdminApi.test.ts: neue Testdatei (Deduplizierung + Retry)
- frontend/app/components/saas/shell/BandTabs.test.tsx: test "alle Menü-Links haben prefetch={false}"

---

## NICHT_AUSGEFÜHRT

- DB-Migration: keine DB-Schemaänderungen
- npm install / pip install: keine neuen Abhängigkeiten
- Deploy: lokale Commits, kein Push, kein Merge
