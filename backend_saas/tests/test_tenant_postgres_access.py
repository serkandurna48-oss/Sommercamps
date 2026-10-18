"""Opt-in loopback PostgreSQL proof; never reads DATABASE_URL."""

from uuid import uuid4
from io import BytesIO
from zipfile import ZipFile

import psycopg2
from psycopg2 import sql
import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.repositories import registrations
from app.schemas import RegistrationCreate
from .test_registrations_api import _valid_payload
from .test_admin_access_matrix import ADMIN_REQUESTS
from .test_review_postgres import local_database, real_db  # noqa: F401


def test_all_admin_routes_with_real_membership_queries(real_db, monkeypatch):
    cursor, foreign, _ = real_db
    admin_a, memberless, own_org = uuid4(), uuid4(), uuid4()
    own_slug = f"isolated-a-{own_org.hex}"
    with cursor() as cur:
        for user in (admin_a, memberless):
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'Isolated A','test@example.com')", (own_org, own_slug))
        cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (own_org, admin_a))

    identities = {"admin-a": admin_a, "no-membership": memberless}

    def verify(token):
        if token not in identities:
            raise supabase_auth.SupabaseAuthError("Unknown synthetic token")
        return supabase_auth.SupabaseUser(str(identities[token]), "test@example.com")

    monkeypatch.setattr(supabase_auth, "verify_access_token", verify)
    with TestClient(app) as client:
        for identity, expected in ((None, 401), ("invalid", 401), ("admin-a", 403), ("no-membership", 403)):
            headers = {"Authorization": f"Bearer {identity}"} if identity else {}
            for case in ADMIN_REQUESTS:
                method, path = case.values
                path = path.replace("other-club", foreign.slug)
                response = client.request(method, path, headers=headers, json={} if method in {"POST", "PATCH"} else None)
                assert response.status_code == expected, (identity, method, path, response.status_code)
        headers = {"Authorization": "Bearer admin-a"}
        me = client.get("/admin/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["is_platform_owner"] is False
        assert me.json()["admin_organization_slugs"] == [own_slug]
        assert client.get(f"/admin/organizations/{own_slug}", headers=headers).status_code == 200
        with cursor() as cur:
            cur.execute("DELETE FROM organization_members WHERE organization_id=%s AND user_id=%s", (own_org, admin_a))
        assert client.get(f"/admin/organizations/{own_slug}", headers=headers).status_code == 403
    with cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM camp_registrations WHERE organization_id=%s", (foreign.organization_id,))
        assert cur.fetchone()["n"] == 0
        cur.execute("SELECT count(*) AS n FROM organization_members WHERE organization_id=%s", (foreign.organization_id,))
        assert cur.fetchone()["n"] == 0


def test_rls_depends_on_database_role_not_transport(real_db):
    cursor, tenant, _ = real_db
    restricted = f"isolated_rls_{uuid4().hex}"
    bypass = f"isolated_bypass_{uuid4().hex}"
    try:
        with cursor() as cur:
            cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER NOBYPASSRLS").format(sql.Identifier(restricted)))
            cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN NOSUPERUSER BYPASSRLS").format(sql.Identifier(bypass)))
            for role in (restricted, bypass):
                cur.execute(sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role)))
                cur.execute(sql.SQL("GRANT SELECT, INSERT ON organizations TO {}").format(sql.Identifier(role)))
            cur.execute("SELECT relrowsecurity FROM pg_class WHERE oid='public.organizations'::regclass")
            assert cur.fetchone()["relrowsecurity"] is True
        for role, visible in ((restricted, 0), (bypass, 1)):
            with cursor() as cur:
                cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(role)))
                cur.execute("SELECT current_user AS role, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user")
                flags = cur.fetchone()
                assert flags["role"] == role
                assert flags["rolsuper"] is False
                assert flags["rolbypassrls"] is (role == bypass)
                cur.execute("SELECT count(*) AS n FROM organizations WHERE id=%s", (tenant.organization_id,))
                assert cur.fetchone()["n"] == visible
        with pytest.raises(psycopg2.errors.InsufficientPrivilege):
            with cursor() as cur:
                cur.execute(sql.SQL("SET LOCAL ROLE {}").format(sql.Identifier(restricted)))
                cur.execute("INSERT INTO organizations(slug,name,contact_email) VALUES ('blocked','Blocked','test@example.com')")
    finally:
        for role in (restricted, bypass):
            with cursor() as cur:
                cur.execute(sql.SQL("DROP OWNED BY {}").format(sql.Identifier(role)))
                cur.execute(sql.SQL("DROP ROLE {}").format(sql.Identifier(role)))


def test_foreign_tokens_cannot_be_used_through_an_authorized_org_path(real_db, monkeypatch):
    cursor, foreign, foreign_camp = real_db
    first = registrations.create_registration(foreign, foreign_camp, RegistrationCreate(**_valid_payload(child_first_name="ForeignSensitiveChild")))
    second = registrations.create_registration(foreign, foreign_camp, RegistrationCreate(**_valid_payload(child_first_name="ForeignWaitlistedChild")))
    assert second["status"] == "waitlist"
    user, own_org, own_camp = uuid4(), uuid4(), uuid4()
    slug = f"isolated-own-{own_org.hex}"
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'Own','own@example.com')", (own_org, slug))
        cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (own_org, user))
        cur.execute("INSERT INTO camps(id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents) VALUES (%s,%s,'summer-1','Own','2027-07-05','2027-07-09',6,12,1,1000)", (own_camp, own_org))
    monkeypatch.setattr(supabase_auth, "verify_access_token", lambda token: supabase_auth.SupabaseUser(str(user), "own@example.com"))
    headers = {"Authorization": "Bearer isolated-owner-a"}
    base = f"/admin/organizations/{slug}"
    camp_path = f"{base}/camps/summer-1"
    registration = f"{camp_path}/registrations/{first['registration_token']}"
    with TestClient(app) as client:
        assert client.get(f"{camp_path}/registrations", headers=headers).json() == []
        for suffix, payload in (("payment-status", {"payment_status": "paid"}), ("details", {"child_first_name": "Tampered", "child_last_name": "Tampered"})):
            assert client.patch(f"{registration}/{suffix}", headers=headers, json=payload).status_code == 404
        assert client.post(f"{registration}/cancel", headers=headers).status_code == 404
        promoted = client.post(f"{camp_path}/waitlist/promote", headers=headers)
        assert promoted.status_code == 200
        assert promoted.json()["promoted"] is None
        exports = (
            (f"{camp_path}/export.xlsx", ("participants", "payments", "waitlist")),
            (f"{base}/export.xlsx", ("payments", "waitlist")),
        )
        for endpoint, views in exports:
            for view in views:
                response = client.get(endpoint, headers=headers, params={"view": view, "tokens": str(first["registration_token"])})
                assert response.status_code == 200, (endpoint, view, response.status_code)
                with ZipFile(BytesIO(response.content)) as archive:
                    xml = b"".join(archive.read(name) for name in archive.namelist() if name.endswith(".xml"))
                assert b"ForeignSensitiveChild" not in xml
                assert b"ForeignWaitlistedChild" not in xml
    with cursor() as cur:
        cur.execute("SELECT child_first_name,status,payment_status FROM camp_registrations WHERE registration_token=%s", (first["registration_token"],))
        row = cur.fetchone()
        assert row == {"child_first_name": "ForeignSensitiveChild", "status": "registered", "payment_status": "open"}
        cur.execute("SELECT status FROM camp_registrations WHERE registration_token=%s", (second["registration_token"],))
        assert cur.fetchone()["status"] == "waitlist"
