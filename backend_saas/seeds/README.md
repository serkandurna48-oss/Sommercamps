# Cloud-staging tenant seeds — not migrations

**New tenants should use `scripts/onboard_tenant.py` against the admin API
(`POST /admin/organizations`, `POST /admin/organizations/{slug}/camps`) going
forward** — see `backend_saas/README.md` "Admin / Onboarding". Copy
`campspilot-pilot.json` as a starting template, fill in the new tenant's
data, then run:

```
python scripts/onboard_tenant.py --config seeds/<new-tenant>.json --api-url <backend_saas URL>
```

No manual SQL required anymore. The `.sql` files below are kept as a
historical record (they document real decisions already made about the
KSV/JK field mappings) but are **superseded** as the onboarding path.

---

Manual, one-off `insert` scripts for specific organizations/camps in the Cloud `CampsPilot SaaS`
Supabase project (ref `wkmckfbzhmihyfwiekct`). Run by pasting into the Supabase Dashboard →
SQL Editor, or via `psql "$DATABASE_URL" -f backend_saas/seeds/<file>.sql` once a connection
string is available. All idempotent (`on conflict ... do nothing`), safe to re-run.

**Deliberately not in `supabase/migrations/`:** that directory is schema, applied via the
Supabase CLI to every environment including local dev — a tenant seed there would create
`campspilot-pilot`/`ksv-baunatal`/`jk-performance-academy` rows in every developer's local
database. **Deliberately not in `supabase/seed.sql`** either: that file is local-dev-only
seed data, per its own header, and never runs against Cloud.

| File | Tenant | Status |
|---|---|---|
| [`campspilot-pilot.sql`](campspilot-pilot.sql) | Synthetic staging tenant (CP-S408) | Verified against Cloud (see `backend_saas/README.md` § Staging E2E Pilot) |
| [`ksv-baunatal.sql`](ksv-baunatal.sql) | KSV Baunatal, real customer (CP-S410) | Not yet run against Cloud — see file header for sourcing + flagged gaps |
| [`jk-performance-academy.sql`](jk-performance-academy.sql) | JK Performance Academy, real customer (CP-S410) | Not yet run against Cloud — see file header for sourcing + flagged gaps |

See `backend_saas/README.md` for the smoke-test procedures that go with each seed.
