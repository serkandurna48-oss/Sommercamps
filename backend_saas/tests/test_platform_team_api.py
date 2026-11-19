"""
API tests for the platform team management (/admin/platform/owners):
listing, granting and revoking platform_owner for existing accounts.
Same conventions as test_admin_platform_console_api.py: auth via
dependency override, repository + Supabase Auth lookups monkeypatched.
The real-SQL behavior (last-owner guard under concurrency, audit row in
the same transaction) is covered in test_platform_team_postgres.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.repositories import platform_roles

from .auth_helpers import org_admin_headers, owner_headers

OWNER_ID = str(uuid4())
OTHER_ID = str(uuid4())


def _owner_row(user_id: str, organizations=None) -> dict:
    return {
        "user_id": user_id,
        "created_at": datetime(2026, 11, 1, tzinfo=timezone.utc),
        "organizations": organizations or [],
    }


@pytest.fixture
def no_supabase_emails(monkeypatch):
    monkeypatch.setattr(supabase_auth, "get_user_emails", lambda ids: {i: f"{i[:4]}@example.com" for i in ids})


# --- access control -------------------------------------------------------


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/admin/platform/owners", None),
        ("post", "/admin/platform/owners", {"email": "x@example.com"}),
        ("delete", f"/admin/platform/owners/{OTHER_ID}", None),
    ],
)
def test_requires_authentication(method, path, body):
    with TestClient(app) as client:
        response = client.request(method, path, json=body)
    assert response.status_code == 401


@pytest.mark.parametrize(
    "method,path,body",
    [
        ("get", "/admin/platform/owners", None),
        ("post", "/admin/platform/owners", {"email": "x@example.com"}),
        ("delete", f"/admin/platform/owners/{OTHER_ID}", None),
    ],
)
def test_org_admin_is_forbidden_and_nothing_is_written(monkeypatch, method, path, body):
    calls: list[str] = []
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: calls.append("grant"))
    monkeypatch.setattr(platform_roles, "revoke_platform_owner", lambda **kw: calls.append("revoke"))
    monkeypatch.setattr(platform_roles, "list_platform_owners", lambda: calls.append("list") or [])
    headers = org_admin_headers(organization_id=str(uuid4()))

    with TestClient(app) as client:
        response = client.request(method, path, json=body, headers=headers)

    assert response.status_code == 403
    assert calls == []


# --- list -----------------------------------------------------------------


def test_list_owners_with_roles_and_self_marker(monkeypatch, no_supabase_emails):
    monkeypatch.setattr(
        platform_roles,
        "list_platform_owners",
        lambda: [
            _owner_row(OWNER_ID),
            _owner_row(OTHER_ID, [{"slug": "demo-fc", "name": "Demo FC"}]),
        ],
    )
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.get("/admin/platform/owners", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert [o["user_id"] for o in body] == [OWNER_ID, OTHER_ID]
    assert body[0]["is_self"] is True and body[1]["is_self"] is False
    assert body[0]["role"] == "platform_owner"
    assert body[1]["organizations"] == [{"slug": "demo-fc", "name": "Demo FC"}]
    assert body[1]["email"] == f"{OTHER_ID[:4]}@example.com"


# --- grant ----------------------------------------------------------------


def _patch_lookup(monkeypatch, user):
    seen: list[str] = []

    def lookup(email):
        seen.append(email)
        return user

    monkeypatch.setattr(supabase_auth, "find_user_by_email", lookup)
    # The response re-reads the owner row (club roles, created_at).
    monkeypatch.setattr(
        platform_roles, "list_platform_owners",
        lambda: [_owner_row(user.id, [{"slug": "demo-fc", "name": "Demo FC"}])] if user else [],
    )
    return seen


def test_grant_existing_account(monkeypatch):
    _patch_lookup(monkeypatch, supabase_auth.SupabaseUser(id=OTHER_ID, email="ahmad@example.com"))
    granted: list[dict] = []

    def grant(**kwargs):
        granted.append(kwargs)
        return True

    monkeypatch.setattr(platform_roles, "grant_platform_owner", grant)
    headers = owner_headers(user_id=OWNER_ID, email="serkan@example.com")

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json={"email": "Ahmad@Example.com "}, headers=headers)

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == OTHER_ID
    assert body["already_owner"] is False
    assert body["organizations"] == [{"slug": "demo-fc", "name": "Demo FC"}]
    assert granted == [
        {
            "user_id": OTHER_ID,
            "actor_user_id": OWNER_ID,
            "actor_email": "serkan@example.com",
            "target_email": "ahmad@example.com",
        }
    ]


def test_grant_is_idempotent_for_existing_owner(monkeypatch):
    _patch_lookup(monkeypatch, supabase_auth.SupabaseUser(id=OTHER_ID, email="ahmad@example.com"))
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: False)
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json={"email": "ahmad@example.com"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["already_owner"] is True


def test_grant_unknown_email_creates_no_account(monkeypatch):
    _patch_lookup(monkeypatch, None)
    created: list[str] = []
    monkeypatch.setattr(supabase_auth, "create_user", lambda *a, **k: created.append("user"))
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: created.append("grant"))
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json={"email": "nobody@example.com"}, headers=headers)

    assert response.status_code == 404
    assert "Kein Konto" in response.json()["detail"]
    assert created == []


def test_grant_refuses_never_activated_account(monkeypatch):
    # A never-confirmed / never-signed-in account may have been registered by
    # someone else under that address — never hand it platform-wide access.
    _patch_lookup(
        monkeypatch,
        supabase_auth.SupabaseUser(id=OTHER_ID, email="ahmad@example.com", needs_password_setup=True),
    )
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: pytest.fail("must not grant"))
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json={"email": "ahmad@example.com"}, headers=headers)

    assert response.status_code == 409
    assert "noch nicht aktiviert" in response.json()["detail"]


def test_grant_supabase_unavailable_returns_503(monkeypatch):
    def broken(email):
        raise supabase_auth.SupabaseAuthError("down")

    monkeypatch.setattr(supabase_auth, "find_user_by_email", broken)
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: pytest.fail("must not grant"))
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json={"email": "ahmad@example.com"}, headers=headers)

    assert response.status_code == 503


@pytest.mark.parametrize(
    "body",
    [
        {"email": "ahmad@example.com", "user_id": str(uuid4())},
        {"email": "ahmad@example.com", "role": "superuser"},
        {"user_id": str(uuid4())},
        {"email": "not-an-email"},
        {},
    ],
)
def test_grant_rejects_manipulated_bodies(monkeypatch, body):
    _patch_lookup(monkeypatch, supabase_auth.SupabaseUser(id=OTHER_ID, email="ahmad@example.com"))
    monkeypatch.setattr(platform_roles, "grant_platform_owner", lambda **kw: pytest.fail("must not grant"))
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.post("/admin/platform/owners", json=body, headers=headers)

    assert response.status_code == 422


# --- revoke ---------------------------------------------------------------


def test_revoke_owner(monkeypatch):
    revoked: list[dict] = []
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda uid: "ahmad@example.com")

    def revoke(**kwargs):
        revoked.append(kwargs)
        return True

    monkeypatch.setattr(platform_roles, "revoke_platform_owner", revoke)
    headers = owner_headers(user_id=OWNER_ID, email="serkan@example.com")

    with TestClient(app) as client:
        response = client.delete(f"/admin/platform/owners/{OTHER_ID}", headers=headers)

    assert response.status_code == 204
    assert revoked == [
        {
            "user_id": OTHER_ID,
            "actor_user_id": OWNER_ID,
            "actor_email": "serkan@example.com",
            "target_email": "ahmad@example.com",
        }
    ]


def test_revoke_unknown_owner_returns_404(monkeypatch):
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda uid: None)
    monkeypatch.setattr(platform_roles, "revoke_platform_owner", lambda **kw: False)
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.delete(f"/admin/platform/owners/{OTHER_ID}", headers=headers)

    assert response.status_code == 404


def test_revoke_last_owner_returns_409(monkeypatch):
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda uid: None)

    def revoke(**kwargs):
        raise platform_roles.LastPlatformOwnerError()

    monkeypatch.setattr(platform_roles, "revoke_platform_owner", revoke)
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.delete(f"/admin/platform/owners/{OWNER_ID}", headers=headers)

    assert response.status_code == 409
    assert "letzte" in response.json()["detail"]


def test_revoke_rejects_non_uuid_path(monkeypatch):
    monkeypatch.setattr(platform_roles, "revoke_platform_owner", lambda **kw: pytest.fail("must not revoke"))
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        response = client.delete("/admin/platform/owners/not-a-uuid", headers=headers)

    assert response.status_code == 422


@pytest.mark.parametrize("method", ["post", "delete"])
def test_actor_revoked_concurrently_gets_403(monkeypatch, method):
    _patch_lookup(monkeypatch, supabase_auth.SupabaseUser(id=OTHER_ID, email="ahmad@example.com"))
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda uid: None)

    def refuse(**kwargs):
        raise platform_roles.ActorNotPlatformOwnerError()

    monkeypatch.setattr(platform_roles, "grant_platform_owner", refuse)
    monkeypatch.setattr(platform_roles, "revoke_platform_owner", refuse)
    headers = owner_headers(user_id=OWNER_ID)

    with TestClient(app) as client:
        if method == "post":
            response = client.post("/admin/platform/owners", json={"email": "ahmad@example.com"}, headers=headers)
        else:
            response = client.delete(f"/admin/platform/owners/{OTHER_ID}", headers=headers)

    assert response.status_code == 403
