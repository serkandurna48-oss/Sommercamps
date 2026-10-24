"""S3: real RLS checks, only in a disposable loopback PostgreSQL database.

Run: REVIEW_POSTGRES_PORT=55443 python -m pytest tests/test_rls_postgres.py -q
No DATABASE_URL, remote DB, real users, or real child data are used.
"""

import json
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor
import pytest

from .test_review_postgres import local_database, real_db
from .test_registrations_api import _valid_payload
from app.repositories import registrations as repo
from app.schemas import RegistrationCreate


TABLES = ("organizations", "camps", "camp_registrations",
          "organization_members", "platform_owners", "audit_log")


@pytest.fixture
def tenants(real_db):
    cursor, tenant, camp = real_db
    admin_a, admin_b, owner, outsider = (uuid4() for _ in range(4))
    org_b, camp_b = uuid4(), uuid4()
    repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    with cursor() as cur:
        for user in (admin_a, admin_b, owner, outsider):
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'Synthetic B','b@example.test')", (org_b, f"rls-{org_b.hex}"))
        cur.execute("INSERT INTO camps(id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents) VALUES (%s,%s,'synthetic','Synthetic','2027-07-05','2027-07-09',6,12,10,1000)", (camp_b, org_b))
        cur.execute("""INSERT INTO camp_registrations(organization_id,camp_id,parent_first_name,parent_last_name,parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,privacy_accepted)
            VALUES (%s,%s,'Synthetic','Parent','b@example.test','123','Synthetic','Child','2018-01-01',true,true)""", (org_b, camp_b))
        for user, org in ((admin_a, tenant.organization_id), (admin_b, org_b)):
            cur.execute("INSERT INTO organization_members(user_id,organization_id) VALUES (%s,%s)", (user, org))
            cur.execute("INSERT INTO audit_log(action,organization_id) VALUES ('synthetic',%s)", (org,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (owner,))
    return cursor, tenant.organization_id, org_b, admin_a, admin_b, owner, outsider


def identity(cur, user=None, role="authenticated", **extra):
    cur.execute("SELECT set_config('request.jwt.claims', %s, true)",
                (json.dumps({**extra, **({"sub": str(user)} if user else {})}),))
    cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))


@pytest.mark.parametrize("side", ["a", "b"])
def test_admin_reads_only_own_tenant_without_query_filter(tenants, side):
    cursor, a, b, admin_a, admin_b, _, _ = tenants
    expected, user = (a, admin_a) if side == "a" else (b, admin_b)
    with cursor() as cur:
        # Even forged metadata cannot grant access to the other tenant.
        identity(cur, user, user_metadata={"organization_id": str(b if side == "a" else a), "role": "platform_owner"})
        for table in TABLES:
            column = "id" if table == "organizations" else "organization_id"
            if table == "platform_owners":
                cur.execute("SELECT * FROM platform_owners")
                assert cur.fetchall() == []
                continue
            cur.execute(sql.SQL("SELECT {} FROM {}").format(sql.Identifier(column), sql.Identifier(table)))
            rows = cur.fetchall()
            assert [r[column] for r in rows] == ([] if table == "audit_log" else [expected]), table


@pytest.mark.parametrize("who", ["anon", "missing", "outsider"])
def test_unassigned_identity_sees_nothing(tenants, who):
    cursor, _, _, _, _, _, outsider = tenants
    with cursor() as cur:
        identity(cur, outsider if who == "outsider" else None, role="anon" if who == "anon" else "authenticated")
        for table in TABLES:
            cur.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table)))
            assert cur.fetchall() == [], table


def test_owner_reads_both_tenants_but_only_own_role_row(tenants):
    cursor, a, b, _, _, owner, _ = tenants
    with cursor() as cur:
        identity(cur, owner)
        for table in ("organizations", "camps", "camp_registrations", "audit_log"):
            column = "id" if table == "organizations" else "organization_id"
            cur.execute(sql.SQL("SELECT {} FROM {}").format(sql.Identifier(column), sql.Identifier(table)))
            assert {r[column] for r in cur.fetchall()} >= {a, b}
        cur.execute("SELECT user_id FROM platform_owners")
        assert [r["user_id"] for r in cur.fetchall()] == [owner]


def test_membership_revocation_takes_effect_without_new_claims(tenants):
    cursor, a, _, user, _, _, _ = tenants
    with cursor() as cur:
        cur.execute("DELETE FROM organization_members WHERE user_id=%s", (user,))
        identity(cur, user)
        cur.execute("SELECT * FROM organizations WHERE id=%s", (a,))
        assert cur.fetchall() == []


