# CampsPilot SaaS API (`backend_saas/`)

FastAPI backend for the new, parallel CampsPilot multi-tenant SaaS — built independently of
`backend/`, which is and remains the KSV Baunatal legacy system. See
[`docs/saas/architecture.md`](../docs/saas/architecture.md) for the full architecture, and
[`docs/saas/database-schema.md`](../docs/saas/database-schema.md) for the database this service
talks to.

## Scope (CP-S403 + CP-S404)

This is a foundation with a first thin slice of real API on top, not a product. What exists:

- App boots, connects to Postgres, exposes `GET /health` (CP-S403).
- A tenant-resolution layer (`app/tenancy.py` + `app/repositories/organizations.py`) that turns
  a URL slug into a trusted `organization_id` (CP-S403), now actually wired into routes via
  `app/deps.py::get_tenant_context` (CP-S404).
- Read-only, tenant-scoped public endpoints for organizations and published camps (CP-S404) —
  see [Public API](#public-api) below.

What does **not** exist yet (deliberately out of scope): any Organizations/Camps/Registrations
**write** API (no POST/PATCH/DELETE anywhere), parent-facing registration flow, capacity/
waitlist counting, JK onboarding, KSV migration, Supabase Auth, `organization_members`, admin
login, Stripe, Brevo/email, payments, a frontend, or any deployment config (Render/Vercel).
Don't build against this expecting any of that to exist.

## Public API

All endpoints below are **read-only** and require no authentication — they're the public,
tenant-scoped surface a future parent-facing frontend would read from. Every response goes
through an explicit Pydantic model in `app/schemas.py`; a new column added to `organizations` or
`camps` later does **not** become publicly visible automatically — someone has to deliberately
add it to `OrganizationPublic`/`CampPublic` first.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v1/organizations/{organization_slug}` | `OrganizationPublic` |
| `GET` | `/api/v1/organizations/{organization_slug}/camps` | `list[CampPublic]`, only `status = 'published'`, sorted by `start_date` |
| `GET` | `/api/v1/organizations/{organization_slug}/camps/{camp_slug}` | `CampPublic`, only if `status = 'published'` |

**`OrganizationPublic`** fields: `slug`, `name`, `legal_name`, `contact_email`, `contact_phone`,
`logo_url`, `primary_color`. Deliberately **excluded**: the internal `id` (the frontend never
needs it — it always addresses an organization by `slug`) and `plan_status` (internal
billing/admin state, not the client's business).

**`CampPublic`** fields: `slug`, `title`, `start_date`, `end_date`, `registration_start`,
`registration_end`, `age_min`, `age_max`, `capacity`, `price_cents`, `currency`, plus a computed
`registration_open: bool` (see below). Deliberately **excluded**: `id`, `organization_id`
(never needed — the URL already scopes the request to one organization), and `status` (a
draft/closed/archived camp is 404, not "here's a camp with status=draft").

**Draft/closed/archived camps are not just filtered from the list — they don't exist as far as
the detail endpoint is concerned either.** `GET .../camps/{camp_slug}` for a non-published camp
returns a plain 404, identical to a genuinely unknown slug or a camp belonging to a different
organization. All three cases collapse to the same outcome by construction (the repository query
filters `organization_id`, `slug`, and `status = 'published'` in one `WHERE` clause — see
`app/repositories/camps.py`), so the public API never confirms "this camp exists internally but
isn't published yet."

**`registration_open`** is computed on `CampPublic` (not stored): `true` unless the current UTC
time falls outside an explicit `registration_start`/`registration_end` window (a `null` bound
means "no limit" on that side). Capacity is **not** factored in yet — "N spots left" / waitlist
logic is out of scope for CP-S404.

### Unknown vs. inactive organizations — both 404

`GET /api/v1/organizations/{slug}` (and every camp endpoint under it) returns a **plain 404**
for both an unknown slug and a `suspended`/`cancelled` organization — same status code, same
generic body (`{"detail": "Organization not found"}`). This is deliberate: distinguishing them
(e.g. 404 vs. 403) would let a caller learn "this slug belongs to a real organization that's
just currently inactive," which is itself information the public API shouldn't leak (an
organization slug can be a real client/company name). The distinction is still logged
server-side (`app/deps.py::get_tenant_context`) for operational visibility — just never surfaced
to the client. See the CP-S404 report's "offene Entscheidungen" for the full reasoning.

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
`app.main`, and an autouse fixture (`_no_real_db_pool`) no-ops `app.db.init_pool`/`close_pool`
for every test so booting the FastAPI lifespan never opens a real connection. Tests that care
about DB behavior additionally monkeypatch `app.db.get_cursor` or the repository functions
directly. **No test in this suite ever contacts the KSV database, or any real database at all.**

| File | Covers |
|---|---|
| `test_health.py` | `/health` 200/503, no leaked connection details (CP-S403) |
| `test_tenancy.py` | `resolve_tenant()` + `organizations.get_organization_by_slug()` SQL parametrization (CP-S403) |
| `test_organizations_api.py` | `GET /api/v1/organizations/{slug}` — active/pilot/unknown/suspended/cancelled, field allowlist |
| `test_camps_api.py` | Camp collection + detail endpoints, 404 cases, `registration_open` derivation |
| `test_camps_repository.py` | Camp SQL is parametrized and always scoped by `organization_id` |

Real, non-mocked verification (local Supabase stack, not part of the automated `pytest` run —
see the CP-S404 report for the full transcript) additionally confirmed cross-tenant isolation
end-to-end: two organizations with the same `camp_slug` never leak into each other's responses.
If a future ticket wants this as an automated integration test, it must run against the local
Supabase stack or an equally isolated test configuration — never KSV, and never without being
clearly labeled as an integration test.

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
URL slug → app.deps.get_tenant_context (FastAPI dependency) → app.tenancy.resolve_tenant
         → organizations repository → organizations.id → TenantContext → every tenant-scoped query
```

Since CP-S404, `app/deps.py::get_tenant_context` is the single FastAPI dependency every
tenant-scoped route uses to obtain a `TenantContext` — it's the only place an
`organization_slug` path parameter is allowed to touch tenant resolution, and it also translates
`TenantNotFoundError`/`TenantInactiveError` into the same 404 (see
[Unknown vs. inactive organizations](#unknown-vs-inactive-organizations--both-404) above). A
route never calls `resolve_tenant()` directly.

Every tenant-scoped repository function **must** take an already-resolved `TenantContext` (or its
`organization_id`) as an explicit parameter, and use it in a parametrized
`WHERE organization_id = %s` — this is not a hypothetical, it's exactly what
`app/repositories/camps.py` does today:

```python
# Correct — organization_id comes from a TenantContext resolved server-side
# (app/repositories/camps.py::list_published_camps, as actually implemented).
def list_published_camps(tenant: TenantContext) -> list[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            "SELECT ... FROM camps WHERE organization_id = %s AND status = 'published'",
            (tenant.organization_id,),
        )
        return cur.fetchall()
```

```python
# Wrong — never do this. A client could pass any organization_id it wants.
def list_published_camps(organization_id_from_request: str) -> list[dict]:
    ...
```

This holds **even though Row Level Security is enabled** on `organizations`/`camps`/
`camp_registrations` (see `docs/saas/database-schema.md` §8) — RLS currently has zero policies
and is not a substitute for application-level filtering. It becomes a genuine second layer only
once Supabase Auth and `organization_members` exist; until then, this service is the only thing
standing between one tenant's data and another's.

Verified concretely for CP-S404 (unit tests + a local-Supabase integration run, see the CP-S404
report): two organizations with a camp under the *same* `camp_slug` never leak into each other's
responses, an unpublished camp is invisible via both the list and detail endpoints, and a
suspended organization's endpoints all return the same 404 as a nonexistent one.

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
