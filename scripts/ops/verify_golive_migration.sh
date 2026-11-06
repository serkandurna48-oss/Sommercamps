#!/bin/bash
# Verifies supabase/golive/PROD-MIGRATION-2026-11.sql on throwaway local DBs (127.0.0.1:55443).
# Usage: bash scripts/ops/verify_golive_migration.sh "$PWD"   (local throwaway Postgres only, never a cloud DB)
# 1) scratch_golive_prod: bootstrap like scripts/dev/local.py (+ anon role), the 16 prod migrations
#    from origin/feat/platform-foundation, synthetic prod-like rows, then the combined file twice.
# 2) scratch_golive_full: same bootstrap, all migrations of origin/demo/jan one by one.
# 3) schema diff between both (pg_dump --schema-only).
set -euo pipefail
REPO=$1
PG="psql -h 127.0.0.1 -p 55443 -U postgres -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=terse"
OUT=${OUT:-$(mktemp -d)}
mkdir -p "$OUT"

bootstrap() {
  $PG -d postgres -c "drop database if exists $1 with (force)" -c "create database $1"
  $PG -d "$1" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
SQL
}

apply_ref() {  # db ref
  for f in $(git -C "$REPO" ls-tree --name-only "$2" supabase/migrations/ | grep '\.sql$' | sort); do
    git -C "$REPO" show "$2:$f" | $PG -d "$1" -f - >/dev/null
  done
}

echo "== 1) prod state"
bootstrap scratch_golive_prod
apply_ref scratch_golive_prod origin/feat/platform-foundation
echo "prod migrations: $(git -C "$REPO" ls-tree --name-only origin/feat/platform-foundation supabase/migrations/ | grep -c '\.sql$')"
$PG -d scratch_golive_prod <<'SQL'
insert into organizations (slug, name, contact_email, site_published)
values ('ksv-sim', 'KSV Simulation', 'verein@example.com', true), ('leer-sim', 'Leer', 'leer@example.com', false);
insert into camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, price_cents, status)
select id, 'sommer', 'Sommercamp', date '2027-07-01', date '2027-07-05', 6, 12, 30, 14900, 'published'
from organizations where slug = 'ksv-sim';
insert into camp_registrations (organization_id, camp_id, status, payment_status, parent_first_name, parent_last_name,
  parent_email, parent_phone, child_first_name, child_last_name, child_birth_date, terms_accepted, privacy_accepted, created_at, updated_at)
select c.organization_id, c.id, s, p, 'Eltern', 'Test', 'eltern@example.com', '0123', fn, 'Testkind', make_date(2017, 3, n), true, true,
       timestamptz '2026-10-01 10:00+02', timestamptz '2026-10-02 10:00+02'
from camps c, (values ('registered','open','Anna',1), ('registered','paid','Ben',2), ('cancelled','cancelled','Gelöscht',3), ('registered','open','Anna',1)) v(s,p,fn,n)
where c.slug = 'sommer';
update camp_registrations set child_last_name = 'Gelöscht' where child_first_name = 'Gelöscht';
SQL
$PG -d scratch_golive_prod -At -f "$REPO/supabase/golive/PROD-PRECHECK-2026-11.sql" | tr "\n" " "; echo
$PG -d scratch_golive_prod -f "$REPO/supabase/golive/PROD-MIGRATION-2026-11.sql" > "$OUT/run1.txt"
echo "run 1 ok: $(tail -3 "$OUT/run1.txt" | head -1)"
$PG -d scratch_golive_prod -At > "$OUT/state1.txt" <<'SQL'
select 'fee_rules', o.slug, r.plan, r.percent, r.valid_from from organization_fee_rules r join organizations o on o.id = r.organization_id order by o.slug;
select 'reg', child_first_name, booked_price_cents, (player_id is not null), (anonymized_at is not null), child_birth_date, updated_at from camp_registrations order by child_first_name, id;
select 'players', count(*) from players;
select 'modules', slug, modules from organizations order by slug;
SQL
cat "$OUT/state1.txt"
$PG -d scratch_golive_prod -f "$REPO/supabase/golive/PROD-MIGRATION-2026-11.sql" > "$OUT/run2.txt"
$PG -d scratch_golive_prod -At > "$OUT/state2.txt" <<'SQL'
select 'fee_rules', o.slug, r.plan, r.percent, r.valid_from from organization_fee_rules r join organizations o on o.id = r.organization_id order by o.slug;
select 'reg', child_first_name, booked_price_cents, (player_id is not null), (anonymized_at is not null), child_birth_date, updated_at from camp_registrations order by child_first_name, id;
select 'players', count(*) from players;
select 'modules', slug, modules from organizations order by slug;
SQL
# anonymized_at is now() on run 1 only, the rows must be identical
diff "$OUT/state1.txt" "$OUT/state2.txt" && echo "run 2 ok: data unchanged"

echo "== 2) full state"
bootstrap scratch_golive_full
apply_ref scratch_golive_full origin/demo/jan
echo "full migrations: $(git -C "$REPO" ls-tree --name-only origin/demo/jan supabase/migrations/ | grep -c '\.sql$')"

$PG -d scratch_golive_prod -At -f "$REPO/supabase/golive/PROD-PRECHECK-2026-11.sql" | tr "\n" " "; echo
echo "== 3) schema diff (prod+combined vs. all migrations)"
D="pg_dump -h 127.0.0.1 -p 55443 -U postgres --schema-only --no-owner"
$D scratch_golive_prod | grep -v '^--' > "$OUT/schema_prod.sql"
$D scratch_golive_full | grep -v '^--' > "$OUT/schema_full.sql"
sed -i "/^\\\\\(un\)\?restrict /d" "$OUT"/schema_*.sql
if diff -u "$OUT/schema_full.sql" "$OUT/schema_prod.sql" > "$OUT/schema.diff"; then echo "schema identical"; else echo "schema differs:"; cat "$OUT/schema.diff"; fi
$PG -d postgres -c "drop database scratch_golive_prod with (force)" -c "drop database scratch_golive_full with (force)"
echo "scratch databases dropped (logs: $OUT)"
