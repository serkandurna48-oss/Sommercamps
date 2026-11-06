"""Admin hard delete of one registration (camps and training sessions)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import camps as camps_repo
from app.repositories import organizations, platform_roles
from app.repositories import registrations as registrations_repo
from app.repositories.registrations import RegistrationNotFoundError, RegistrationPaidOnlineError

from .auth_helpers import org_admin_headers, owner_headers
from .test_admin_registrations_api import _camp_row, _org_row
from .test_review_postgres import local_database, real_db  # noqa: F401 - fixtures
from .test_registrations_api import _valid_payload

URL = "/admin/organizations/demo-fc/camps/summer-1/registrations/{token}"


@pytest.fixture
def audit(monkeypatch):
    entries = []
    monkeypatch.setattr(platform_roles, "write_audit_log", lambda **kw: entries.append(kw))
    return entries


def _setup(monkeypatch):
    org = _org_row()
    camp = _camp_row(org["id"])
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    return org, camp


def test_delete_requires_login():
    with TestClient(app) as client:
        assert client.delete(URL.format(token=uuid4())).status_code == 401


def test_delete_denies_admin_of_another_organization(monkeypatch):
    org, _ = _setup(monkeypatch)
    headers = org_admin_headers(str(uuid4()))
    monkeypatch.setattr(
        registrations_repo, "delete_registration_and_promote_next",
        lambda *a: pytest.fail("foreign admin reached the repository"),
    )
    with TestClient(app) as client:
        assert client.delete(URL.format(token=uuid4()), headers=headers).status_code == 403


def test_delete_success_for_org_admin_with_promotion_and_clean_audit(monkeypatch, audit):
    org, camp = _setup(monkeypatch)
    token, promoted_token = uuid4(), uuid4()
    seen = {}

    def _delete(tenant, camp_id, reg_token):
        seen.update(org=tenant.organization_id, camp=camp_id, token=reg_token)
        return {
            "deleted_status": "registered", "deleted_payment_status": "open", "checkout": None,
            "promoted": {"id": uuid4(), "registration_token": promoted_token, "status": "registered", "payment_status": "open"},
        }

    monkeypatch.setattr(registrations_repo, "delete_registration_and_promote_next", _delete)
    monkeypatch.setattr("app.notifications.sending.send_status_change_notification", lambda *a: None)
    headers = org_admin_headers(str(org["id"]))
    with TestClient(app) as client:
        response = client.delete(URL.format(token=token), headers=headers)

    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert response.json()["promoted"]["status"] == "registered"
    assert seen == {"org": org["id"], "camp": camp["id"], "token": token}
    assert len(audit) == 1
    assert audit[0]["action"] == "registration.deleted"
    assert audit[0]["metadata"] == {"status": "registered", "payment_status": "open", "promoted": True}
    assert audit[0]["target_id"] == str(token)


def test_delete_paid_online_returns_409_with_hint(monkeypatch, audit):
    _setup(monkeypatch)

    def _raise(tenant, camp_id, token):
        raise RegistrationPaidOnlineError(token)

    monkeypatch.setattr(registrations_repo, "delete_registration_and_promote_next", _raise)
    with TestClient(app) as client:
        response = client.delete(URL.format(token=uuid4()), headers=owner_headers())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "paid_online"
    assert "Erst erstatten oder stornieren" in response.json()["detail"]["message"]
    assert audit == []


def test_delete_unknown_registration_returns_404(monkeypatch, audit):
    _setup(monkeypatch)

    def _raise(tenant, camp_id, token):
        raise RegistrationNotFoundError(token)

    monkeypatch.setattr(registrations_repo, "delete_registration_and_promote_next", _raise)
    with TestClient(app) as client:
        assert client.delete(URL.format(token=uuid4()), headers=owner_headers()).status_code == 404
    assert audit == []


# --- real Postgres: scoping, paid-online guard, capacity ------------------


def _book(tenant, camp, **overrides):
    from app.schemas import RegistrationCreate

    return registrations_repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload(**overrides)))


def _count(cursor, tenant):
    with cursor() as cur:
        cur.execute("select count(*) as n from camp_registrations where organization_id = %s", (tenant.organization_id,))
        return cur.fetchone()["n"]


def test_repo_delete_promotes_waitlist_and_removes_row(real_db):
    cursor, tenant, camp = real_db
    first = _book(tenant, camp)
    second = _book(tenant, camp, child_first_name="Second")
    assert (first["status"], second["status"]) == ("registered", "waitlist")

    result = registrations_repo.delete_registration_and_promote_next(tenant, camp.id, first["registration_token"])

    assert result["promoted"]["registration_token"] == second["registration_token"]
    assert _count(cursor, tenant) == 1
    with pytest.raises(RegistrationNotFoundError):
        registrations_repo.delete_registration_and_promote_next(tenant, camp.id, first["registration_token"])


def test_repo_delete_waitlisted_frees_nothing(real_db):
    cursor, tenant, camp = real_db
    _book(tenant, camp)
    waiting = _book(tenant, camp, child_first_name="Second")
    result = registrations_repo.delete_registration_and_promote_next(tenant, camp.id, waiting["registration_token"])
    assert result["promoted"] is None
    assert _count(cursor, tenant) == 1


@pytest.mark.parametrize("column", ["payment_method = 'online'", "stripe_payment_intent_id = 'pi_test'"])
def test_repo_delete_blocks_registration_paid_online(real_db, column):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    with cursor() as cur:
        cur.execute(f"update camp_registrations set payment_status = 'paid', {column} where registration_token = %s", (reg["registration_token"],))
    with pytest.raises(RegistrationPaidOnlineError):
        registrations_repo.delete_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    assert _count(cursor, tenant) == 1


def test_repo_delete_allows_refunded_online_payment(real_db):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    with cursor() as cur:
        cur.execute("update camp_registrations set payment_status = 'refunded', payment_method = 'online' where registration_token = %s", (reg["registration_token"],))
    registrations_repo.delete_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    assert _count(cursor, tenant) == 0


def test_repo_delete_is_tenant_and_camp_scoped(real_db):
    from uuid import uuid4 as new_id
    from app.tenancy import TenantContext

    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    foreign = TenantContext(new_id(), "other", "Other", "active", tenant.modules)
    with pytest.raises(RegistrationNotFoundError):
        registrations_repo.delete_registration_and_promote_next(foreign, camp.id, reg["registration_token"])
    with pytest.raises(RegistrationNotFoundError):
        registrations_repo.delete_registration_and_promote_next(tenant, new_id(), reg["registration_token"])
    assert _count(cursor, tenant) == 1
