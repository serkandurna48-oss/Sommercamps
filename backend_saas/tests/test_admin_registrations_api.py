from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.repositories import camps as camps_repo
from app.repositories import organizations
from app.repositories import registrations as registrations_repo


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


def _camp_row(organization_id, slug: str = "summer-1", status: str = "draft") -> dict:
    return {
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
        "status": status,
    }


def _registration_row(**overrides) -> dict:
    base = {
        "id": uuid4(),
        "registration_token": uuid4(),
        "status": "registered",
        "payment_status": "open",
        "parent_first_name": "Max",
        "parent_last_name": "Mustermann",
        "parent_email": "max@example.com",
        "parent_phone": "+49 123 456789",
        "child_first_name": "Lena",
        "child_last_name": "Mustermann",
        "child_birth_date": "2018-05-10",
        "emergency_contact_name": None,
        "emergency_contact_phone": None,
        "medical_notes": None,
        "allergies": None,
        "photo_permission": False,
        "created_at": datetime(2027, 1, 1, tzinfo=timezone.utc),
    }
    base.update(overrides)
    return base


def _auth_headers() -> dict:
    with TestClient(app) as client:
        token = client.post("/admin/login", json={"password": "test-admin-password"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_camps_includes_all_statuses(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(
        camps_repo,
        "list_camps_for_organization",
        lambda org_id: [_camp_row(org_id, "draft-camp", "draft"), _camp_row(org_id, "live-camp", "published")],
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps", headers=headers)

    assert response.status_code == 200
    statuses = {c["status"] for c in response.json()}
    assert statuses == {"draft", "published"}


def test_list_camps_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/does-not-exist/camps", headers=headers)

    assert response.status_code == 404


def test_list_camps_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps")

    assert response.status_code == 401


def test_list_registrations_success(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(
        registrations_repo,
        "list_registrations_for_camp",
        lambda org_id, camp_id: [_registration_row(status="registered"), _registration_row(status="waitlist")],
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps/summer-1/registrations", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert {r["status"] for r in body} == {"registered", "waitlist"}
    # PII fields are present for the admin view (unlike the public API)
    assert body[0]["parent_email"] == "max@example.com"


def test_list_registrations_unknown_camp_returns_404(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps/does-not-exist/registrations", headers=headers)

    assert response.status_code == 404


def test_list_registrations_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/does-not-exist/camps/summer-1/registrations", headers=headers)

    assert response.status_code == 404


def test_list_registrations_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps/summer-1/registrations")

    assert response.status_code == 401


def test_list_registrations_draft_camp_still_returns_data(monkeypatch):
    """The admin path resolves camps via get_camp_by_slug (any status), not
    get_published_camp_by_slug — a draft camp's registrations must still be
    listable (e.g. test registrations added before publishing)."""
    org = _org_row()
    camp = _camp_row(org["id"], status="draft")
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(registrations_repo, "list_registrations_for_camp", lambda org_id, camp_id: [])
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/camps/summer-1/registrations", headers=headers)

    assert response.status_code == 200
    assert response.json() == []
