"""Upgrade probe: three 2026-10-18/19 migrations on a pre-populated database.

Verifies that the Welle-2 schema additions are data-safe:
  20261018000000_add_email_tracking_to_camp_registrations.sql
  20261018154831_tenant_read_policies.sql
  20261019203000_org_trainer.sql

Run:
  REVIEW_POSTGRES_PORT=<port> python -m pytest \
      backend_saas/tests/test_schema_upgrade_populated.py -q

Skips cleanly if REVIEW_POSTGRES_PORT is not set.
Never reads DATABASE_URL; creates and drops only randomly named databases.
No real personal data; all e-mail addresses use @campspilot.example.
"""

import hashlib
import json
import os
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor, register_uuid
import pytest


_MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

_WELLE2_FILES = [
    "20261018000000_add_email_tracking_to_camp_registrations.sql",
    "20261018154831_tenant_read_policies.sql",
    "20261019203000_org_trainer.sql",
]

# Baseline: all migrations whose filenames sort before the first Welle-2 file.
_BASELINE = sorted(
    p for p in _MIGRATIONS.glob("*.sql") if p.name < _WELLE2_FILES[0]
)

_GUARDED_TABLES = (
    "organizations", "camps", "camp_registrations",
    "platform_owners", "organization_members", "audit_log",
)

# Columns stable across the upgrade (excludes the newly added email_error).
_REG_STABLE_COLS = (
    "id", "organization_id", "camp_id", "registration_token",
    "status", "payment_status",
    "parent_first_name", "parent_last_name", "parent_email", "parent_phone",
    "child_first_name", "child_last_name", "child_birth_date",
    "emergency_contact_name", "emergency_contact_phone",
    "medical_notes", "allergies", "photo_permission",
    "terms_accepted", "privacy_accepted",
    "stripe_session_id", "stripe_payment_intent_id",
    "paid_at", "email_sent_at",
    "jersey_size", "pickup_authorized",
    "created_at", "updated_at",
)

_SENT_TS = "2026-10-18 10:00:00+00"


@pytest.fixture(scope="module")
def pg_config():
    port = os.environ.get("REVIEW_POSTGRES_PORT")
    if not port:
        pytest.skip("Set REVIEW_POSTGRES_PORT to run local DB upgrade probe")
    assert port.isdigit() and 1024 < int(port) < 65536
    return dict(host="127.0.0.1", port=int(port), user="postgres", connect_timeout=5)


@contextmanager
def _disposable_db(pg_config):
    register_uuid()
    name = f"upgrade_probe_{uuid4().hex}"
    admin = psycopg2.connect(dbname="postgres", **pg_config)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    try:
        yield dict(dbname=name, **pg_config)
    finally:
        with admin.cursor() as cur:
            cur.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )
        admin.close()


def _bootstrap(conn, migrations):
    """Apply auth stand-in, roles, and supplied migrations to an empty database."""
    with conn.cursor() as cur:
        cur.execute(
            "CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY)"
        )
        cur.execute(
            """CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
               SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb
                   ->> 'sub')::uuid $$"""
        )
        for role in ("anon", "authenticated"):
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
            if cur.fetchone() is None:
                cur.execute(
                    sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role))
                )
        for mig in migrations:
            cur.execute(mig.read_text(encoding="utf-8"))
        cur.execute("GRANT USAGE ON SCHEMA auth TO anon, authenticated")
        cur.execute("GRANT USAGE ON SCHEMA public TO anon, authenticated")
        cur.execute(
            "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public"
            " TO anon, authenticated"
        )


def _insert_data(conn):
    """Insert 2 orgs, 2 camps each, 6 registrations (incl. waitlist and email_sent_at)."""
    orgs, camps = [], []
    with conn.cursor() as cur:
        for i in range(2):
            oid = uuid4()
            cur.execute(
                "INSERT INTO organizations(id,slug,name,contact_email,plan_status)"
                " VALUES (%s,%s,%s,%s,'active')",
                (
                    oid,
                    f"probe-{oid.hex[:8]}",
                    f"Probe Org {i + 1}",
                    f"org{i + 1}@campspilot.example",
                ),
            )
            orgs.append(oid)
            for j in range(2):
                cid = uuid4()
                cap = 2 if j == 0 else 1
                cur.execute(
                    "INSERT INTO camps(id,organization_id,slug,title,"
                    "start_date,end_date,age_min,age_max,capacity,price_cents,status)"
                    " VALUES (%s,%s,%s,%s,'2027-07-05','2027-07-09',6,12,%s,1000,'published')",
                    (cid, oid, f"camp-{j + 1}", f"Probe Camp {j + 1} Org {i + 1}", cap),
                )
                camps.append((cid, oid))

    # camps[0]: org A, cap 2 → 2 registered (both sent)
    # camps[1]: org A, cap 1 → 1 registered (sent) + 1 waitlist (not sent)
    # camps[2]: org B, cap 2 → 1 registered (not sent)
    # camps[3]: org B, cap 1 → 1 waitlist (not sent)
    rows = [
        (camps[0][1], camps[0][0], "probe1@campspilot.example", "Child1", "registered", _SENT_TS),
        (camps[0][1], camps[0][0], "probe2@campspilot.example", "Child2", "registered", _SENT_TS),
        (camps[1][1], camps[1][0], "probe3@campspilot.example", "Child3", "registered", _SENT_TS),
        (camps[1][1], camps[1][0], "probe4@campspilot.example", "Child4", "waitlist", None),
        (camps[2][1], camps[2][0], "probe5@campspilot.example", "Child5", "registered", None),
        (camps[3][1], camps[3][0], "probe6@campspilot.example", "Child6", "waitlist", None),
    ]
    with conn.cursor() as cur:
        for org_id, camp_id, email, child, status, sent_at in rows:
            cur.execute(
                "INSERT INTO camp_registrations"
                "(organization_id,camp_id,parent_first_name,parent_last_name,"
                "parent_email,parent_phone,child_first_name,child_last_name,"
                "child_birth_date,terms_accepted,privacy_accepted,status,email_sent_at)"
                " VALUES (%s,%s,'Probe','Parent',%s,'0049123456',%s,'Probechild',"
                "'2018-05-01',true,true,%s,%s)",
                (org_id, camp_id, email, child, status, sent_at),
            )