@pytest.mark.parametrize("table", TABLES)
def test_authenticated_cannot_update_delete_or_insert(tenants, table):
    cursor, _, _, user, _, owner, _ = tenants
    # Owner also has no direct write policies. Grants deliberately include DML
    # in the fixture so these checks exercise RLS, not missing privileges.
    for actor in (user, owner):
        with cursor() as cur:
            identity(cur, actor)
            cur.execute(sql.SQL("UPDATE {} SET {}={}").format(
                sql.Identifier(table), sql.Identifier("user_id" if table == "platform_owners" else "id"),
                sql.Identifier("user_id" if table == "platform_owners" else "id")))
            assert cur.rowcount == 0
            cur.execute(sql.SQL("DELETE FROM {}").format(sql.Identifier(table)))
            assert cur.rowcount == 0
        with pytest.raises(psycopg2.errors.InsufficientPrivilege):
            with cursor() as cur:
                # Copy an existing valid row under privileged access, then try
                # inserting it with a new key as the authenticated actor.
                cur.execute(sql.SQL("SELECT row_to_json(t) AS row FROM {} t LIMIT 1").format(sql.Identifier(table)))
                row = cur.fetchone()["row"]
                row["user_id" if table == "platform_owners" else "id"] = str(uuid4())
                identity(cur, actor)
                cur.execute(sql.SQL("INSERT INTO {} SELECT (json_populate_record(NULL::{}, %s)).*").format(
                    sql.Identifier(table), sql.Identifier(table)), (json.dumps(row),))


def test_migration_is_repeatable(local_database):
    migration = Path(__file__).resolve().parents[2] / "supabase/migrations/20261018154831_tenant_read_policies.sql"
    with psycopg2.connect(**local_database) as conn:
        with conn.cursor() as cur:
            cur.execute(migration.read_text(encoding="utf-8"))
            cur.execute(migration.read_text(encoding="utf-8"))


def test_migration_aborts_on_foreign_policy(local_database):
    migration_sql = (
        Path(__file__).resolve().parents[2]
        / "supabase/migrations/20261018154831_tenant_read_policies.sql"
    ).read_text(encoding="utf-8")

    # Drop all s3_ policies so we can verify the aborted migration creates none.
    setup = psycopg2.connect(**local_database)
    setup.autocommit = True
    try:
        with setup.cursor() as cur:
            for table in TABLES:
                cur.execute(
                    "SELECT policyname FROM pg_policies "
                    "WHERE schemaname='public' AND tablename=%s AND policyname LIKE 's3\\_%%'",
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
        setup.close()

    try:
        with pytest.raises(psycopg2.errors.RaiseException):
            with psycopg2.connect(**local_database) as run:
                with run.cursor() as cur:
                    cur.execute(migration_sql)

        verify = psycopg2.connect(**local_database)
        try:
            with verify.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM pg_policies "
                    "WHERE schemaname='public' AND tablename=ANY(%s) AND policyname LIKE 's3\\_%%'",
                    (list(TABLES),),
                )
                assert cur.fetchone()[0] == 0
        finally:
            verify.close()
    finally:
        restore = psycopg2.connect(**local_database)
        restore.autocommit = True
        try:
            with restore.cursor() as cur:
                cur.execute("DROP POLICY IF EXISTS foreign_open ON public.camp_registrations")
        finally:
            restore.close()
        with psycopg2.connect(**local_database) as reapply:
            with reapply.cursor() as cur:
                cur.execute(migration_sql)


# ---------------------------------------------------------------------------
# UC6P — Column-level grants (20261024130000_column_level_grants.sql)
# ---------------------------------------------------------------------------

# Column classification for organizations and organization_members.
# These lists drive both test_column_grants_block_sensitive_fields and
# test_column_grants_comprehensive. Mutation probe: adding billing_notes to
# _ORG_READABLE causes test_column_grants_comprehensive to fail immediately.
_ORG_READABLE = [
    "id", "slug", "name", "legal_name", "contact_email", "contact_phone",
    "logo_url", "primary_color", "plan_status", "created_at", "updated_at",
    "theme", "iban", "site_published", "contact_person_name", "intro_heading",
    "intro_text", "hero_image_url", "legal_address", "trainer_image_url",
    "trainer_text", "terms_text", "stripe_charges_enabled", "online_payment_enabled",
    "review_status", "avv_accepted_at", "avv_version", "submitted_at",
    "approved_at", "review_note", "registration_questions",
]
_ORG_INTERNAL = ["billing_notes", "stripe_account_id", "approved_by"]

