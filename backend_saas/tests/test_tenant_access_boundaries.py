"""All admin/export gates using the real auth dependency chain, no external I/O."""

import pytest
from fastapi.testclient import TestClient

from app import db, supabase_auth
from app.main import app
from app.repositories import organizations, platform_roles
from .test_admin_access_matrix import ADMIN_REQUESTS, ORG_A, ORG_B
from .test_admin_organizations_api import _org_row


@pytest.mark.parametrize(("method", "path"), ADMIN_REQUESTS)
@pytest.mark.parametrize("identity", ["anonymous", "invalid-token", "admin-a", "no-membership"])
def test_real_auth_chain_denies_foreign_admin_routes(monkeypatch, method, path, identity):
    verified = []

    def verify(token):
        verified.append(token)
        if token == "invalid-token":
            raise supabase_auth.SupabaseAuthError("Synthetic invalid token")
        return supabase_auth.SupabaseUser(token, None)

    monkeypatch.setattr(supabase_auth, "verify_access_token", verify)
    monkeypatch.setattr(platform_roles, "is_platform_owner", lambda user: False)
    monkeypatch.setattr(platform_roles, "get_admin_organization_ids", lambda user: [str(ORG_A)] if user == "admin-a" else [])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=ORG_B))

    def no_business_query():
        pytest.fail("Denied request reached a business repository")

    monkeypatch.setattr(db, "get_cursor", no_business_query)
    headers = {} if identity == "anonymous" else {"Authorization": f"Bearer {identity}"}
    with TestClient(app) as client:
        response = client.request(method, path, headers=headers, json={} if method in {"POST", "PATCH"} else None)
    assert response.status_code == (401 if identity in {"anonymous", "invalid-token"} else 403)
    assert verified == ([] if identity == "anonymous" else [identity])


def test_demo_shaped_me_and_immediate_membership_revocation(monkeypatch):
    memberships = [str(ORG_A)]
    monkeypatch.setattr(supabase_auth, "verify_access_token", lambda token: supabase_auth.SupabaseUser("synthetic-demo", "demo@example.com"))
    monkeypatch.setattr(platform_roles, "is_platform_owner", lambda user: False)
    monkeypatch.setattr(platform_roles, "get_admin_organization_ids", lambda user: memberships.copy())
    monkeypatch.setattr(organizations, "get_organization_by_id", lambda org_id: _org_row("synthetic-demo", id=ORG_A))
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=ORG_A))
    with TestClient(app) as client:
        headers = {"Authorization": "Bearer synthetic-token"}
        first = client.get("/admin/me", headers=headers)
        assert first.status_code == 200
        assert first.json()["is_platform_owner"] is False
        assert first.json()["admin_organization_slugs"] == ["synthetic-demo"]
        assert client.get("/admin/organizations", headers=headers).status_code == 403
        memberships.clear()
        second = client.get("/admin/me", headers=headers)
        assert second.json()["admin_organization_slugs"] == []
        assert client.get("/admin/organizations/synthetic-demo", headers=headers).status_code == 403


def test_admin_me_requires_login():
    with TestClient(app) as client:
        assert client.get("/admin/me").status_code == 401
