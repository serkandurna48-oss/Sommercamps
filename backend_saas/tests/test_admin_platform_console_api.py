"""
Tests for the CEO-console-only endpoints added in feat/platform-foundation
(/admin/stats, /admin/registrations, /admin/audit-log,
/admin/organizations/{slug}/members) — every one platform_owner-only
except the members GET, which an org_admin may also use for their own
organization. See app/routers/admin.py's "CEO-console-only endpoints"
section.
"""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.repositories import organizations, platform_roles
from app.repositories import registrations as registrations_repo
from app.repositories import platform_stats as platform_stats_repo

from .auth_helpers import org_admin_headers, owner_headers


def _org_row(slug: str = "demo-fc", **overrides) -> dict:
    base = {"id": uuid4(), "slug": slug, "name": "Demo Football Academy", "plan_status": "pilot"}
    base.update(overrides)
    return base


def _stats_row(**overrides) -> dict:
    base = {
        "organizations_published": 3,
        "organizations_draft": 1,
        "camps_total": 5,
        "registrations_total": 42,
        "registrations_last_30_days": 7,
        "payments_open_cents": 12000,
        "payments_paid_cents": 34000,
        "waitlist_total": 2,
    }
    base.update(overrides)
    return base


def test_stats_requires_platform_owner(monkeypatch):
    org_id = str(uuid4())
    headers = org_admin_headers(organization_id=org_id)

    with TestClient(app) as client:
        response = client.get("/admin/stats", headers=headers)

    assert response.status_code == 403


def test_stats_returns_aggregates_for_owner(monkeypatch):
    monkeypatch.setattr(platform_stats_repo, "get_platform_stats", lambda: _stats_row())
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.get("/admin/stats", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["organizations_published"] == 3
    assert body["waitlist_total"] == 2


def test_stats_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/stats")
    assert response.status_code == 401


def test_global_registrations_requires_platform_owner():
    headers = org_admin_headers(organization_id=str(uuid4()))
    with TestClient(app) as client:
        response = client.get("/admin/registrations", headers=headers)
    assert response.status_code == 403


def test_global_registrations_returns_rows_for_owner(monkeypatch):
    monkeypatch.setattr(
        registrations_repo,
        "list_registrations_global",
        lambda **kwargs: [
            {
                "organization_slug": "demo-fc",
                "organization_name": "Demo FC",
                "camp_slug": "summer-1",
                "camp_title": "Summer Week 1",
                "id": uuid4(),
                "registration_token": uuid4(),
                "status": "registered",
                "payment_status": "open",
                "parent_first_name": "Max",
                "parent_last_name": "Mustermann",
                "parent_email": "max@example.com",
                "parent_phone": "+49 123",
                "child_first_name": "Lena",
                "child_last_name": "Mustermann",
                "child_birth_date": "2017-05-10",
                "emergency_contact_name": None,
                "emergency_contact_phone": None,
                "medical_notes": None,
                "allergies": None,
                "jersey_size": None,
                "pickup_authorized": None,
                "photo_permission": False,
                "created_at": "2026-09-01T10:00:00Z",
            }
        ],
    )
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.get("/admin/registrations", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["organization_slug"] == "demo-fc"
    assert body[0]["camp_slug"] == "summer-1"


def test_audit_log_requires_platform_owner():
    headers = org_admin_headers(organization_id=str(uuid4()))
    with TestClient(app) as client:
        response = client.get("/admin/audit-log", headers=headers)
    assert response.status_code == 403


def test_audit_log_returns_entries_for_owner(monkeypatch):
    monkeypatch.setattr(
        platform_roles,
        "list_audit_log",
        lambda organization_id=None, limit=200: [
            {
                "id": uuid4(),
                "actor_user_id": uuid4(),
                "actor_email": "owner@example.com",
                "action": "organization.publish_state_changed",
                "organization_id": uuid4(),
                "target_type": "organization",
                "target_id": "demo-fc",
                "metadata": {"site_published": True},
                "created_at": "2026-09-23T10:00:00Z",
            }
        ],
    )
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.get("/admin/audit-log", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body[0]["action"] == "organization.publish_state_changed"


def test_list_members_allowed_for_own_org_admin(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(platform_roles, "list_organization_members", lambda org_id: [])
    headers = org_admin_headers(organization_id=str(org["id"]))

    with TestClient(app) as client:
        response = client.get(f"/admin/organizations/{org['slug']}/members", headers=headers)

    assert response.status_code == 200


def test_list_members_forbidden_for_different_org_admin(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.get(f"/admin/organizations/{org['slug']}/members", headers=headers)

    assert response.status_code == 403


def test_add_member_requires_platform_owner(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    headers = org_admin_headers(organization_id=str(org["id"]))

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/{org['slug']}/members", json={"email": "new-admin@example.com"}, headers=headers
        )

    assert response.status_code == 403


def test_add_member_unknown_email_returns_404(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(supabase_auth, "find_user_by_email", lambda email: None)
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/{org['slug']}/members",
            json={"email": "nobody@example.com"},
            headers=headers,
        )

    assert response.status_code == 404


def test_add_member_success(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(
        supabase_auth, "find_user_by_email", lambda email: supabase_auth.SupabaseUser(id="new-admin-1", email=email)
    )
    monkeypatch.setattr(
        platform_roles,
        "add_organization_member",
        lambda org_id, user_id, role="org_admin": {
            "id": uuid4(),
            "organization_id": org_id,
            "user_id": user_id,
            "role": role,
            "created_at": "2026-09-23T10:00:00Z",
        },
    )
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/{org['slug']}/members",
            json={"email": "new-admin@example.com"},
            headers=headers,
        )

    assert response.status_code == 201
    assert response.json()["email"] == "new-admin@example.com"


def test_add_member_without_service_role_key_returns_503(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)

    def _raise(email):
        raise supabase_auth.SupabaseAuthError("SUPABASE_SERVICE_ROLE_KEY not configured")

    monkeypatch.setattr(supabase_auth, "find_user_by_email", _raise)
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.post(
            f"/admin/organizations/{org['slug']}/members",
            json={"email": "someone@example.com"},
            headers=headers,
        )

    assert response.status_code == 503


def test_remove_member_requires_platform_owner(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    headers = org_admin_headers(organization_id=str(org["id"]))

    with TestClient(app) as client:
        response = client.delete(f"/admin/organizations/{org['slug']}/members/{uuid4()}", headers=headers)

    assert response.status_code == 403


def test_remove_member_success(monkeypatch):
    org = _org_row()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(platform_roles, "remove_organization_member", lambda org_id, member_id: True)
    headers = owner_headers()

    with TestClient(app) as client:
        response = client.delete(f"/admin/organizations/{org['slug']}/members/{uuid4()}", headers=headers)

    assert response.status_code == 204


def test_me_returns_owner_identity(monkeypatch):
    headers = owner_headers(user_id="owner-42", email="owner@example.com")

    with TestClient(app) as client:
        response = client.get("/admin/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["is_platform_owner"] is True
    assert body["user_id"] == "owner-42"


def test_me_returns_org_admin_identity_with_resolved_slugs(monkeypatch):
    org = _org_row(slug="my-club")
    monkeypatch.setattr(organizations, "get_organization_by_id", lambda org_id: org)
    headers = org_admin_headers(organization_id=str(org["id"]))

    with TestClient(app) as client:
        response = client.get("/admin/me", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["is_platform_owner"] is False
    assert body["admin_organization_slugs"] == ["my-club"]


def test_me_without_auth_returns_401():
    with TestClient(app) as client:
        response = client.get("/admin/me")
    assert response.status_code == 401
