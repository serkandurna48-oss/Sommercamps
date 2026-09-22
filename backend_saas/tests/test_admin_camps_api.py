from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.repositories import camps as camps_repo
from app.repositories import organizations
from app.repositories.camps import CampSlugConflictError

VALID_PAYLOAD = {
    "slug": "summer-1",
    "title": "Summer Camp Week 1",
    "start_date": "2027-07-05",
    "end_date": "2027-07-09",
    "age_min": 6,
    "age_max": 12,
    "capacity": 20,
    "price_cents": 14900,
}


def _org_row(slug: str = "demo-fc", plan_status: str = "pilot") -> dict:
    return {
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


def _camp_row(organization_id, slug: str = "summer-1", **overrides) -> dict:
    base = {
        "id": uuid4(),
        "organization_id": organization_id,
        "slug": slug,
        "title": "Summer Camp Week 1",
        "start_date": "2027-07-05",
        "end_date": "2027-07-09",
        "registration_start": None,
        "registration_end": None,
        "age_min": 6,
        "age_max": 12,
        "capacity": 20,
        "price_cents": 14900,
        "currency": "EUR",
        "status": "draft",
    }
    base.update(overrides)
    return base


def _auth_headers() -> dict:
    with TestClient(app) as client:
        token = client.post("/admin/login", json={"password": "test-admin-password"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_create_camp_success_defaults_to_draft(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "create_camp", lambda org_id, data: _camp_row(org_id))
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations/demo-fc/camps", json=VALID_PAYLOAD, headers=headers
        )

    assert response.status_code == 201
    assert response.json()["status"] == "draft"


def test_create_camp_under_suspended_org_still_succeeds(monkeypatch):
    """The admin path resolves organizations via get_organization_by_slug,
    not resolve_tenant — a suspended org must still be manageable."""
    org = _org_row(plan_status="suspended")
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "create_camp", lambda org_id, data: _camp_row(org_id))
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations/demo-fc/camps", json=VALID_PAYLOAD, headers=headers
        )

    assert response.status_code == 201


def test_create_camp_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations/does-not-exist/camps", json=VALID_PAYLOAD, headers=headers
        )

    assert response.status_code == 404


def test_create_camp_duplicate_slug_returns_409(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)

    def _raise(org_id, data):
        raise CampSlugConflictError(org_id, data.slug)

    monkeypatch.setattr(camps_repo, "create_camp", _raise)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations/demo-fc/camps", json=VALID_PAYLOAD, headers=headers
        )

    assert response.status_code == 409


def test_create_camp_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.post("/admin/organizations/demo-fc/camps", json=VALID_PAYLOAD)

    assert response.status_code == 401
