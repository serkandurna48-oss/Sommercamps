"""Opt-in integration checks against a disposable LOCAL PostgreSQL database.

Run with REVIEW_POSTGRES_PORT set to a dedicated local test cluster's port.
Never reads DATABASE_URL; creates and drops only its own randomly named database.
Auth's users table is a minimal local stand-in, not a Supabase Auth emulator.
"""

from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from pathlib import Path
import os
from threading import Event
from time import monotonic, sleep
from uuid import uuid4

import psycopg2
from psycopg2 import sql
from psycopg2.extras import RealDictCursor, register_uuid
import pytest
from fastapi.testclient import TestClient

from app import db
from app import supabase_auth
from app.main import app
from app.repositories import registrations as repo
from app.schemas import RegistrationCreate
from app.tenancy import TenantContext
from .test_registrations_api import _target, _valid_payload


@pytest.fixture(scope="module")
def local_database():
    port = os.environ.get("REVIEW_POSTGRES_PORT")
    if not port:
        pytest.skip("Set REVIEW_POSTGRES_PORT to opt into disposable local DB tests")
    assert port.isdigit() and 1024 < int(port) < 65536
    config = dict(host="127.0.0.1", port=int(port), user="postgres", connect_timeout=5)
    name = f"review_campspilot_{uuid4().hex}"
    admin = psycopg2.connect(dbname="postgres", **config)
    admin.autocommit = True
    register_uuid()
    with admin.cursor() as cur:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    try:
        with psycopg2.connect(dbname=name, **config) as setup:
            with setup.cursor() as cur:
                cur.execute("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY)")
                for role in ("anon", "authenticated"):
                    cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
                    if cur.fetchone() is None:
                        cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
                migrations = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
                for migration in sorted(migrations.glob("*.sql")):
                    cur.execute(migration.read_text(encoding="utf-8"))
                cur.execute("GRANT USAGE ON SCHEMA public TO anon, authenticated")
                cur.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated")
        setup.close()
        yield dict(dbname=name, **config)
    finally:
        with admin.cursor() as cur:
            cur.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
        admin.close()


@pytest.fixture
def real_db(local_database, monkeypatch):
    @contextmanager
    def cursor():
        conn = psycopg2.connect(**local_database)
        try:
            with conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SET LOCAL statement_timeout = '8s'")
                    yield cur
        finally:
            conn.close()

    monkeypatch.setattr(db, "get_cursor", cursor)
    org_id, camp_id = uuid4(), uuid4()
    slug = f"review-{org_id.hex}"
    with cursor() as cur:
        cur.execute("INSERT INTO organizations (id,slug,name,contact_email,site_published,plan_status) VALUES (%s,%s,'Review','review@example.com',true,'active')", (org_id, slug))
        cur.execute("INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents,status) VALUES (%s,%s,'summer-1','Review','2027-07-05','2027-07-09',6,12,1,1000,'published')", (camp_id, org_id))
    return cursor, TenantContext(org_id, slug, "Review", "active"), _target(id=camp_id, organization_id=org_id, capacity=1)


def wait_for_lock(cursor, application_name):
    deadline = monotonic() + 5
    while monotonic() < deadline:
        with cursor() as cur:
            cur.execute("SELECT 1 FROM pg_stat_activity WHERE application_name=%s AND wait_event_type='Lock'", (application_name,))
            if cur.fetchone():
                return
        sleep(0.01)
    pytest.fail("Concurrent operation did not reach the expected database lock")


@pytest.mark.parametrize("assignment", ["site_published=false", "plan_status='suspended'"])
def test_withdrawal_committing_first_rejects_registration(real_db, local_database, monkeypatch, assignment):
    cursor, tenant, camp = real_db
    data = RegistrationCreate(**_valid_payload())
    name = f"review-registration-{uuid4().hex}"

    @contextmanager
    def named_cursor():
        with cursor() as cur:
            cur.execute("SET LOCAL application_name = %s", (name,))
            yield cur

    monkeypatch.setattr(db, "get_cursor", named_cursor)
    with ThreadPoolExecutor(max_workers=1) as executor:
        with cursor() as admin:
            # This write is uncommitted when the registration attempts its lock.
            admin.execute(f"UPDATE organizations SET {assignment} WHERE id=%s", (tenant.organization_id,))
            future = executor.submit(repo.create_registration, tenant, camp, data)
            wait_for_lock(cursor, name)
        with pytest.raises(repo.OrganizationNotAvailableError):
            future.result(timeout=10)
    with cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM camp_registrations WHERE organization_id=%s", (tenant.organization_id,))
        assert cur.fetchone()["n"] == 0