def _reg_snapshot(cur):
    col_list = sql.SQL(", ").join(sql.Identifier(c) for c in _REG_STABLE_COLS)
    cur.execute(
        sql.SQL("SELECT {} FROM camp_registrations ORDER BY id").format(col_list)
    )
    rows = [dict(r) for r in cur.fetchall()]
    digest = hashlib.sha256(
        json.dumps(rows, default=str, sort_keys=True).encode()
    ).hexdigest()
    return len(rows), digest


def _apply_welle2(cur):
    for fname in _WELLE2_FILES:
        cur.execute((_MIGRATIONS / fname).read_text(encoding="utf-8"))


def test_upgrade_preserves_data(pg_config):
    """Row counts, stable-column hashes, and email_sent_at values are unchanged after upgrade."""
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE)
            _insert_data(conn)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                count_before, digest_before = _reg_snapshot(cur)
                cur.execute(
                    "SELECT email_sent_at FROM camp_registrations"
                    " WHERE email_sent_at IS NOT NULL ORDER BY email_sent_at"
                )
                sent_before = [r["email_sent_at"] for r in cur.fetchall()]

        assert count_before == 6
        assert len(sent_before) == 3  # probe1, probe2, probe3

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                _apply_welle2(cur)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                count_after, digest_after = _reg_snapshot(cur)
                cur.execute(
                    "SELECT email_sent_at FROM camp_registrations"
                    " WHERE email_sent_at IS NOT NULL ORDER BY email_sent_at"
                )
                sent_after = [r["email_sent_at"] for r in cur.fetchall()]

                cur.execute(
                    "SELECT count(*) AS n FROM camp_registrations"
                    " WHERE email_error IS NOT NULL"
                )
                assert cur.fetchone()["n"] == 0, "email_error must be NULL for all pre-existing rows"

                cur.execute(
                    "SELECT count(*) AS n FROM organizations"
                    " WHERE trainer_image_url IS NOT NULL OR trainer_text IS NOT NULL"
                )
                assert cur.fetchone()["n"] == 0, "trainer columns must be NULL for all pre-existing orgs"

        assert count_after == count_before, "Row count changed"
        assert digest_after == digest_before, "Registration data (stable columns) changed"
        assert sent_after == sent_before, "email_sent_at values changed"


def test_upgrade_is_idempotent(pg_config):
    """Applying all three migrations a second time must not raise or alter the data."""
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE)
            _insert_data(conn)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                _apply_welle2(cur)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                count_first, digest_first = _reg_snapshot(cur)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                _apply_welle2(cur)  # second application — must not raise

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                count_second, digest_second = _reg_snapshot(cur)

        assert count_second == count_first
        assert digest_second == digest_first


def test_rls_migration_aborts_on_foreign_policy(pg_config):
    """A permissive policy without s3_ prefix aborts the RLS migration before it applies any change."""
    rls_sql = (_MIGRATIONS / "20261018154831_tenant_read_policies.sql").read_text(encoding="utf-8")

    with _disposable_db(pg_config) as db_kw:
        # Build a fully upgraded, populated database.
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE)
            _insert_data(conn)
            with conn.cursor() as cur:
                _apply_welle2(cur)

        # Remove all s3_ policies and plant a foreign (non-s3_) one.
        admin = psycopg2.connect(**db_kw)
        admin.autocommit = True
        try:
            with admin.cursor() as cur:
                for table in _GUARDED_TABLES:
                    cur.execute(
                        "SELECT policyname FROM pg_policies"
                        " WHERE schemaname='public' AND tablename=%s"
                        " AND policyname LIKE 's3\\_%%'",
                        (table,),
                    )
                    for (name,) in cur.fetchall():
                        cur.execute(
                            sql.SQL("DROP POLICY IF EXISTS {} ON public.{}").format(
                                sql.Identifier(name), sql.Identifier(table)
                            )
                        )
                cur.execute(
                    "CREATE POLICY foreign_open ON public.camp_registrations"
                    " FOR SELECT TO authenticated USING (true)"
                )
        finally:
            admin.close()

        # The guard at the top of the migration must raise before creating any policy.
        with pytest.raises(psycopg2.errors.RaiseException):
            with psycopg2.connect(**db_kw) as conn:
                with conn.cursor() as cur:
                    cur.execute(rls_sql)

        # After the aborted transaction: no s3_ policies must exist.
        verify = psycopg2.connect(**db_kw)
        try:
            with verify.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM pg_policies"
                    " WHERE schemaname='public' AND policyname LIKE 's3\\_%%'"
                )
                assert cur.fetchone()[0] == 0

                # Pre-existing data must be intact.
                cur.execute("SELECT count(*) FROM camp_registrations")
                assert cur.fetchone()[0] == 6
        finally:
            verify.close()
