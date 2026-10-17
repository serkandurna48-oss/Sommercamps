from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app
from app.registration_lifecycle import InvalidStatusTransitionError
from app.repositories import camps as camps_repo
from app.repositories import organizations
from app.repositories import registrations as registrations_repo
from app.repositories.registrations import RegistrationNotFoundError

from .auth_helpers import owner_headers as _auth_headers


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


# ---------------------------------------------------------------------------
# POST .../waitlist/promote
# ---------------------------------------------------------------------------


def test_promote_waitlist_success(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    promoted = {"registration_token": uuid4(), "status": "registered", "payment_status": "open"}
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(registrations_repo, "promote_next_waitlisted_registration", lambda tenant, camp_id: promoted)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post("/admin/organizations/demo-fc/camps/summer-1/waitlist/promote", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["promoted"]["status"] == "registered"


def test_promote_waitlist_nothing_to_promote_returns_null_not_error(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(registrations_repo, "promote_next_waitlisted_registration", lambda tenant, camp_id: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post("/admin/organizations/demo-fc/camps/summer-1/waitlist/promote", headers=headers)

    assert response.status_code == 200
    assert response.json() == {"promoted": None}


def test_promote_waitlist_unknown_camp_returns_404(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post("/admin/organizations/demo-fc/camps/does-not-exist/waitlist/promote", headers=headers)

    assert response.status_code == 404


def test_promote_waitlist_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.post("/admin/organizations/demo-fc/camps/summer-1/waitlist/promote")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# POST .../registrations/{id}/cancel
# ---------------------------------------------------------------------------


def test_cancel_registration_success_with_promotion(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    registration_token = uuid4()
    cancelled = {"id": uuid4(), "registration_token": registration_token, "status": "cancelled", "payment_status": "open"}
    promoted = {"registration_token": uuid4(), "status": "registered", "payment_status": "open"}
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    captured = {}

    def _cancel(tenant, camp_id, reg_token):
        captured["camp_id"] = camp_id
        captured["reg_token"] = reg_token
        return {"cancelled": cancelled, "promoted": promoted}

    monkeypatch.setattr(registrations_repo, "cancel_registration_and_promote_next", _cancel)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/cancel", headers=headers
        )

    assert response.status_code == 200
    body = response.json()
    assert body["cancelled"]["status"] == "cancelled"
    assert body["promoted"]["status"] == "registered"
    assert captured["camp_id"] == camp["id"]
    assert captured["reg_token"] == registration_token


def test_cancel_registration_not_found_returns_404(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    registration_token = uuid4()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    def _raise(tenant, camp_id, reg_token):
        raise RegistrationNotFoundError(reg_token)

    monkeypatch.setattr(registrations_repo, "cancel_registration_and_promote_next", _raise)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/cancel", headers=headers
        )

    assert response.status_code == 404


def test_cancel_registration_wrong_camp_returns_404(monkeypatch):
    """The registration exists (same org) but under a different camp than
    the URL names — the repository raises RegistrationNotFoundError
    because its camp_id-scoped lookup finds nothing, and the endpoint must
    not distinguish this from "doesn't exist at all"."""
    org = _org_row()
    camp = _camp_row(org["id"], slug="summer-1")
    registration_token = uuid4()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    def _raise(tenant, camp_id, reg_token):
        assert camp_id == camp["id"]
        raise RegistrationNotFoundError(reg_token)

    monkeypatch.setattr(registrations_repo, "cancel_registration_and_promote_next", _raise)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/cancel", headers=headers
        )

    assert response.status_code == 404


def test_cancel_registration_already_cancelled_returns_409(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    registration_token = uuid4()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    def _raise(tenant, camp_id, reg_token):
        raise InvalidStatusTransitionError("cancelled", "cancelled")

    monkeypatch.setattr(registrations_repo, "cancel_registration_and_promote_next", _raise)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/cancel", headers=headers
        )

    assert response.status_code == 409


def test_cancel_registration_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/cancel")

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH .../registrations/{id}/payment-status
# ---------------------------------------------------------------------------


def test_update_payment_status_success(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    registration_token = uuid4()
    updated = _registration_row(registration_token=registration_token, payment_status="paid")
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    captured = {}

    def _update(org_id, camp_id, reg_token, status):
        captured["camp_id"] = camp_id
        captured["reg_token"] = reg_token
        return updated

    monkeypatch.setattr(registrations_repo, "update_payment_status", _update)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/payment-status",
            json={"payment_status": "paid"},
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["payment_status"] == "paid"
    assert captured["camp_id"] == camp["id"]
    assert captured["reg_token"] == registration_token


def test_update_payment_status_rejects_invalid_value(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/payment-status",
            json={"payment_status": "not-a-real-status"},
            headers=headers,
        )

    assert response.status_code == 422


def test_update_payment_status_rejects_cancelled(monkeypatch):
    """'cancelled' is a valid DB value but deliberately not admin-settable
    (see admin_schemas.PaymentStatusUpdate's docstring) — nothing currently
    sets payment_status automatically on registration cancellation, so
    manually typing 'cancelled' here would only ever be a confusing fake."""
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/payment-status",
            json={"payment_status": "cancelled"},
            headers=headers,
        )

    assert response.status_code == 422


def test_update_payment_status_unknown_registration_returns_404(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(registrations_repo, "update_payment_status", lambda org_id, camp_id, reg_token, status: None)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/payment-status",
            json={"payment_status": "paid"},
            headers=headers,
        )

    assert response.status_code == 404


def test_update_payment_status_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/payment-status",
            json={"payment_status": "paid"},
        )

    assert response.status_code == 401


# ---------------------------------------------------------------------------
# PATCH .../registrations/{id}/details
# ---------------------------------------------------------------------------


def test_update_registration_details_success(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    registration_token = uuid4()
    updated = _registration_row(
        registration_token=registration_token,
        child_first_name="Lea",
        child_last_name="Musterkind",
        jersey_size="140",
        allergies="Nüsse",
        pickup_authorized="Oma Erika",
    )
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    captured = {}

    def _update(org_id, camp_id, reg_token, child_first_name, child_last_name, jersey_size, allergies, pickup_authorized):
        captured["camp_id"] = camp_id
        captured["reg_token"] = reg_token
        captured["child_first_name"] = child_first_name
        captured["allergies"] = allergies
        return updated

    monkeypatch.setattr(registrations_repo, "update_registration_details", _update)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/details",
            json={
                "child_first_name": "Lea",
                "child_last_name": "Musterkind",
                "jersey_size": "140",
                "allergies": "Nüsse",
                "pickup_authorized": "Oma Erika",
            },
            headers=headers,
        )

    assert response.status_code == 200
    assert response.json()["child_first_name"] == "Lea"
    assert response.json()["allergies"] == "Nüsse"
    assert captured["camp_id"] == camp["id"]
    assert captured["reg_token"] == registration_token
    assert captured["child_first_name"] == "Lea"
    assert captured["allergies"] == "Nüsse"


def test_update_registration_details_rejects_blank_name(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/details",
            json={"child_first_name": "", "child_last_name": "Musterkind"},
            headers=headers,
        )

    assert response.status_code == 422


def test_update_registration_details_blank_optional_becomes_none(monkeypatch):
    """Clearing an optional field (e.g. removing an allergy note that no
    longer applies) must actually store null, not an empty string —
    matches the public registration schema's same normalization rule."""
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)

    captured = {}

    def _update(org_id, camp_id, reg_token, child_first_name, child_last_name, jersey_size, allergies, pickup_authorized):
        captured["allergies"] = allergies
        captured["jersey_size"] = jersey_size
        return _registration_row(registration_token=reg_token)

    monkeypatch.setattr(registrations_repo, "update_registration_details", _update)
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/details",
            json={"child_first_name": "Lea", "child_last_name": "Musterkind", "allergies": "   ", "jersey_size": ""},
            headers=headers,
        )

    assert response.status_code == 200
    assert captured["allergies"] is None
    assert captured["jersey_size"] is None


def test_update_registration_details_unknown_registration_returns_404(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(
        registrations_repo,
        "update_registration_details",
        lambda org_id, camp_id, reg_token, *a, **kw: None,
    )
    headers = _auth_headers()

    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/details",
            json={"child_first_name": "Lea", "child_last_name": "Musterkind"},
            headers=headers,
        )

    assert response.status_code == 404


def test_update_registration_details_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/details",
            json={"child_first_name": "Lea", "child_last_name": "Musterkind"},
        )

    assert response.status_code == 401
