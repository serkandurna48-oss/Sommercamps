"""The platform owner has no organization_members row for any club and must still
operate every club's admin surface (real routes, repositories and migrations)."""

from __future__ import annotations

import re
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app

from .test_review_postgres import local_database, real_db  # noqa: F401 - fixtures


@pytest.fixture
def identities(real_db, monkeypatch):
    cursor, tenant, _ = real_db
    owner, member = uuid4(), uuid4()
    with cursor() as cur:
        for user_id in (owner, member):
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO platform_owners(user_id) VALUES (%s)", (owner,))
        cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (tenant.organization_id, member))
    users = {"owner": owner, "member": member}
    monkeypatch.setattr(supabase_auth, "verify_access_token", lambda t: supabase_auth.SupabaseUser(str(users[t]), f"{t}@example.com"))
    return cursor, tenant


def _call(client, who, method, path, **kwargs):
    return client.request(method, path, headers={"Authorization": f"Bearer {who}"}, **kwargs)


def test_owner_reads_every_org_admin_route_exactly_like_the_clubs_own_admin(identities):
    _, tenant = identities
    compared = 0
    with TestClient(app) as client:
        for template, operations in app.openapi()["paths"].items():
            if "get" not in operations or "{organization_slug}" not in template or not template.startswith("/admin"):
                continue
            if template.startswith("/admin/platform/"):
                continue  # owner-only by design (e.g. fee rules), members get 403
            path = template.replace("{organization_slug}", tenant.slug).replace("{camp_slug}", "summer-1")
            path = re.sub(r"\{[^}]+\}", str(uuid4()), path)
            owner = _call(client, "owner", "GET", path)
            member = _call(client, "member", "GET", path)
            assert owner.status_code == member.status_code, (template, owner.status_code, member.status_code)
            assert owner.status_code != 403, template
            compared += 1
    assert compared >= 10


def test_owner_configures_a_club_without_membership(identities):
    cursor, tenant = identities
    admin = f"/admin/organizations/{tenant.slug}"
    with TestClient(app) as client:
        me = _call(client, "owner", "GET", "/admin/me").json()
        assert me["is_platform_owner"] is True and me["admin_organization_slugs"] == []

        saved = _call(client, "owner", "PATCH", admin, json={"name": "Neu", "contact_email": "neu@example.com", "intro_heading": "Hallo", "registration_questions": []})
        assert saved.status_code == 200 and saved.json()["intro_heading"] == "Hallo"
        assert _call(client, "owner", "PATCH", admin, json={"billing_notes": "intern"}).status_code == 200

        camp = {"slug": "herbst", "title": "Herbst", "start_date": "2027-10-05", "end_date": "2027-10-09", "age_min": 6, "age_max": 12, "capacity": 10, "price_cents": 5000}
        # Starter blocks any further camp (the fixture already has one); Verein lifts the limit.
        assert _call(client, "owner", "POST", f"{admin}/camps", json=camp).status_code == 409
        with cursor() as cur:
            cur.execute("INSERT INTO organization_fee_rules (organization_id, plan, percent, valid_from) "
                        "VALUES (%s, 'verein', 4.90, date '2026-01-01')", (tenant.organization_id,))
        assert _call(client, "owner", "POST", f"{admin}/camps", json=camp).status_code == 201
        assert _call(client, "owner", "PATCH", f"{admin}/camps/herbst", json={"status": "published", "capacity": 12}).json()["capacity"] == 12

        # The club's own admin may not touch the owner-only switch.
        assert _call(client, "member", "PATCH", f"/admin/platform/organizations/{tenant.slug}/modules", json={"modules": ["camps", "trainings"]}).status_code == 403
        assert _call(client, "owner", "PATCH", f"/admin/platform/organizations/{tenant.slug}/modules", json={"modules": ["camps"]}).status_code == 200

    with cursor() as cur:
        cur.execute("select intro_heading, billing_notes from organizations where id = %s", (tenant.organization_id,))
        row = cur.fetchone()
    assert (row["intro_heading"], row["billing_notes"]) == ("Hallo", "intern")


def test_disabled_module_answers_owner_with_the_code_the_ui_turns_into_the_module_switch(identities):
    """Root cause of the "owner cannot configure JK" report: a club without the module gets
    403 module_disabled for owner and club admin alike; the frontend must lead the owner to the
    platform switch (ModuleDisabledBody) instead of telling them to contact CampsPilot."""
    _, tenant = identities
    base = f"/admin/organizations/{tenant.slug}"
    with TestClient(app) as client:
        assert _call(client, "owner", "PATCH", f"/admin/platform/organizations/{tenant.slug}/modules", json={"modules": ["camps"]}).status_code == 200
        for path in (f"{base}/training-offers", f"{base}/players", f"{base}/club-members"):
            denied = _call(client, "owner", "GET", path)
            assert denied.status_code == 403 and denied.json()["detail"]["code"] == "module_disabled", path
        assert _call(client, "owner", "PATCH", f"/admin/platform/organizations/{tenant.slug}/modules", json={"modules": ["camps", "trainings", "members", "players"]}).status_code == 200
        for path in (f"{base}/training-offers", f"{base}/players", f"{base}/club-members"):
            assert _call(client, "owner", "GET", path).status_code == 200, path
