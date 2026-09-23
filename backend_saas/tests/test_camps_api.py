from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.repositories import camps, organizations
from app.tenancy import TenantContext


def _org_row(slug: str, plan_status: str = "active", site_published: bool = True) -> dict:
    return {
        "id": uuid4(),
        "slug": slug,
        "name": "Demo FC",
        "legal_name": None,
        "contact_email": "demo@example.com",
        "contact_phone": None,
        "logo_url": None,
        "primary_color": None,
        "plan_status": plan_status,
        "site_published": site_published,
    }


def _camp_row(slug: str, **overrides) -> dict:
    base = {
        "slug": slug,
        "title": "Summer Camp — Week 1",
        "start_date": date(2027, 7, 5),
        "end_date": date(2027, 7, 9),
        "registration_start": None,
        "registration_end": None,
        "age_min": 6,
        "age_max": 12,
        "capacity": 20,
        "price_cents": 12900,
        "currency": "EUR",
        "registered_count": 0,
        "waitlist_count": 0,
    }
    base.update(overrides)
    return base


def _patch_active_org(monkeypatch, slug: str = "demo-fc") -> None:
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda s: _org_row(s))


def test_list_camps_returns_published_camps(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(camps, "list_published_camps", lambda tenant: [_camp_row("summer-1")])

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["slug"] == "summer-1"


def test_list_camps_response_has_no_internal_ids(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(camps, "list_published_camps", lambda tenant: [_camp_row("summer-1")])

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps")

    body = response.json()[0]
    assert "organization_id" not in body
    assert "id" not in body


def test_list_camps_empty_when_none_published(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(camps, "list_published_camps", lambda tenant: [])

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps")

    assert response.status_code == 200
    assert response.json() == []


def test_list_camps_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/does-not-exist/camps")

    assert response.status_code == 404


def test_list_camps_uses_resolved_tenant_not_raw_slug(monkeypatch):
    _patch_active_org(monkeypatch, "academy-a")
    captured = {}

    def fake_list_published_camps(tenant):
        captured["tenant"] = tenant
        return []

    monkeypatch.setattr(camps, "list_published_camps", fake_list_published_camps)

    with TestClient(app) as client:
        client.get("/api/v1/organizations/academy-a/camps")

    assert isinstance(captured["tenant"], TenantContext)
    assert captured["tenant"].slug == "academy-a"


def test_get_camp_returns_published_camp(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(
        camps, "get_published_camp_by_slug", lambda tenant, camp_slug: _camp_row(camp_slug)
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/summer-1")

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "summer-1"
    assert "organization_id" not in body


def test_get_camp_unknown_slug_returns_404(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(camps, "get_published_camp_by_slug", lambda tenant, camp_slug: None)

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/does-not-exist")

    assert response.status_code == 404


def test_get_camp_non_published_indistinguishable_from_missing(monkeypatch):
    # The repository query filters status='published' at the SQL level, so
    # a draft/closed/archived camp is None here exactly like a genuinely
    # unknown slug — see repositories/camps.py's docstring.
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(camps, "get_published_camp_by_slug", lambda tenant, camp_slug: None)

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/draft-camp")

    assert response.status_code == 404
    assert response.json() == {"detail": "Camp not found"}


def test_get_camp_organization_unknown_returns_404_before_camp_lookup(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)
    called = {"count": 0}

    def fake_get_published_camp_by_slug(tenant, camp_slug):
        called["count"] += 1
        return _camp_row(camp_slug)

    monkeypatch.setattr(camps, "get_published_camp_by_slug", fake_get_published_camp_by_slug)

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/does-not-exist/camps/summer-1")

    assert response.status_code == 404
    assert called["count"] == 0


def test_get_camp_passes_resolved_tenant_and_exact_camp_slug(monkeypatch):
    _patch_active_org(monkeypatch, "academy-a")
    captured = {}

    def fake_get_published_camp_by_slug(tenant, camp_slug):
        captured["tenant"] = tenant
        captured["camp_slug"] = camp_slug
        return _camp_row(camp_slug)

    monkeypatch.setattr(camps, "get_published_camp_by_slug", fake_get_published_camp_by_slug)

    with TestClient(app) as client:
        client.get("/api/v1/organizations/academy-a/camps/summer-1")

    assert isinstance(captured["tenant"], TenantContext)
    assert captured["tenant"].slug == "academy-a"
    assert captured["camp_slug"] == "summer-1"


def test_registration_open_true_when_no_window(monkeypatch):
    _patch_active_org(monkeypatch)
    monkeypatch.setattr(
        camps, "get_published_camp_by_slug", lambda tenant, camp_slug: _camp_row(camp_slug)
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/summer-1")

    assert response.json()["registration_open"] is True


def test_registration_open_false_before_window(monkeypatch):
    _patch_active_org(monkeypatch)
    future = datetime.now(timezone.utc) + timedelta(days=10)
    monkeypatch.setattr(
        camps,
        "get_published_camp_by_slug",
        lambda tenant, camp_slug: _camp_row(camp_slug, registration_start=future),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/summer-1")

    assert response.json()["registration_open"] is False


def test_registration_open_false_after_window(monkeypatch):
    _patch_active_org(monkeypatch)
    past = datetime.now(timezone.utc) - timedelta(days=10)
    monkeypatch.setattr(
        camps,
        "get_published_camp_by_slug",
        lambda tenant, camp_slug: _camp_row(camp_slug, registration_end=past),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/summer-1")

    assert response.json()["registration_open"] is False


def test_registration_open_true_within_window(monkeypatch):
    _patch_active_org(monkeypatch)
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(
        camps,
        "get_published_camp_by_slug",
        lambda tenant, camp_slug: _camp_row(
            camp_slug,
            registration_start=now - timedelta(days=1),
            registration_end=now + timedelta(days=1),
        ),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/organizations/demo-fc/camps/summer-1")

    assert response.json()["registration_open"] is True
