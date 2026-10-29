#!/usr/bin/env bash
# Browser E2E for the parent registration on the real stack, fully local:
#   throwaway Postgres DB (127.0.0.1:${REVIEW_POSTGRES_PORT:-55443}) -> FastAPI :8113 -> next start :3113 -> Playwright.
# Never touches Staging/Production, never sends mail (APP_ENV=test, no provider).
# Needs: Postgres reachable on that port (CI service or scripts/dev/test-saas setup),
#        backend_saas requirements in $PYTHON, frontend node_modules, Playwright chromium.
#   scripts/e2e/run-e2e.sh            # build + test
#   SKIP_BUILD=1 scripts/e2e/run-e2e.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON="${PYTHON:-python3}"
PORT="${REVIEW_POSTGRES_PORT:-55443}"
API_PORT=8113
WEB_PORT=3113
PIDS=()
cleanup() { for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT

REVIEW_POSTGRES_PORT="$PORT" "$PYTHON" "$ROOT/scripts/e2e/seed_e2e.py"

(cd "$ROOT/backend_saas" && exec env -i PATH="$PATH" HOME="$HOME" \
  APP_ENV=test \
  DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/e2e_campspilot" \
  PGPASSWORD="${PGPASSWORD:-}" \
  SUPABASE_URL=http://127.0.0.1:59999 \
  SUPABASE_ANON_KEY=e2e-placeholder \
  CORS_ORIGINS_EXTRA="http://127.0.0.1:${WEB_PORT}" \
  "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$API_PORT") > "$ROOT/frontend/playwright-results-api.log" 2>&1 &
PIDS+=($!)

cd "$ROOT/frontend"
export NEXT_PUBLIC_SAAS_API_URL="http://127.0.0.1:${API_PORT}" NEXT_TELEMETRY_DISABLED=1
if [ "${SKIP_BUILD:-0}" != 1 ]; then npx next build; fi
npx next start -H 127.0.0.1 -p "$WEB_PORT" > playwright-results-web.log 2>&1 &
PIDS+=($!)

for _ in $(seq 1 60); do
  if curl -fs "http://127.0.0.1:${API_PORT}/health" >/dev/null && curl -fs -o /dev/null "http://127.0.0.1:${WEB_PORT}/pilot/e2e-verein"; then break; fi
  sleep 1
done
npx playwright test -c playwright.config.e2e.ts
REVIEW_POSTGRES_PORT="$PORT" "$PYTHON" "$ROOT/scripts/e2e/check_e2e.py"
