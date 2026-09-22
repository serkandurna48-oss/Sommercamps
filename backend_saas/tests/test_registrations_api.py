from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import organizations
from app.repositories import registrations as registrations_repo
from app.repositories.registrations import RegistrationTarget
from app.tenancy import TenantContext

ORG_SLUG = "demo-fc"
CAMP_SLUG = "summer-1"


def _org_row(slug: str, plan_status: str = "active") -> dict:
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
    }


def _patch_org(monkeypatch, slug: str = ORG_SLUG, plan_status: str = "active") -> None:
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda s: _org_row(s, plan_status))


def _target(organization_id=None, **overrides) -> RegistrationTarget:
    base = dict(
        id=uuid4(),
        organization_id=organization_id or uuid4(),
        slug=CAMP_SLUG,
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        registration_start=None,
        registration_end=None,
        age_min=6,
        age_max=12,
        capacity=20,
        status="published",
    )
    base.update(overrides)
    return RegistrationTarget(**base)


def _valid_payload(**overrides) -> dict:
    base = {
        "parent_first_name": "Max",
        "parent_last_name": "Mustermann",
        "parent_email": "max@example.com",
        "parent_phone": "+49 123 456789",
        "child_first_name": "Lena",
        "child_last_name": "Mustermann",
        "child_birth_date": "2017-05-10",  # age 10 at 2027-07-05 start
        "emergency_contact_name": "Anna Mustermann",
        "emergency_contact_phone": "+49 987 654321",
        "medical_notes": None,
        "allergies": None,
        "photo_permission": False,
        "terms_accepted": True,
        "privacy_accepted": True,
    }
    base.update(overrides)
    return base


def _fake_created_row(**overrides) -> dict:
    base = {"registration_token": uuid4(), "status": "registered", "payment_status": "open"}
    base.update(overrides)
    return base


def _post(client: TestClient, payload: dict, org_slug: str = ORG_SLUG, camp_slug: str = CAMP_SLUG):
    return client.post(
        f"/api/v1/organizations/{org_slug}/camps/{camp_slug}/registrations", json=payload
    )


# --------------------------------------------------------------------------
# Happy path
# --------------------------------------------------------------------------


def test_valid_registration_returns_201(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 201


def test_response_contains_only_token_status_payment_status(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    body = response.json()
    assert set(body.keys()) == {"registration_token", "status", "payment_status", "payment_reference"}
    assert body["status"] == "registered"
    assert body["payment_status"] == "open"
    # deterministisch aus dem Token abgeleitet (Eltern-Flow-Auftrag Abschnitt
    # 6.4) — Bestätigungsseite und -mail können ihn unabhängig nachrechnen.
    assert body["payment_reference"] == f"CP-{body['registration_token'][:8].upper()}"


def test_response_contains_no_internal_ids(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    body = response.json()
    assert "id" not in body
    assert "organization_id" not in body
    assert "camp_id" not in body


# --------------------------------------------------------------------------
# Tenant
# --------------------------------------------------------------------------


def test_unknown_organization_returns_404(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)

    with TestClient(app) as client:
        response = _post(client, _valid_payload(), org_slug="does-not-exist")

    assert response.status_code == 404


def test_suspended_organization_returns_404(monkeypatch):
    _patch_org(monkeypatch, plan_status="suspended")

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 404


def test_camp_belonging_to_different_tenant_returns_404(monkeypatch):
    # get_registration_target's own WHERE clause excludes a camp slug that
    # only exists under a different organization_id — simulate that here
    # exactly like the real query would (None result).
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: None)

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 404


# --------------------------------------------------------------------------
# Camp
# --------------------------------------------------------------------------


def test_unknown_camp_slug_returns_404(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: None)

    with TestClient(app) as client:
        response = _post(client, _valid_payload(), camp_slug="does-not-exist")

    assert response.status_code == 404


@pytest.mark.parametrize("nonpublic_status", ["draft", "closed", "archived"])
def test_non_published_camp_not_registrable(monkeypatch, nonpublic_status):
    # get_registration_target's query filters status='published' at the SQL
    # level, so a draft/closed/archived camp is None here too — see its
    # docstring. Simulated the same way as the read API's equivalent tests.
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: None)

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 404


# --------------------------------------------------------------------------
# Registration window
# --------------------------------------------------------------------------


def test_registration_before_window_start_rejected(monkeypatch):
    _patch_org(monkeypatch)
    future = datetime.now(timezone.utc) + timedelta(days=10)
    monkeypatch.setattr(
        registrations_repo,
        "get_registration_target",
        lambda tenant, slug: _target(registration_start=future),
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 422


def test_registration_after_window_end_rejected(monkeypatch):
    _patch_org(monkeypatch)
    past = datetime.now(timezone.utc) - timedelta(days=10)
    monkeypatch.setattr(
        registrations_repo,
        "get_registration_target",
        lambda tenant, slug: _target(registration_end=past),
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 422


def test_registration_within_window_allowed(monkeypatch):
    _patch_org(monkeypatch)
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(
        registrations_repo,
        "get_registration_target",
        lambda tenant, slug: _target(
            registration_start=now - timedelta(days=1), registration_end=now + timedelta(days=1)
        ),
    )
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 201


def test_registration_without_window_bounds_allowed(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 201


# --------------------------------------------------------------------------
# Age
# --------------------------------------------------------------------------


def test_age_exactly_age_min_allowed(monkeypatch):
    _patch_org(monkeypatch)
    camp = _target(age_min=6, age_max=12)  # start_date 2027-07-05
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: camp)
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload(child_birth_date="2021-07-05"))  # exactly 6

    assert response.status_code == 201


def test_age_exactly_age_max_allowed(monkeypatch):
    _patch_org(monkeypatch)
    camp = _target(age_min=6, age_max=12)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: camp)
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload(child_birth_date="2015-07-05"))  # exactly 12

    assert response.status_code == 201


