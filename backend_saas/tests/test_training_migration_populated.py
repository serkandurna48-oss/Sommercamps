"""Upgrade probe: training offers/memberships migration on a populated database.

Baseline = every migration before 20261105180000; classic camps and
registrations must survive unchanged and the migration must be idempotent.
Skips cleanly if REVIEW_POSTGRES_PORT is not set. Synthetic data only.
"""

import psycopg2
from psycopg2.extras import RealDictCursor

from .test_schema_upgrade_populated import (  # noqa: F401
    _MIGRATIONS, _REG_STABLE_COLS, _bootstrap, _disposable_db, _insert_data,
    _reg_snapshot, pg_config,
)

_MIGRATION = _MIGRATIONS / "20261105180000_training_offers_memberships.sql"
_BASELINE = sorted(p for p in _MIGRATIONS.glob("*.sql") if p.name < _MIGRATION.name)


def _camp_snapshot(cur):
    cur.execute(
        "SELECT id, organization_id, slug, title, start_date, end_date, capacity,"
        " price_cents, status FROM camps ORDER BY id"
    )
    return [dict(r) for r in cur.fetchall()]


def test_training_migration_on_populated_db_is_data_safe_and_idempotent(pg_config):
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE)
            _insert_data(conn)
        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                regs_before = _reg_snapshot(cur)
                camps_before = _camp_snapshot(cur)
        assert regs_before[0] == 6 and len(camps_before) == 4

        sql_text = _MIGRATION.read_text(encoding="utf-8")
        for _ in range(2):  # second run proves idempotency
            with psycopg2.connect(**db_kw) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql_text)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                assert _reg_snapshot(cur) == regs_before
                assert _camp_snapshot(cur) == camps_before
                cur.execute(
                    "SELECT count(*) AS n FROM camps WHERE offer_id IS NOT NULL"
                    " OR starts_at IS NOT NULL OR ends_at IS NOT NULL"
                    " OR price_member_cents IS NOT NULL"
                )
                assert cur.fetchone()["n"] == 0
                cur.execute(
                    "SELECT count(*) AS n FROM camp_registrations WHERE applied_price_cents IS NOT NULL"
                    " OR member_match IS NOT NULL OR payment_method IS NOT NULL"
                )
                assert cur.fetchone()["n"] == 0
                cur.execute("SELECT count(*) AS n FROM training_offers")
                assert cur.fetchone()["n"] == 0


_HARDENING = _MIGRATIONS / "20261105190000_training_hardening.sql"


def test_training_hardening_migration_applies_twice_and_revokes(pg_config):
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE + [_MIGRATION])
        sql_text = _HARDENING.read_text(encoding="utf-8")
        for _ in range(2):
            with psycopg2.connect(**db_kw) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql_text)
        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                def has(role, table, priv):
                    cur.execute("SELECT has_table_privilege(%s, %s, %s)", (role, table, priv))
                    return cur.fetchone()[0]

                for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                    assert not has("anon", "public.training_offers", priv)
                    assert not has("anon", "public.organization_memberships", priv)
                    assert not has("authenticated", "public.organization_memberships", priv)
                assert has("authenticated", "public.training_offers", "SELECT")
                for priv in ("INSERT", "UPDATE", "DELETE"):
                    assert not has("authenticated", "public.training_offers", priv)
