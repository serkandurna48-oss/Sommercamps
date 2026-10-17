# CampsPilot SaaS — Database Schema v1 (CP-S402)

> Technical reference for `supabase/migrations/20260917133748_create_saas_schema_v1.sql`.
> Companion to [`architecture.md`](./architecture.md) (why) and
> [`migration-strategy.md`](./migration-strategy.md) (when). This document describes the
> **current, verified** schema state, not the eventual target — see "Expected extensions" below
> for what's deliberately deferred.
>
> Verified locally via the Supabase CLI (`supabase db start` / `db reset`, Postgres 17, local
> Docker stack) — no hosted/cloud Supabase project exists yet, no KSV or JK data anywhere near it.

---

## 1. Tables and relations

```
organizations (1) ──< (N) camps (1) ──< (N) camp_registrations
```

- **`organizations`** — one row per tenant.
- **`camps`** — one row per bookable offering, always owned by exactly one organization.
- **`camp_registrations`** — one row per child's registration for one camp.

Both `camps` and `camp_registrations` carry `organization_id` directly (not just reachable via
join) — this is the tenant-scoping column every query must filter on. See
[Tenant isolation](#3-tenant-isolation-on-camp_registrations) for why `camp_registrations` has
**both** `organization_id` and `camp_id` rather than relying on the join.

## 2. Columns

### `organizations`

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` | |
| `slug` | text | not null | — | globally unique, lowercase-hyphen format |
| `name` | text | not null | — | |
| `legal_name` | text | null | — | |
| `contact_email` | text | not null | — | format-checked |
| `contact_phone` | text | null | — | |
| `logo_url` | text | null | — | |
| `primary_color` | text | null | — | hex format-checked if present |
| `plan_status` | text | not null | `'pilot'` | see [status values](#4-status-values) |
| `created_at` | timestamptz | not null | `now()` | |
| `updated_at` | timestamptz | not null | `now()` | trigger-maintained, see below |

### `camps`

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` | |
| `organization_id` | uuid | not null | — | FK → `organizations.id`, `on delete restrict` |
| `slug` | text | not null | — | unique **per organization**, not global |
| `title` | text | not null | — | |
| `start_date` | date | not null | — | |
| `end_date` | date | not null | — | `end_date >= start_date` |
| `registration_start` | timestamptz | null | — | |
| `registration_end` | timestamptz | null | — | if both set, `end >= start` |
| `age_min` | integer | not null | — | `>= 0` |
| `age_max` | integer | not null | — | `>= age_min` |
| `capacity` | integer | not null | — | `> 0` |
| `price_cents` | integer | not null | — | `>= 0` |
| `currency` | text | not null | `'EUR'` | 3 uppercase letters (ISO-4217-shaped, not a lookup table) |
| `status` | text | not null | `'draft'` | see [status values](#4-status-values) |
| `created_at` | timestamptz | not null | `now()` | |
| `updated_at` | timestamptz | not null | `now()` | trigger-maintained |

### `camp_registrations`

| Column | Type | Null? | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | PK | `gen_random_uuid()` | |
| `organization_id` | uuid | not null | — | denormalized, enforced via composite FK (§3) |
| `camp_id` | uuid | not null | — | enforced via composite FK (§3) |
| `registration_token` | uuid | not null | `gen_random_uuid()` | globally unique, public identifier |
| `status` | text | not null | `'registered'` | see [status values](#4-status-values) |
| `payment_status` | text | not null | `'open'` | see [status values](#4-status-values) |
| `parent_first_name` | text | not null | — | |
| `parent_last_name` | text | not null | — | |
| `parent_email` | text | not null | — | format-checked |
| `parent_phone` | text | not null | — | |
| `child_first_name` | text | not null | — | |
| `child_last_name` | text | not null | — | |
| `child_birth_date` | date | not null | — | plausibility-checked only, see below |
| `emergency_contact_name` | text | **null** | — | new field, no legacy precedent — open decision, see §5 |
| `emergency_contact_phone` | text | **null** | — | same |
| `medical_notes` | text | null | — | |
| `allergies` | text | null | — | DSGVO Art. 9 |
| `photo_permission` | boolean | not null | `false` | opt-in |
| `terms_accepted` | boolean | not null | — | must be `true` (checked), no default |
| `privacy_accepted` | boolean | not null | — | must be `true` (checked), no default |
| `stripe_session_id` | text | null | — | unique when present |
| `stripe_payment_intent_id` | text | null | — | unique when present |
| `paid_at` | timestamptz | null | — | |
| `email_sent_at` | timestamptz | null | — | |
| `created_at` | timestamptz | not null | `now()` | |
| `updated_at` | timestamptz | not null | `now()` | trigger-maintained |

**`child_birth_date` is only checked for structural plausibility** (not in the future, not more
than 100 years ago) at the DB level — not against the specific camp's `age_min`/`age_max`. That
comparison needs the actual referenced camp and stays an application-layer concern in
`backend_saas/` (not built yet), mirroring how the legacy system already deliberately separates
"DB plausibility guard" from "real age-vs-camp-week business rule" (see
`backend/camp_config.py::validate_age_at_camp_start`).

## 3. Tenant isolation on `camp_registrations`

`organization_id` is **denormalized** onto `camp_registrations` even though it's derivable via
`camp_id → camps.organization_id`. The safety guarantee comes from one constraint:

```sql
constraint camp_registrations_camp_org_fk
    foreign key (camp_id, organization_id)
    references public.camps (id, organization_id)
    on delete restrict
```

This is a **composite foreign key**, supported by a matching composite unique constraint on the
parent side (`camps_id_organization_id_key unique (id, organization_id)`). It requires every
`camp_registrations` row's `(camp_id, organization_id)` pair to match an *actual* `(id,
organization_id)` row in `camps` — i.e. `camp_id` must genuinely belong to the claimed
`organization_id`. A row claiming camp A (owned by org 1) under org 2 has no matching `(A, 2)`
row in `camps` (camp A's real row is `(A, 1)`), so the insert is rejected with a
`foreign_key_violation` before it ever reaches the table. This is enforced purely relationally —
no trigger, no application-code dependency. Verified directly (see §6).

No separate single-column FK from `camp_registrations.organization_id` to `organizations.id` was
added: it would be redundant, since the composite FK already forces `organization_id` to equal a
value that `camps.organization_id` itself already validates against `organizations.id`.

This is **one layer**, not the whole isolation story — see [architecture.md §3](./architecture.md#3-shared-schema-ansatz):
application-level `WHERE organization_id = :organization_id` filtering in every backend query
remains mandatory regardless of this constraint.

## 4. Status values

| Table.Column | Allowed values | Enforced via |
|---|---|---|
| `organizations.plan_status` | `pilot`, `active`, `suspended`, `cancelled` | CHECK |
| `camps.status` | `draft`, `published`, `closed`, `archived` | CHECK |
| `camp_registrations.status` | `registered`, `confirmed`, `cancelled`, `waitlist` | CHECK |
| `camp_registrations.payment_status` | `open`, `paid`, `refunded`, `waived`, `cancelled` | CHECK |

`registration.status`/`payment_status` values are carried over unchanged from
`backend/schema.sql` — they're generic, not KSV-specific. Modeled as `text` + `CHECK`, not a
native Postgres `enum` type, for consistency with the legacy convention (`ALTER TYPE ... ADD
VALUE` is more awkward than dropping/recreating a CHECK constraint when values change — see
`backend/migration_jersey_sizes.sql` for legacy precedent of doing exactly that).

## 5. Deliberate deviations from `backend/schema.sql`

The legacy KSV table was the starting point (per CP-S402 scope), but nothing was copied
uncritically. Full mapping already lives in
[architecture.md §4.3](./architecture.md#43-camp_registrations); the deltas that matter most:

| Legacy field | v1 SaaS decision | Why |
|---|---|---|
| `jersey_size` | **Dropped from core schema entirely.** | Football/KSV-specific product option, not a generic SaaS concept. Explicit ticket requirement, not carried into a `custom_fields` catch-all either (that's out of scope, see §7). Stays legacy-only. |
| `selected_camp_week` (free text) | **Replaced** by `camp_id` FK | Was validated against a hardcoded app-level list; now a real row with its own dates/price/capacity. |
| `parent_name` (single field) | **Split** into `parent_first_name` / `parent_last_name` | Matches the existing `child_first_name`/`child_last_name` pattern; more structured for future use. |
| `phone` | **Renamed** `parent_phone` | Paired naming with the new `parent_*` fields. |
| `consent_privacy` (single boolean) | **Split** into `terms_accepted` + `privacy_accepted` | Each consent independently auditable instead of conflated into one flag. |
| `notes` (generic free text) | **Dropped.** | Not in the ticket's field list; the closest legitimate need (health-relevant free text) is already covered by `medical_notes`. Reintroducing a generic catch-all free-text field now would just be an early, undocumented step toward `custom_fields`, which is explicitly out of scope for this ticket. If a tenant needs generic notes later, that's a deliberate future decision. |
| `paid_at`, `email_sent_at` | **Kept**, unchanged meaning | Not in the ticket's explicit field list, but still generically useful (payment audit trail, mail-idempotency guard) and not KSV-specific — evaluated and kept per the ticket's "nur fachlich sinnvolle Felder" instruction rather than dropped just because the list didn't spell them out. |
| — | **New:** `emergency_contact_name`, `emergency_contact_phone` | No legacy precedent at all. Added nullable (not required at DB level) — see open decision below. |
| — | **New:** `stripe_payment_intent_id` | Legacy only ever stored `stripe_session_id`. Added alongside it with the same partial-unique-when-present pattern, since Stripe webhook events can key off either depending on event type, and idempotent handling needs both to be unique. Not explicitly requested by the ticket's index list, but low-cost and directly parallel to an existing, already-justified pattern. |

**Open decision (not resolved in this ticket):** should `emergency_contact_name` /
`emergency_contact_phone` be `NOT NULL`? Left nullable for v1 since the ticket didn't mark them
either way and it's a product call (how strict should intake be?), not a technical one.

## 6. Indexes

| Index | Columns | Purpose |
|---|---|---|
| `organizations_slug_key` | `organizations(slug)` | uniqueness (auto-created by the UNIQUE constraint) |
| `camps_organization_id_slug_key` | `camps(organization_id, slug)` | uniqueness per org |
| `camps_id_organization_id_key` | `camps(id, organization_id)` | supports the composite FK from `camp_registrations` |
| `camps_organization_id_status_idx` | `camps(organization_id, status)` | tenant-scoped status filtering (e.g. "published camps for org X") |
| `camp_registrations_registration_token_key` | `camp_registrations(registration_token)` | uniqueness (auto-created) |
| `camp_registrations_stripe_session_id_key` | `camp_registrations(stripe_session_id)` partial, `where not null` | uniqueness + webhook lookup |
| `camp_registrations_stripe_payment_intent_id_key` | `camp_registrations(stripe_payment_intent_id)` partial, `where not null` | uniqueness + webhook lookup |
| `camp_registrations_camp_id_organization_id_idx` | `camp_registrations(camp_id, organization_id)` | covers the composite FK (column order matches the FK exactly — required by Supabase's `unindexed_foreign_keys` advisor) **and** plain `camp_id`-only lookups via left-prefix |
| `camp_registrations_organization_id_camp_id_idx` | `camp_registrations(organization_id, camp_id)` | tenant-scoped registration listing/lookup |
| `camp_registrations_parent_email_idx` | `camp_registrations(parent_email)` | admin search / duplicate detection, mirrors legacy `idx_camp_reg_email` |

**Deliberately not indexed** (to avoid redundant indexes, not an oversight):

- `camps.organization_id` alone — covered by `camps_organization_id_status_idx`'s left prefix.
- `camp_registrations.organization_id` alone — covered by
  `camp_registrations_organization_id_camp_id_idx`'s left prefix.
- A single-column `camp_registrations.camp_id` index — would be redundant once
  `camp_registrations_camp_id_organization_id_idx` exists (also a left-prefix match).

## 7. `updated_at`

A single trigger function, `public.set_updated_at()`, attached to all three tables
(`before update ... for each row`). Chosen over application-code updates per explicit
preference. Security-reviewed:

- **No `SECURITY DEFINER`** — runs with the invoking role's privileges (the default), since it
  only ever writes to the row already being modified by the calling statement. No elevated
  access is needed or granted.
- **`search_path = ''`** — pins name resolution so it can't be hijacked by a schema earlier in a
  caller's search_path. `now()` still resolves correctly because Postgres always implicitly
  searches `pg_catalog` regardless of `search_path`.

## 8. Row Level Security

RLS is **enabled on all three tables** (`alter table ... enable row level security`), with
**zero policies** defined. Effect, given Postgres/Supabase's default role behavior:

- `anon` and `authenticated` do not bypass RLS → with no policies, they get **zero rows** on
  `SELECT` and a `row-level security policy` rejection on `INSERT`/`UPDATE`/`DELETE`. No
  extra configuration needed for this — it's the default when RLS is on and no policy exists.
- `service_role` bypasses RLS entirely (Postgres `BYPASSRLS` role attribute, not table
  ownership) → keeps full access, exactly matching how `backend/` already talks to the legacy
  Supabase project today via the service-role key.

**Application-level `organization_id` filtering remains mandatory** in every `backend_saas/`
query — RLS here is not a substitute for it. RLS becomes a meaningful *second* layer only once
Supabase Auth and `organization_members` exist and real per-tenant policies can be written
against a JWT claim; building those policies now would mean either leaving tables wide open to
guess at future requirements, or writing throwaway policies "just to make something pass" —
both explicitly out of scope for this ticket.

This state (RLS on, no policies) was verified directly, both by query (§9) and by
`supabase db advisors --local`, which flags it as `rls_enabled_no_policy` (INFO) on all three
tables — expected and intentional, not a gap; see §9.

## 9. Verification performed

Run against the local Supabase Postgres stack (`supabase db start`, Postgres 17, Docker), via
`docker exec ... psql` (the CLI's own `db query --file` doesn't support multi-statement/DO-block
scripts — see open decision in the PR summary). Every test below passed; see the ticket report
for full output.

- **Organizations:** valid insert succeeds; duplicate `slug` rejected (`unique_violation`).
- **Camps:** valid insert succeeds; duplicate `(organization_id, slug)` rejected; the *same*
  slug under a *different* organization succeeds (confirms per-org, not global, uniqueness);
  invalid date range, `age_max < age_min`, negative `capacity`, negative `price_cents` all
  rejected (`check_violation`).
- **Registrations:** valid insert succeeds; a non-existent `camp_id` rejected
  (`foreign_key_violation`); a cross-tenant `(camp_id, organization_id)` combination rejected
  (`foreign_key_violation` — the composite FK from §3); duplicate `registration_token` rejected
  (`unique_violation`).
- **RLS:** `anon` sees 0 rows on all three tables and is rejected on insert
  (`insufficient_privilege` / RLS policy violation); `authenticated` sees 0 rows; `service_role`
  sees the seeded row (bypass confirmed).
- **Linter/Advisors:** `supabase db lint --local` — no schema errors.
  `supabase db advisors --local --type all` — one `unindexed_foreign_keys` finding was fixed
  (see §6); remaining findings are `unused_index` (expected — no real query traffic exists yet
  on a schema-only local DB) and `rls_enabled_no_policy` (expected — §8). None ignored without
  reason; see the ticket report for the full documented rationale per finding.

All test/verification SQL lived outside the repo (session scratchpad, not committed) and ran
inside rolled-back transactions — the only persisted data after every run is `seed.sql`'s
`demo-fc` organization and `summer-week-1` camp, with zero registrations.

## 10. Expected future extensions (not built in CP-S402)

- **`users` / `organization_members`** — real accounts + per-organization roles (`org_admin`,
  `staff`). Needed before any real per-tenant RLS policy can be written.
- **Auth-backed RLS** — actual `organization_id`-scoped policies once Supabase Auth issues JWTs
  with an `organization_id`/role claim. Today's "RLS on, no policies" state is the deliberate
  placeholder for this.
- **Optional custom fields** — if a second tenant needs tenant-specific registration fields
  (the way `jersey_size` was KSV-specific), a generic mechanism (e.g. a `custom_fields jsonb`
  column) is a candidate — not designed here, only decide when actually needed (see
  architecture.md's open decisions).
- **Billing** — `plan_status` is a plain controlled string for now. No Stripe Billing or Stripe
  Connect fields exist on `organizations` yet (e.g. `stripe_account_id` for Connect payouts).