def test_age_too_young_returns_422(monkeypatch):
    _patch_org(monkeypatch)
    camp = _target(age_min=6, age_max=12)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: camp)

    with TestClient(app) as client:
        response = _post(client, _valid_payload(child_birth_date="2022-07-05"))  # age 5

    assert response.status_code == 422


def test_age_too_old_returns_422(monkeypatch):
    _patch_org(monkeypatch)
    camp = _target(age_min=6, age_max=12)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: camp)

    with TestClient(app) as client:
        response = _post(client, _valid_payload(child_birth_date="2014-07-05"))  # age 13

    assert response.status_code == 422


# --------------------------------------------------------------------------
# Consent
# --------------------------------------------------------------------------


def test_terms_not_accepted_returns_422(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())

    with TestClient(app) as client:
        response = _post(client, _valid_payload(terms_accepted=False))

    assert response.status_code == 422


def test_privacy_not_accepted_returns_422(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())

    with TestClient(app) as client:
        response = _post(client, _valid_payload(privacy_accepted=False))

    assert response.status_code == 422


def test_photo_permission_false_is_allowed(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo, "create_registration", lambda tenant, camp, data: _fake_created_row()
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload(photo_permission=False))

    assert response.status_code == 201


# --------------------------------------------------------------------------
# Capacity
# --------------------------------------------------------------------------


def test_capacity_available_creates_registered(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo,
        "create_registration",
        lambda tenant, camp, data: _fake_created_row(status="registered"),
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 201
    assert response.json()["status"] == "registered"


def test_capacity_full_creates_waitlist_with_201(monkeypatch):
    """
    Since CP-S406, a full camp no longer produces a 409 in the public
    flow — create_registration itself decides 'registered' vs 'waitlist'
    (see app/repositories/registrations.py); the router just returns
    whatever it got, still as 201. This test simulates the "full" case the
    same way the real repository would signal it: by returning a row with
    status='waitlist' rather than raising.
    """
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo,
        "create_registration",
        lambda tenant, camp, data: _fake_created_row(status="waitlist"),
    )

    with TestClient(app) as client:
        response = _post(client, _valid_payload())

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "waitlist"
    assert body["payment_status"] == "open"


def test_repeated_requests_when_full_all_return_waitlist(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    monkeypatch.setattr(
        registrations_repo,
        "create_registration",
        lambda tenant, camp, data: _fake_created_row(status="waitlist"),
    )

    with TestClient(app) as client:
        responses = [_post(client, _valid_payload()) for _ in range(3)]

    assert all(r.status_code == 201 for r in responses)
    assert all(r.json()["status"] == "waitlist" for r in responses)


# --------------------------------------------------------------------------
# Security — no client-supplied organization_id/camp_id can influence anything
# --------------------------------------------------------------------------


def test_organization_id_in_body_is_rejected_by_schema(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())

    with TestClient(app) as client:
        response = _post(client, _valid_payload(organization_id=str(uuid4())))

    assert response.status_code == 422


def test_camp_id_in_body_is_rejected_by_schema(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())

    with TestClient(app) as client:
        response = _post(client, _valid_payload(camp_id=str(uuid4())))

    assert response.status_code == 422


def test_created_registration_uses_resolved_tenant_and_camp(monkeypatch):
    resolved_org_id = uuid4()
    _patch_org(monkeypatch, slug="academy-a")
    camp = _target(organization_id=resolved_org_id)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: camp)

    captured = {}

    def fake_create_registration(tenant, camp_arg, data):
        captured["tenant"] = tenant
        captured["camp"] = camp_arg
        return _fake_created_row()

    monkeypatch.setattr(registrations_repo, "create_registration", fake_create_registration)

    with TestClient(app) as client:
        _post(client, _valid_payload(), org_slug="academy-a")

    assert isinstance(captured["tenant"], TenantContext)
    assert captured["tenant"].slug == "academy-a"
    assert captured["camp"] is camp
    assert captured["camp"].organization_id == resolved_org_id
