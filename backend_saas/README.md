# CampsPilot SaaS API (`backend_saas/`)

FastAPI backend for the new, parallel CampsPilot multi-tenant SaaS — built independently of
`backend/`, which is and remains the KSV Baunatal legacy system. See
[`docs/saas/architecture.md`](../docs/saas/architecture.md) for the full architecture, and
[`docs/saas/database-schema.md`](../docs/saas/database-schema.md) for the database this service
talks to.

## Scope (CP-S403 + CP-S404 + CP-S405 + CP-S406)

This is a foundation with a first real (if narrow) product slice on top, not a finished product.
What exists:

- App boots, connects to Postgres, exposes `GET /health` (CP-S403).
- A tenant-resolution layer (`app/tenancy.py` + `app/repositories/organizations.py`) that turns
  a URL slug into a trusted `organization_id` (CP-S403), wired into every route via
  `app/deps.py::get_tenant_context` (CP-S404).
- Read-only, tenant-scoped public endpoints for organizations and published camps (CP-S404).
- The first **write** endpoint: parents can register a child for a published camp without an
  account (CP-S405) — with server-side age/window/capacity enforcement.
- A complete registration status lifecycle (CP-S406): a full camp waitlists instead of
  rejecting, cancelling a registered/confirmed spot automatically promotes the next waitlisted
  registration (FIFO), and every status change is validated against a small, central set of
  allowed transitions. See [Public API](#public-api) and
  [Registration lifecycle](#registration-lifecycle) below.

What does **not** exist yet (deliberately out of scope): Organizations/Camps **admin** CRUD (no
POST/PATCH/DELETE for organizations or camps), any HTTP endpoint for cancellation or promotion
(both exist only as internal repository functions — see
[Registration lifecycle](#registration-lifecycle)), a waitlist position/number API, waitlist
email, Stripe/payments, Brevo/email (no confirmation mail is sent at all), a confirmation page,
JK onboarding, KSV migration, Supabase Auth, `organization_members`, admin login, a frontend, or
any deployment config (Render/Vercel). Don't build against this expecting any of that to exist.

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
| `POST` | `/api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations` | `RegistrationCreated` (201), see [Registration write-flow](#registration-write-flow) |

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

## Registration write-flow

`POST /api/v1/organizations/{organization_slug}/camps/{camp_slug}/registrations` — the first
endpoint in this service that writes anything, and the first that handles a real child's
personal data. No account, login, or auth of any kind is required (matches the legacy KSV
system's model: parents don't need an account to register).

**Request** (`RegistrationCreate`) — no `organization_id`, no `camp_id`, no `id` of any kind:

```json
{
  "parent_first_name": "Max",
  "parent_last_name": "Mustermann",
  "parent_email": "max@example.com",
  "parent_phone": "+49 123 456789",
  "child_first_name": "Lena",
  "child_last_name": "Mustermann",
  "child_birth_date": "2017-05-10",
  "emergency_contact_name": "Anna Mustermann",
  "emergency_contact_phone": "+49 987 654321",
  "medical_notes": null,
  "allergies": null,
  "photo_permission": false,
  "terms_accepted": true,
  "privacy_accepted": true
}
```

`model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")`: every string field is
trimmed, and any unexpected field (e.g. someone trying to pass `organization_id` or `camp_id`
directly) makes the whole request fail with 422 — a visible rejection rather than a silent
no-op, which is a stronger guarantee than the Pydantic default of silently ignoring unknown
fields. `terms_accepted`/`privacy_accepted` must both be `true` (checked by a Pydantic validator
*and* the DB's `chk_camp_registrations_terms_accepted`/`..._privacy_accepted` — same
defense-in-depth pattern as everywhere else in this schema). `photo_permission` may be `true` or
`false`. `parent_email` is validated as a real email address (`EmailStr`).

**Response** (`RegistrationCreated`, `201`) — only what a confirmation page or future payment
flow needs, nothing internal:

```json
{
  "registration_token": "f2956f69-4bdd-4f41-8341-579542b7464c",
  "status": "registered",
  "payment_status": "open"
}
```

`registration_token` is generated by the database (`gen_random_uuid()` default on
`camp_registrations.registration_token`) — never accepted from the client, never derivable from
anything the client sent.

### Server-side resolution (the whole point of this ticket)

```
organization_slug ──▶ get_tenant_context (same dependency as the read API) ──▶ TenantContext
camp_slug + TenantContext.organization_id ──▶ get_registration_target ──▶ RegistrationTarget (has camp.id)
```

`app/repositories/registrations.py::get_registration_target` is the write-flow's own internal
camp lookup — a sibling to (not a replacement for) `app/repositories/camps.py`'s public one. It
uses the *same* `WHERE organization_id = %s AND slug = %s AND status = 'published'` shape, so an
unknown `camp_slug`, a draft/closed/archived camp, and a camp belonging to a different tenant are
all indistinguishable `None` results here too — all surface as the same 404 the read API already
uses. The only reason this second function exists at all is that it additionally returns `id`
(needed to write a `camp_registrations` row), which the public `CampPublic`-facing repository
deliberately never does.

Both `tenant.organization_id` and `camp.id` — the two values written into every new
`camp_registrations` row — come exclusively from these two server-side lookups. `RegistrationCreate`
has no field that could override either, even in principle. The database's composite FK
(`camp_registrations_camp_org_fk`, see `docs/saas/database-schema.md` §3) is the second,
independent layer underneath this.

### Age check

Validated against the **camp's `start_date`**, not today's date — a child registering months
before a camp starts must be age-eligible *when the camp happens*, matching the legacy system's
`backend/camp_config.py::validate_age_at_camp_start` intent (though against this specific camp's
`age_min`/`age_max`, not a global constant). `app/utils.py::age_on_date` mirrors legacy's
`dateutil.relativedelta`-based leap-year handling exactly (a child born Feb 29 turns a year older
on Feb 28 in non-leap years). The check is inclusive on both ends: `age_min <= age_at_start <=
age_max`. A violation is a **422** (see [HTTP status choice](#http-status-choice-for-age-and-window-violations) below).

### Registration window

Reuses `app/utils.py::is_registration_open` — the exact same function `CampPublic.registration_open`
uses on the read side, so the two can never silently drift apart. A closed window is a **422**.

### Capacity — and why a plain COUNT-then-INSERT isn't safe

`app/repositories/registrations.py::create_registration` runs entirely inside **one transaction**
(one borrowed connection):

1. `SELECT capacity FROM camps WHERE id = %s FOR UPDATE` — locks this camp's row. A second,
   concurrent request for the *same* camp blocks on this exact statement until the first
   transaction commits or rolls back. Requests for a *different* camp are completely unaffected
   — this is a plain row-level lock, not a distributed or advisory lock.
2. Count `registered`/`confirmed` registrations for this camp (`CAPACITY_COUNTING_STATUSES`, see
   [Registration lifecycle](#registration-lifecycle) — **not** `status <> 'cancelled'`, which
   since CP-S406 would wrongly count waitlisted rows against capacity too), inside the same
   transaction/lock.
3. `INSERT ... RETURNING registration_token, status, payment_status` with
   `status='registered'` if capacity remains, else `status='waitlist'`. Either way this always
   succeeds — see [Registration lifecycle](#registration-lifecycle) for why a full camp is no
   longer a rejection.

Without step 1's lock, two concurrent requests could both read "1 spot left," both decide to
insert as `registered`, and both succeed — overbooking by one. With it, the second transaction's
`FOR UPDATE` literally waits for the first to finish before it's even allowed to count, so it
correctly falls back to `waitlist`. Verified under real concurrent load (see the CP-S405 and
CP-S406 reports): 8 simultaneous requests against a capacity-1, zero-registration camp produced
exactly one `registered` and seven `waitlist`, with exactly one capacity-counting row in the
database afterward.

### HTTP status choice for age and window violations

An age-ineligible child and a closed registration window both return **422 Unprocessable
Content** — the request is syntactically valid JSON matching the schema, but fails a business
rule given the *current state of the referenced camp*. This is deliberately the same status
Pydantic itself uses for schema-validation failures (missing/malformed fields), giving API
consumers one consistent "this request can't be processed as given" signal. There is no longer a
409 anywhere in the public registration flow (see
[Registration lifecycle](#registration-lifecycle) — a full camp waitlists instead of being
rejected, since CP-S406).

### Duplicate registrations — deliberately not restricted

There is **no** `parent_email UNIQUE` constraint or equivalent duplicate check. A family can
register multiple children, or the same child for multiple camps, without restriction. Whether
some form of duplicate detection is ever wanted is an open **product** decision for a later
ticket — CP-S405 does not pre-empt it with a technical constraint that would be hard to relax
later.

### PII and logging

This is the first endpoint handling real personal data about a child. The rule, enforced
throughout `app/routers/registrations.py` and everything it calls:

- **Never logged, anywhere:** the request body, any name, email address, phone number,
  `medical_notes`, or `allergies`.
- **Safe to log:** `organization_slug`, `camp_slug`, the event type (rejected-for-X /
  created), and the technical exception class. Every log line in the registration flow follows
  this shape — see `create_registration`'s `logger.info(...)` calls for the pattern.
- A raw `psycopg2`/PostgreSQL exception is never returned to the client (a catch-all maps any
  unexpected DB error to a generic 500); it's logged server-side via `logger.exception(...)`
  instead, which includes the exception's own message/traceback but never the request payload
  that triggered it.

## Registration lifecycle

Everything below is CP-S406. **None of it has an HTTP endpoint yet** — promotion and
cancellation exist only as internal repository functions in
`app/repositories/registrations.py`, ready for a future admin ticket to expose. No DB schema
change was needed: `camp_registrations.status`'s four values (`registered`, `confirmed`,
`waitlist`, `cancelled`) already existed since CP-S402.

### Status model — the single source of truth

`app/registration_lifecycle.py` is the **only** place either of the two rules below is allowed
to be defined. Nothing else in the codebase hardcodes a capacity-counting status list or a
transition rule — `create_registration`, `promote_next_waitlisted_registration`, and
`cancel_registration_and_promote_next` all import from it.

| Status | Counts against capacity? | Meaning |
|---|---|---|
| `registered` | **yes** | A reserved spot. |
| `confirmed` | **yes** | A confirmed spot (e.g. after payment, in a later ticket — not reachable via any code path yet). |
| `waitlist` | no | No spot reserved; waiting for one to free up. |
| `cancelled` | no | No active participation. Terminal — see transitions below. |

```python
CAPACITY_COUNTING_STATUSES = frozenset({"registered", "confirmed"})
```

Every capacity query in `app/repositories/registrations.py` filters `status = any(%s)` against
this exact set (via a parametrized Postgres array, not a hand-written `IN (...)` string) — this
replaced the pre-CP-S406 `status <> 'cancelled'`, which would have wrongly counted `waitlist`
rows against capacity once that status started being used.

### Allowed status transitions

```python
ALLOWED_TRANSITIONS = {
    "registered": {"confirmed", "cancelled"},
    "confirmed":  {"cancelled"},
    "waitlist":   {"registered", "cancelled"},
    "cancelled":  set(),  # terminal
}
```

`app/registration_lifecycle.py::validate_transition(current_status, new_status)` raises
`InvalidStatusTransitionError` for anything not listed above — including a status "transitioning"
to itself (e.g. `cancelled -> cancelled`), which is deliberately **not** treated as a harmless
no-op. This is what makes `cancel_registration_and_promote_next` reject a second cancellation of
an already-cancelled registration instead of silently succeeding (and potentially triggering a
second, incorrect promotion).

### Public registration: waitlist instead of 409

Since CP-S406, `POST .../registrations` on a full camp no longer returns 409 — it creates the
registration with `status='waitlist'`, still `201 Created`:

```json
{
  "registration_token": "...",
  "status": "waitlist",
  "payment_status": "open"
}
```

`payment_status` stays `open` for a waitlisted registration, same as a registered one — **no
payment flow exists yet at all** (CP-S405/406 scope). This is flagged explicitly for whoever
builds Stripe/payment next: **a future checkout must not be enabled for a `waitlist` registration
until it has been promoted to `registered`** — paying for a spot that doesn't exist yet would be
a real, user-facing bug, not just a modeling inconsistency. No DB change was needed to say this;
it's an application-layer rule the payment ticket must implement.

No waitlist position/number is returned or computed (`ORDER BY created_at ASC, id ASC` — see
below — determines order internally, but that ordering is not exposed to the client), and no
waitlist email is sent — both explicitly out of scope.

### FIFO waitlist promotion

`app/repositories/registrations.py::promote_next_waitlisted_registration(tenant, camp_id)` —
standalone, callable on its own (opens its own transaction). Algorithm, all inside one
transaction:

1. `SELECT capacity FROM camps WHERE id = %s FOR UPDATE` — the same camp lock
   `create_registration` uses. This is the single synchronization point every capacity-affecting
   function in this module shares.
2. Count `CAPACITY_COUNTING_STATUSES` registrations for this camp. If capacity is already full,
   return `None` — nothing to do.
3. `SELECT id FROM camp_registrations WHERE camp_id = %s AND organization_id = %s AND
   status = 'waitlist' ORDER BY created_at ASC, id ASC LIMIT 1` — the oldest waitlisted entry,
   strictly scoped to **both** `camp_id` and `organization_id` (redundant with the fact that a
   `camp_id` only ever belongs to one organization, but explicit on purpose — see
   [Registration lookup](#registration-lookup-uuid-is-an-identifier-not-an-authorization) below).
   Returns `None` if there's no waitlist.
4. Promote it to `registered`, return its public fields.

Verified under real concurrent load (CP-S406 report): 6 simultaneous promotion attempts against
a camp with exactly one free spot and 7 waitlisted entries produced exactly one promotion — the
camp lock serializes all of them, so only the first to acquire it sees (and takes) the free spot;
the rest re-count after acquiring the lock and correctly find it already taken.

### Cancellation + promotion

`app/repositories/registrations.py::cancel_registration_and_promote_next(tenant, registration_id)`
— also standalone, also internal-only. One transaction:

1. `SELECT id, camp_id, status FROM camp_registrations WHERE id = %s AND organization_id = %s
   FOR UPDATE` — loads **and locks** the registration, strictly tenant-scoped. Never a bare
   `id`-only lookup: a UUID is an identifier, not an authorization (see
   [Registration lookup](#registration-lookup-uuid-is-an-identifier-not-an-authorization)).
2. `validate_transition(current_status, "cancelled")` — raises `InvalidStatusTransitionError` if
   not allowed (including "already cancelled").
3. Update the registration to `cancelled`.
4. **Only if** the registration was previously `registered` or `confirmed` (i.e. it actually
   freed a capacity-counting spot): call the same locked promotion algorithm as
   `promote_next_waitlisted_registration`, within this same transaction. A registration that was
   already `waitlist` frees nothing, so nothing is promoted.

Returns `{"cancelled": {...}, "promoted": {...} | None}`.

**Why the registration row is locked first, then the camp row (and why that ordering is safe):**
every *other* capacity-affecting function here only ever locks the camp row — none of them lock
a specific registration row and then request the camp lock. That asymmetry means a lock-ordering
deadlock (two transactions each holding a lock the other wants) can't occur: nothing here ever
holds a registration lock while waiting on a camp lock that some *other* transaction is holding
while waiting on that same registration lock. Two concurrent cancellations of *different*
registrations on the same camp just queue on the camp lock after each securing its own
(non-conflicting) registration lock — serialization, not deadlock.

The registration lock also closes a correctness gap, not just a deadlock one: without it, two
concurrent cancel attempts on the *same* registration could both read `status='registered'`
before either commits (plain reads don't block under Postgres's default read-committed
isolation), and both would incorrectly trigger a promotion. With the lock, the second
transaction's read blocks until the first commits, then sees the now-`cancelled` status and
raises `InvalidStatusTransitionError` — cleanly rejected, no double promotion.

Verified end-to-end against the local Supabase stack (CP-S406 report): a capacity-2 camp with 4
registrations (2 `registered`, 2 `waitlist`) — cancelling registration 1 promotes registration 3
(oldest waitlisted); cancelling registration 2 promotes registration 4. Active
(`registered`+`confirmed`) count never exceeded 2 at any point. A cross-tenant promotion attempt
(tenant A's context, tenant B's real `camp_id`) safely returned `None` and left tenant B's data
untouched.

### Registration lookup (UUID is an identifier, not an authorization)

Every *mutating* registration operation is tenant-scoped (`WHERE ... AND organization_id = %s`),
never a bare `WHERE id = %s`. This is the same principle applied throughout this service since
CP-S403 (`TenantContext`, `get_tenant_context`) — a UUID being hard to guess doesn't make it a
substitute for checking it belongs to the caller's tenant. `cancel_registration_and_promote_next`
takes a `tenant: TenantContext` and a `registration_id: UUID`, in that order, specifically so
this can never be forgotten.

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
| `test_utils.py` | `age_on_date` (incl. Feb-29 leap-year edge cases) and `is_registration_open` in isolation |
| `test_registration_lifecycle.py` | Every allowed and disallowed status transition (incl. `cancelled -> cancelled`), `CAPACITY_COUNTING_STATUSES` content |
| `test_registrations_repository.py` | `get_registration_target` scoping, window/age validators, `create_registration`'s `FOR UPDATE` lock + capacity-status-scoped count SQL (registered/waitlist outcomes), `promote_next_waitlisted_registration`'s lock/count/FIFO-select/update sequence, `cancel_registration_and_promote_next`'s tenant-scoped load-and-lock + conditional promotion, tenant/camp values never taken from request data |
| `test_registrations_api.py` | Full registration endpoint: happy path (`registered` and `waitlist`, both 201), tenant/camp 404s, window, age boundaries, consent, `extra="forbid"` rejecting injected `organization_id`/`camp_id` |

Real, non-mocked verification against the local Supabase stack (not part of the automated
`pytest` run — see the CP-S404/CP-S405/CP-S406 reports for the full transcripts) additionally
confirmed: cross-tenant isolation end-to-end (two organizations with the same `camp_slug` never
leak into each other's responses, verified at both the HTTP and raw-DB level); the exact 4
registration / 2 cancellation sequence from the CP-S406 ticket (2 `registered`, 2 `waitlist` →
cancel #1 promotes #3 → cancel #2 promotes #4, active count never exceeding capacity); a
cross-tenant promotion attempt safely returning `None` without touching the other tenant's data;
and two concurrency guarantees under real load — 8 simultaneous registration requests against a
capacity-1 camp produced exactly one `registered`, and 6 simultaneous promotion attempts against
a camp with exactly one free spot produced exactly one promotion. If a future ticket wants any of
this as an automated integration test, it must run against the local Supabase stack or an
equally isolated test configuration — never KSV, and never without being clearly labeled as an
integration test.

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
