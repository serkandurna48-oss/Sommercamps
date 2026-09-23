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
