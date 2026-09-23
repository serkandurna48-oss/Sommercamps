from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import organizations
from app.repositories.organizations import OrganizationSlugConflictError

VALID_PAYLOAD = {
    "slug": "demo-fc",
    "name": "Demo Football Academy",
    "contact_email": "demo@example.com",
}


def _org_row(slug: str = "demo-fc", plan_status: str = "pilot", **overrides) -> dict:
    base = {
        "id": uuid4(),
        "slug": slug,
        "name": "Demo Football Academy",
        "legal_name": None,
        "contact_email": "demo@example.com",
        "contact_phone": None,
        "logo_url": None,
        "primary_color": None,
        "plan_status": plan_status,
    }
    base.update(overrides)
    return base


def _auth_headers() -> dict:
    with TestClient(app) as client:
        token = client.post("/admin/login", json={"password": "test-admin-password"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_organization_success_returns_201(monkeypatch):
    monkeypatch.setattr(organizations, "create_organization", lambda data: _org_row(data.slug))
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post("/admin/organizations", json=VALID_PAYLOAD, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["slug"] == "demo-fc"
    assert body["plan_status"] == "pilot"
    assert "id" in body  # admin view, unlike the public OrganizationPublic


def test_create_organization_duplicate_slug_returns_409(monkeypatch):
    def _raise(data):
        raise OrganizationSlugConflictError(data.slug)

    monkeypatch.setattr(organizations, "create_organization", _raise)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post("/admin/organizations", json=VALID_PAYLOAD, headers=headers)

    assert response.status_code == 409


def test_create_organization_invalid_slug_returns_422():
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations",
            json={**VALID_PAYLOAD, "slug": "Not A Valid Slug"},
            headers=headers,
        )

    assert response.status_code == 422


def test_create_organization_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.post("/admin/organizations", json=VALID_PAYLOAD)

    assert response.status_code == 401


def test_patch_organization_success_returns_updated_row(monkeypatch):
    monkeypatch.setattr(
        organizations,
        "update_organization",
        lambda slug, data: _org_row(slug, name="Renamed FC"),
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            "/admin/organizations/demo-fc", json={"name": "Renamed FC"}, headers=headers
        )

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed FC"


def test_patch_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "update_organization", lambda slug, data: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            "/admin/organizations/does-not-exist", json={"name": "X"}, headers=headers
        )

    assert response.status_code == 404


def test_list_organizations_returns_camp_count(monkeypatch):
    rows = [_org_row("club-a", camp_count=3), _org_row("club-b", camp_count=0)]
    monkeypatch.setattr(organizations, "list_organizations", lambda: rows)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert [o["slug"] for o in body] == ["club-a", "club-b"]
    assert body[0]["camp_count"] == 3
    assert body[1]["camp_count"] == 0


def test_list_organizations_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/organizations")

    assert response.status_code == 401


def test_get_single_organization_returns_draft_even_when_unpublished(monkeypatch):
    """The admin single-org GET must work regardless of site_published —
    it's what powers the platform console's operator preview of a draft
    organization, which the public GET would 404 on by design."""
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, site_published=False),
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc", headers=headers)

    assert response.status_code == 200
    assert response.json()["site_published"] is False


def test_unpublished_organization_reachable_for_admin_but_hidden_publicly(monkeypatch):
    """Regression guard for the exact bug found during the Richtung-C
    onboarding walkthrough (2026-09-23): the frontend's org-admin loader
    (orgAdminData.ts) called the *public* organization endpoint instead of
    the admin one, so any freshly-created draft organization could never
    open its own dashboard/Teilnehmer/Zahlungen/etc. — login redirected
    straight back to login. The backend contract itself was always correct
    (see test_organizations_api.test_get_organization_unpublished_returns_404
    and test_get_single_organization_returns_draft_even_when_unpublished
    above, which cover each side individually); this test pins both halves
    of the contract together against the *same* org state, in one place, so
    a future change can't satisfy one side while silently breaking the
    other."""
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, site_published=False),
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        admin_response = client.get("/admin/organizations/demo-fc", headers=headers)
        public_response = client.get("/api/v1/organizations/demo-fc")

    assert admin_response.status_code == 200
    assert admin_response.json()["site_published"] is False

    assert public_response.status_code == 404
    assert public_response.json() == {"detail": "Organization not found"}


def test_get_single_organization_unknown_slug_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/does-not-exist", headers=headers)

    assert response.status_code == 404


def test_get_single_organization_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc")

    assert response.status_code == 401
