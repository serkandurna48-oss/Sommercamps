from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import organizations


def _org_row(slug: str, plan_status: str, **overrides) -> dict:
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
        "site_published": True,
    }
    base.update(overrides)
    return base


@pytest.mark.parametrize("plan_status", ["pilot", "active"])
def test_get_organization_active_plan_returns_200(monkeypatch, plan_status):
    monkeypatch.setattr(
        organizations, "get_organization_by_slug", lambda slug: _org_row(slug, plan_status)
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc")

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "demo-fc"
    assert body["name"] == "Demo Football Academy"


def test_get_organization_unknown_slug_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/does-not-exist")

    assert response.status_code == 404


@pytest.mark.parametrize("plan_status", ["suspended", "cancelled"])
def test_get_organization_inactive_plan_returns_404(monkeypatch, plan_status):
    monkeypatch.setattr(
        organizations, "get_organization_by_slug", lambda slug: _org_row(slug, plan_status)
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc")

    assert response.status_code == 404
    # Same body shape as a genuinely unknown org — no hint of the real reason.
    assert response.json() == {"detail": "Organization not found"}


def test_get_organization_unpublished_returns_404(monkeypatch):
    """An operator-side draft (site_published=false, plan_status otherwise
    fine) must 404 exactly like an unknown or inactive org — Betreiber-
    Builder requirement: 'Unvollständige Entwürfe vor öffentlichem Zugriff
    schützen'."""
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, "pilot", site_published=False),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc")

    assert response.status_code == 404
    assert response.json() == {"detail": "Organization not found"}


def test_get_organization_response_excludes_internal_fields(monkeypatch):
    monkeypatch.setattr(
        organizations, "get_organization_by_slug", lambda slug: _org_row(slug, "active")
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc")

    body = response.json()
    assert "id" not in body
    assert "plan_status" not in body


def test_get_organization_response_includes_only_declared_public_fields(monkeypatch):
    monkeypatch.setattr(
        organizations, "get_organization_by_slug", lambda slug: _org_row(slug, "active")
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc")

    assert set(response.json().keys()) == {
        "slug",
        "name",
        "legal_name",
        "contact_email",
        "contact_phone",
        "logo_url",
        "primary_color",
        "theme",
        "iban",
    }