def test_registration_lock_delays_withdrawal_but_not_other_camps(real_db, monkeypatch):
    cursor, tenant, camp = real_db
    other = _target(organization_id=tenant.organization_id, slug="other")
    with cursor() as cur:
        cur.execute("INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents,status) VALUES (%s,%s,'other','Other','2027-07-05','2027-07-09',6,12,20,1000,'published')", (other.id, tenant.organization_id))
    inserted, release = Event(), Event()
    name = f"review-withdrawal-{uuid4().hex}"

    @contextmanager
    def held_cursor():
        with cursor() as cur:
            yield cur
            if cur.query and b"insert into camp_registrations" in cur.query.lower():
                inserted.set()
                assert release.wait(5), "Test did not release registration transaction"

    monkeypatch.setattr(db, "get_cursor", held_cursor)
    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(repo.create_registration, tenant, camp, RegistrationCreate(**_valid_payload()))
        try:
            assert inserted.wait(5)
            # Another camp can register while the first transaction is still open.
            monkeypatch.setattr(db, "get_cursor", cursor)
            assert repo.create_registration(tenant, other, RegistrationCreate(**_valid_payload()))["status"] == "registered"

            def withdraw():
                with cursor() as cur:
                    cur.execute("SET LOCAL application_name = %s", (name,))
                    cur.execute("UPDATE organizations SET site_published=false WHERE id=%s", (tenant.organization_id,))

            update = executor.submit(withdraw)
            wait_for_lock(cursor, name)
        finally:
            release.set()
        assert first.result(timeout=10)["status"] == "registered"
        update.result(timeout=10)


def test_parallel_last_spot_has_exactly_one_registered(real_db):
    _, tenant, camp = real_db
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(repo.create_registration, tenant, camp, RegistrationCreate(**_valid_payload(child_first_name=name))) for name in ("First", "Second")]
        assert sorted(f.result(timeout=10)["status"] for f in futures) == ["registered", "waitlist"]


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_rls_hides_existing_rows_and_blocks_self_granted_roles(real_db, role):
    cursor, tenant, camp = real_db
    user_id = uuid4()
    repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (tenant.organization_id, user_id))
        cur.execute("INSERT INTO audit_log(action,organization_id) VALUES ('review',%s)", (tenant.organization_id,))
    for table in ("organizations", "camps", "camp_registrations", "platform_owners", "organization_members", "audit_log"):
        with cursor() as cur:
            cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
            cur.execute(sql.SQL("SELECT count(*) AS n FROM {}").format(sql.Identifier(table)))
            assert cur.fetchone()["n"] == 0, table
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        with cursor() as cur:
            cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
            cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (uuid4(),))
    with pytest.raises(psycopg2.errors.InsufficientPrivilege):
        with cursor() as cur:
            cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
            cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (tenant.organization_id, uuid4()))


