# CampsPilot SaaS API (`backend_saas/`)

FastAPI backend for the new, parallel CampsPilot multi-tenant SaaS — built independently of
`backend/`, which is and remains the KSV Baunatal legacy system. See
[`docs/saas/architecture.md`](../docs/saas/architecture.md) for the full architecture, and
[`docs/saas/database-schema.md`](../docs/saas/database-schema.md) for the database this service
talks to.

## Scope of this ticket (CP-S403)

This is a foundation, not a product. What exists:

- App boots, connects to Postgres, exposes `GET /health`.
- A tenant-resolution layer (`app/tenancy.py` + `app/repositories/organizations.py`) that turns
  a URL slug into a trusted `organization_id` — ready for later tickets to build real endpoints
  on top of.

What does **not** exist yet (deliberately out of scope for CP-S403): any Organizations/Camps/
Registrations CRUD API, parent-facing registration flow, JK onboarding, KSV migration, Supabase
Auth, `organization_members`, admin login, Stripe, Brevo/email, payments, a frontend, or any
deployment config (Render/Vercel). Don't build against this expecting any of that to exist.

## Relationship to `backend/`

`backend_saas/` is completely independent of `backend/`:

- No imports from `backend/main.py` or any other `backend/` module.
- Own `requirements.txt`, own `.env`, own connection pool.
- Talks to a **separate** Supabase project (`CampsPilot SaaS`, ref `wkmckfbzhmihyfwiekct`,
  `eu-central-1`) — never the KSV `Sommercamps` project, and never the KSV database, in any
  environment (local, test, or cloud).
- `backend/` is not modified by this ticket, or by anything in this directory.

## Setup

```bash
cd backend_saas
python -m venv venv          # or reuse a shared venv — no hard requirement either way
venv\Scripts\activate         # Windows; `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
copy .env.example .env        # Windows; `cp .env.example .env` on macOS/Linux
# edit .env — set DATABASE_URL (see .env.example for local vs. cloud)
```

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | **yes** | — | PostgreSQL connection string. App fails to start with a clear error if missing. See `.env.example` for local vs. Cloud values. |
| `APP_ENV` | no | `development` | Free-form label, currently only used in startup logging. |
| `LOG_LEVEL` | no | `INFO` | Passed to `logging.basicConfig`. |
| `APP_NAME` | no | `CampsPilot SaaS API` | Used as the FastAPI app title. |

No Stripe/Brevo/JWT/admin-password variables exist here — none of that is in scope yet. No
Supabase service-role key is needed either: this service connects directly to Postgres and does
not need to bypass RLS via the API layer.

## Running locally

Requires the local Supabase stack from the repo root (`supabase db start`, see
`docs/saas/database-schema.md`) — or a `DATABASE_URL` pointing at the Cloud `CampsPilot SaaS`
project.

```bash
cd backend_saas
uvicorn app.main:app --reload
# http://127.0.0.1:8000/health
# http://127.0.0.1:8000/docs
```

## Tests

```bash
cd backend_saas
pytest
```

All tests are isolated: `tests/conftest.py` sets a fake `DATABASE_URL` before anything imports
`app.main`, and every test monkeypatches `app.db.get_cursor`/`init_pool`/`close_pool` instead of
touching a real database. **No test in this suite ever contacts the KSV database, or any real
database at all.** If a future ticket adds real integration tests, they must run against the
local Supabase stack or an equally isolated test configuration — never KSV, and never without
being clearly labeled as an integration test.

## DB connection principle

`app/db.py` owns a single `ThreadedConnectionPool`, initialized in `app/main.py`'s FastAPI
`lifespan` on startup and closed on shutdown — not at import time, so importing `app.main` (e.g.
in tests) never opens a real connection by itself. Two context managers:

- `get_connection()` — borrows/returns a raw connection.
- `get_cursor()` — borrows a connection, yields a `RealDictCursor`, commits on success, rolls
  back on any exception.

`DATABASE_URL` is parsed with `urllib.parse` rather than string-concatenated, so adding
`sslmode=require` never breaks a URL that already has query parameters. `sslmode=require` is
applied automatically for any non-`localhost`/`127.0.0.1` host (i.e. always for Cloud, never for
the local stack, which has no SSL listener) — see `app/db.py::_dsn_with_sslmode`.

## Tenant isolation — the most important rule in this codebase

**An `organization_id` is never taken unchecked from a client request.** It is always resolved
server-side from a trusted source (today: a URL slug looked up against `organizations`) via
`app.tenancy.resolve_tenant(slug) -> TenantContext`.

```
URL slug → organizations repository → organizations.id → TenantContext → every tenant-scoped query
```

Every tenant-scoped repository function added in a later ticket **must** take an already-resolved
`TenantContext` (or its `organization_id`) as an explicit parameter, and use it in a parametrized
`WHERE organization_id = %s`:

```python
# Correct — organization_id comes from a TenantContext resolved server-side.
def get_camps(tenant: TenantContext) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute("SELECT ... FROM camps WHERE organization_id = %s", (tenant.organization_id,))
        return cur.fetchall()
```

```python
# Wrong — never do this. A client could pass any organization_id it wants.
def get_camps(organization_id_from_request: str) -> list[dict]:
    ...
```

This holds **even though Row Level Security is enabled** on `organizations`/`camps`/
`camp_registrations` (see `docs/saas/database-schema.md` §8) — RLS currently has zero policies
and is not a substitute for application-level filtering. It becomes a genuine second layer only
once Supabase Auth and `organization_members` exist; until then, this service is the only thing
standing between one tenant's data and another's.

### Tenant activity rule

`resolve_tenant()` treats `plan_status` values `pilot` and `active` as usable, and
`suspended`/`cancelled` as not — raising `TenantInactiveError` rather than silently treating an
inactive tenant like an active one. This is a deliberately simple binary split for CP-S403; no
plan-tier or billing nuance beyond "usable vs. not" is modeled here.

## Cloud smoke test

Once local tests pass, this service may be pointed at the `CampsPilot SaaS` Supabase Cloud
project (ref `wkmckfbzhmihyfwiekct`, `eu-central-1`) for a connectivity smoke test — connection +
`SELECT 1` + `/health` only. Never point it at the `Sommercamps`/KSV project. No real
organizations are written during this smoke test.
