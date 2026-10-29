#!/usr/bin/env bash
# Run the same SaaS checks as .github/workflows/ci-saas.yml on a dev machine.
# Needs: Docker (or --use-existing-postgres), Python 3.13, Node 24.
# Safety: Postgres is a throwaway container bound to 127.0.0.1:55443. No .env
# files are read, no cloud database, no mail provider (APP_ENV=test).
#
#   scripts/dev/test-saas.sh                 # backend + frontend (no build)
#   scripts/dev/test-saas.sh --backend       # only backend_saas
#   scripts/dev/test-saas.sh --frontend      # only frontend
#   scripts/dev/test-saas.sh --build         # also run next build
#   scripts/dev/test-saas.sh --use-existing-postgres   # port 55443 already runs a DISPOSABLE local Postgres
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_BACKEND=1; RUN_FRONTEND=1; RUN_BUILD=0; USE_EXISTING=0
for arg in "$@"; do
  case "$arg" in
    --backend) RUN_FRONTEND=0 ;;
    --frontend) RUN_BACKEND=0 ;;
    --build) RUN_BUILD=1 ;;
    --use-existing-postgres) USE_EXISTING=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
PG_NAME=campspilot-test-pg
STARTED_PG=0
cleanup() { if [ "$STARTED_PG" = 1 ]; then docker rm -f "$PG_NAME" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

if [ "$RUN_BACKEND" = 1 ]; then
  if [ "$USE_EXISTING" = 0 ]; then
    if (exec 3<>/dev/tcp/127.0.0.1/55443) 2>/dev/null; then
      echo "Port 55443 is busy. Stop that Postgres or pass --use-existing-postgres (only if it is a throwaway local DB)." >&2; exit 1
    fi
    docker run --rm -d --name "$PG_NAME" -p 127.0.0.1:55443:5432 \
      -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17 >/dev/null
    STARTED_PG=1
    for _ in $(seq 1 30); do docker exec "$PG_NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  fi
  cd "$ROOT/backend_saas"
  [ -d .venv ] || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
  env -i PATH="$PATH" HOME="$HOME" \
    APP_ENV=test \
    DATABASE_URL=postgresql://test:test@127.0.0.1:5432/not_a_real_database \
    SUPABASE_URL=https://test-project.supabase.co \
    SUPABASE_ANON_KEY=test-anon-key-not-real \
    REVIEW_POSTGRES_PORT=55443 \
    .venv/bin/python -m pytest -q tests
  .venv/bin/python -m compileall -q app
fi

if [ "$RUN_FRONTEND" = 1 ]; then
  cd "$ROOT/frontend"
  [ -d node_modules ] || npm ci
  export NEXT_PUBLIC_SAAS_API_URL=http://127.0.0.1:8001 NEXT_PUBLIC_ACTIVE_CLUB=ksv
  npm test
  npx tsc --noEmit
  npm run lint
  if [ "$RUN_BUILD" = 1 ]; then npm run build; fi
fi
echo "SaaS checks passed."