def test_local_admin_and_parent_workflow_with_real_tenant_queries(real_db, monkeypatch):
    """Real routes, role lookups, repositories and migrations; only identity is fake."""
    cursor, _, _ = real_db
    owner, admin_a, admin_b = (uuid4() for _ in range(3))
    identities = {"owner": owner, "admin-a": admin_a, "admin-b": admin_b}
    with cursor() as cur:
        for user_id in identities.values():
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (owner,))

    def verify(token):
        if token not in identities:
            raise supabase_auth.SupabaseAuthError("Unknown synthetic identity")
        return supabase_auth.SupabaseUser(str(identities[token]), "review@example.com")

    monkeypatch.setattr(supabase_auth, "verify_access_token", verify)
    slug_a, slug_b = (f"review-{uuid4().hex}" for _ in range(2))
    headers = lambda token: {"Authorization": f"Bearer {token}"}
    with TestClient(app) as client:
        def request(method, path, expected=200, identity="admin-a", **kwargs):
            response = client.request(method, path, headers=headers(identity) if identity else {}, **kwargs)
            assert response.status_code == expected, (method, path, response.status_code, response.text)
            return response

        for slug, user_id in ((slug_a, admin_a), (slug_b, admin_b)):
            org = request("POST", "/admin/organizations", 201, "owner", json={"slug": slug, "name": "Review", "contact_email": "review@example.com"}).json()
            assert org["site_published"] is False
            with cursor() as cur:
                cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (org["id"], user_id))

        admin = f"/admin/organizations/{slug_a}"
        public = f"/api/v1/organizations/{slug_a}"
        request("GET", public, 404, None)
        request("GET", admin, 200, "owner")
        request("GET", admin)
        assert request("GET", "/admin/me").json()["admin_organization_slugs"] == [slug_a]
        request("GET", f"/admin/organizations/{slug_b}", 403)
        request("GET", "/admin/organizations", 403)

        camp_data = {"slug": "summer", "title": "Local review camp", "start_date": "2027-07-05", "end_date": "2027-07-09", "age_min": 6, "age_max": 12, "capacity": 1, "price_cents": 1000}
        assert request("POST", f"{admin}/camps", 201, json=camp_data).json()["status"] == "draft"
        request("POST", f"{admin}/camps", 201, json={**camp_data, "slug": "other"})
        request("GET", f"{admin}/camps")
        request("PATCH", admin, json={"site_published": True})
        assert request("GET", f"{public}/camps", identity=None).json() == []
        request("GET", f"{public}/camps/summer", 404, None)
        request("POST", f"{public}/camps/summer/registrations", 404, None, json=_valid_payload())
        request("PATCH", f"{admin}/camps/summer", json={"status": "published"})
        request("GET", f"{public}/camps/summer", identity=None)
        first = request("POST", f"{public}/camps/summer/registrations", 201, None, json=_valid_payload()).json()
        second = request("POST", f"{public}/camps/summer/registrations", 201, None, json=_valid_payload(child_first_name="Second")).json()
        assert (first["status"], second["status"]) == ("registered", "waitlist")
        request("POST", f"{public}/camps/summer/registrations", 409, None, json=_valid_payload())
        request("PATCH", admin, json={"site_published": False})
        request("GET", public, 404, None)
        request("GET", f"{public}/camps", 404, None)
        request("POST", f"{public}/camps/summer/registrations", 404, None, json=_valid_payload(child_first_name="Third"))

        token = first["registration_token"]
        registration = f"{admin}/camps/summer/registrations/{token}"
        request("PATCH", f"{registration}/payment-status", 403, "admin-b", json={"payment_status": "paid"})
        request("PATCH", f"{admin}/camps/other/registrations/{token}/payment-status", 404, json={"payment_status": "paid"})
        request("PATCH", f"{registration}/payment-status", json={"payment_status": "paid"})
        request("PATCH", f"{registration}/details", json={"child_first_name": "Corrected", "child_last_name": "Review"})
        participants = request("GET", f"{admin}/camps/summer/registrations").json()
        corrected = next(row for row in participants if row["registration_token"] == token)
        assert (corrected["child_first_name"], corrected["payment_status"]) == ("Corrected", "paid")
        request("GET", f"{admin}/camps/summer/export.xlsx", 403, "admin-b")
        assert request("GET", f"{admin}/camps/summer/export.xlsx").content.startswith(b"PK")
        cancelled = request("POST", f"{registration}/cancel").json()
        assert cancelled["cancelled"]["status"] == "cancelled"
        assert cancelled["promoted"]["registration_token"] == second["registration_token"]
        request("GET", "/admin/audit-log", 403)
        assert request("GET", "/admin/audit-log", identity="owner").json()