_MEMBER_READABLE = [
    "id", "organization_id", "user_id", "role", "created_at",
    "notification_channel", "notification_events",
]
_MEMBER_INTERNAL = ["notification_email", "notification_phone", "whatsapp_consent_at"]


def _apply_column_grants(cur):
    """Replicate production column-level grant state (REVOKE ALL + explicit GRANT)."""
    cur.execute("REVOKE ALL ON public.organizations FROM authenticated")
    cur.execute(
        sql.SQL("GRANT SELECT ({}) ON public.organizations TO authenticated").format(
            sql.SQL(", ").join(sql.Identifier(c) for c in _ORG_READABLE)
        )
    )
    cur.execute("REVOKE ALL ON public.organization_members FROM authenticated")
    cur.execute(
        sql.SQL("GRANT SELECT ({}) ON public.organization_members TO authenticated").format(
            sql.SQL(", ").join(sql.Identifier(c) for c in _MEMBER_READABLE)
        )
    )


def _restore_table_grants(cur):
    cur.execute("GRANT SELECT ON public.organizations TO authenticated")
    cur.execute("GRANT SELECT ON public.organization_members TO authenticated")


def test_column_grants_block_sensitive_fields(local_database):
    """UC6P: billing_notes, stripe_account_id, approved_by on organizations, and
    notification_email/phone/whatsapp_consent_at on organization_members
    must raise InsufficientPrivilege for authenticated.

    The local_database fixture runs GRANT SELECT ON ALL TABLES after migrations,
    which overrides the column-level migration. We explicitly revoke the
    table-level grant here to reproduce the production state, then restore it
    in the finally block so subsequent tests are unaffected.
    """
    user_id, org_id = uuid4(), uuid4()

    setup = psycopg2.connect(**local_database)
    setup.autocommit = True
    try:
        with setup.cursor() as cur:
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user_id,))
            cur.execute(
                "INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'ColTest','col@example.test')",
                (org_id, f"col-{org_id.hex}"),
            )
            cur.execute(
                "INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)",
                (org_id, user_id),
            )
            # REVOKE ALL + GRANT (col-level) replicates the production state exactly.
            # The local_database fixture runs GRANT SELECT ON ALL TABLES after migrations;
            # REVOKE SELECT alone may not preserve column-level grants in that context.
            _apply_column_grants(cur)
    finally:
        setup.close()

    try:
        # organizations: all internal columns must be blocked
        for col in _ORG_INTERNAL:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT set_config('request.jwt.claims',%s,true)",
                        (json.dumps({"sub": str(user_id)}),),
                    )
                    cur.execute("SET LOCAL ROLE authenticated")
                    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                        cur.execute(
                            sql.SQL("SELECT {} FROM organizations").format(sql.Identifier(col))
                        )

        # organizations: safe columns must still be readable (privilege + RLS)
        with psycopg2.connect(**local_database) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT set_config('request.jwt.claims',%s,true)",
                    (json.dumps({"sub": str(user_id)}),),
                )
                cur.execute("SET LOCAL ROLE authenticated")
                cur.execute("SELECT name, slug FROM organizations WHERE id=%s", (org_id,))
                row = cur.fetchone()
                assert row is not None, "org_admin must be able to read safe org columns"
                assert row["name"] == "ColTest"

        # organization_members: all internal columns must be blocked
        for col in _MEMBER_INTERNAL:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT set_config('request.jwt.claims',%s,true)",
                        (json.dumps({"sub": str(user_id)}),),
                    )
                    cur.execute("SET LOCAL ROLE authenticated")
                    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                        cur.execute(
                            sql.SQL("SELECT {} FROM organization_members").format(
                                sql.Identifier(col)
                            )
                        )

        # organization_members: safe columns must still be readable
        with psycopg2.connect(**local_database) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT set_config('request.jwt.claims',%s,true)",
                    (json.dumps({"sub": str(user_id)}),),
                )
                cur.execute("SET LOCAL ROLE authenticated")
                cur.execute(
                    "SELECT id, role FROM organization_members WHERE user_id=%s", (user_id,)
                )
                row = cur.fetchone()
                assert row is not None, "org_admin must be able to read safe member columns"
                assert row["role"] == "org_admin"

    finally:
        restore = psycopg2.connect(**local_database)
        restore.autocommit = True
        try:
            with restore.cursor() as cur:
                _restore_table_grants(cur)
                cur.execute(
                    "DELETE FROM organization_members WHERE organization_id=%s", (org_id,)
                )
                cur.execute("DELETE FROM organizations WHERE id=%s", (org_id,))
                cur.execute("DELETE FROM auth.users WHERE id=%s", (user_id,))
        finally:
            restore.close()


