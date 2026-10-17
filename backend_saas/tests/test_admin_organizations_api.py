from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import organizations
from app.repositories.organizations import OrganizationSlugConflictError

from .auth_helpers import org_admin_headers, owner_headers as _auth_headers

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


def test_create_organization_passes_legal_address_through(monkeypatch):
    """MVP-Oberflächenauftrag, Blocker "Impressum/Datenschutz pro Verein":
    legal_address muss vom Request bis in die Repository-Funktion
    durchgereicht werden — sonst bleibt das neue Feld für die Einrichtung
    unbenutzbar, egal was das Formular anzeigt."""
    captured = {}

    def _create(data):
        captured["legal_address"] = data.legal_address
        return _org_row(data.slug, legal_address=data.legal_address)

    monkeypatch.setattr(organizations, "create_organization", _create)
    headers = _auth_headers()
    payload = {**VALID_PAYLOAD, "legal_address": "Musterstraße 1\n12345 Musterstadt"}

    with TestClient(app) as client:
        response = client.post("/admin/organizations", json=payload, headers=headers)

    assert response.status_code == 201
    assert captured["legal_address"] == "Musterstraße 1\n12345 Musterstadt"
    assert response.json()["legal_address"] == "Musterstraße 1\n12345 Musterstadt"


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


def test_org_admin_can_read_own_organization(monkeypatch):
    other_org_id = uuid4()
    monkeypatch.setattr(
        organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=other_org_id)
    )
    headers = org_admin_headers(organization_id=str(other_org_id))

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc", headers=headers)

    assert response.status_code == 200


def test_org_admin_cannot_read_a_different_organization(monkeypatch):
    """Paket A: 'org_admin A kann Org B weder lesen noch ändern noch
    exportieren.' — this org_admin's membership names a different
    organization_id than the one demo-fc actually resolves to."""
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=uuid4()))
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc", headers=headers)

    assert response.status_code == 403


def test_org_admin_cannot_update_a_different_organization(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=uuid4()))
    monkeypatch.setattr(organizations, "update_organization", lambda slug, data: _org_row(slug))
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.patch("/admin/organizations/demo-fc", json={"name": "Hijacked"}, headers=headers)

    assert response.status_code == 403


def test_org_admin_cannot_export_a_different_organization(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug, id=uuid4()))
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc/export.xlsx", headers=headers)

    assert response.status_code == 403


def test_org_admin_cannot_list_all_organizations(monkeypatch):
    """require_platform_owner, not require_org_access — an org_admin has no
    legitimate reason to see the platform's tenant list at all."""
    monkeypatch.setattr(organizations, "list_organizations", lambda: [_org_row("club-a")])
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.get("/admin/organizations", headers=headers)

    assert response.status_code == 403


def test_org_admin_cannot_create_organizations(monkeypatch):
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.post("/admin/organizations", json=VALID_PAYLOAD, headers=headers)

    assert response.status_code == 403


def test_platform_owner_can_read_any_organization(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org_row(slug))
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.get("/admin/organizations/demo-fc", headers=headers)

    assert response.status_code == 200
