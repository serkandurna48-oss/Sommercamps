"""S3: real RLS checks, only in a disposable loopback PostgreSQL database.

Run: REVIEW_POSTGRES_PORT=55443 python -m pytest tests/test_rls_postgres.py -q
No DATABASE_URL, remote DB, real users, or real child data are used.
"""

import json
from pathlib import Path
from uuid import uuid4

import psycopg2
from psycopg2 import sql
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