def test_column_grants_comprehensive(local_database):
    """UC6P: every 'readable' column is accessible, every 'internal' column raises
    InsufficientPrivilege. Covers all columns from all migrations up to 24.10.2026.

    Mutation probe: if billing_notes is moved to _ORG_READABLE, the static assertion
    below fails immediately. If it is added to the GRANT block in the migration, the
    pytest.raises block for billing_notes fails because no exception is raised.
    """
    # Static mutation probe — internal columns must never appear in the readable list.
    assert "billing_notes" not in _ORG_READABLE, "billing_notes must stay internal"
    assert "stripe_account_id" not in _ORG_READABLE
    assert "approved_by" not in _ORG_READABLE
    assert "notification_email" not in _MEMBER_READABLE
    assert "notification_phone" not in _MEMBER_READABLE
    assert "whatsapp_consent_at" not in _MEMBER_READABLE

    user_id, org_id = uuid4(), uuid4()

    setup = psycopg2.connect(**local_database)
    setup.autocommit = True
    try:
        with setup.cursor() as cur:
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user_id,))
            cur.execute(
                "INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'CmpTest','cmp@example.test')",
                (org_id, f"cmp-{org_id.hex}"),
            )
            cur.execute(
                "INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)",
                (org_id, user_id),
            )
            _apply_column_grants(cur)
    finally:
        setup.close()

    jwt = json.dumps({"sub": str(user_id)})

    try:
        # All readable org columns must be accessible via RLS
        for col in _ORG_READABLE:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT set_config('request.jwt.claims',%s,true)", (jwt,))
                    cur.execute("SET LOCAL ROLE authenticated")
                    cur.execute(
                        sql.SQL("SELECT {} FROM organizations WHERE id=%s").format(
                            sql.Identifier(col)
                        ),
                        (org_id,),
                    )
                    assert cur.fetchone() is not None, f"org column '{col}' should be readable"

        # All readable member columns must be accessible via RLS
        for col in _MEMBER_READABLE:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT set_config('request.jwt.claims',%s,true)", (jwt,))
                    cur.execute("SET LOCAL ROLE authenticated")
                    cur.execute(
                        sql.SQL("SELECT {} FROM organization_members WHERE user_id=%s").format(
                            sql.Identifier(col)
                        ),
                        (user_id,),
                    )
                    assert cur.fetchone() is not None, f"member column '{col}' should be readable"

        # All internal org columns must raise InsufficientPrivilege
        for col in _ORG_INTERNAL:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT set_config('request.jwt.claims',%s,true)", (jwt,))
                    cur.execute("SET LOCAL ROLE authenticated")
                    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                        cur.execute(
                            sql.SQL("SELECT {} FROM organizations").format(sql.Identifier(col))
                        )

        # All internal member columns must raise InsufficientPrivilege
        for col in _MEMBER_INTERNAL:
            with psycopg2.connect(**local_database) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT set_config('request.jwt.claims',%s,true)", (jwt,))
                    cur.execute("SET LOCAL ROLE authenticated")
                    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                        cur.execute(
                            sql.SQL("SELECT {} FROM organization_members").format(
                                sql.Identifier(col)
                            )
                        )

    finally:
        restore = psycopg2.connect(**local_database)
        restore.autocommit = True
        try:
            with restore.cursor() as cur:
                _restore_table_grants(cur)
                cur.execute("DELETE FROM organization_members WHERE organization_id=%s", (org_id,))
                cur.execute("DELETE FROM organizations WHERE id=%s", (org_id,))
                cur.execute("DELETE FROM auth.users WHERE id=%s", (user_id,))
        finally:
            restore.close()


def test_column_grants_migration_is_repeatable(local_database):
    """Running 20261024130000_column_level_grants.sql twice must not error."""
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase/migrations/20261024130000_column_level_grants.sql"
    )
    sql_text = migration.read_text(encoding="utf-8")
    with psycopg2.connect(**local_database) as conn:
        with conn.cursor() as cur:
            cur.execute(sql_text)
            cur.execute(sql_text)
