"""
Unit tests for app/auth_deps.py — the server-side permission gate every
admin route depends on. Calls the dependency functions directly (not via
HTTP), mocking app.supabase_auth.verify_access_token and
app.repositories.platform_roles so no test ever contacts Supabase or a
real database — same discipline as every other test in this suite.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app import auth_deps, supabase_auth
from app.repositories import platform_roles


def _mock_user(monkeypatch, user_id: str = "user-1", email: str = "user@example.com"):
    monkeypatch.setattr(
        supabase_auth, "verify_access_token", lambda token: supabase_auth.SupabaseUser(id=user_id, email=email)
    )


def test_get_auth_context_missing_header_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        auth_deps.get_auth_context(authorization=None)
    assert exc_info.value.status_code == 401


def test_get_auth_context_malformed_header_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        auth_deps.get_auth_context(authorization="NotBearer sometoken")
    assert exc_info.value.status_code == 401


def test_get_auth_context_invalid_token_raises_401(monkeypatch):
    def _raise(token):
        raise supabase_auth.SupabaseAuthError("bad token")

    monkeypatch.setattr(supabase_auth, "verify_access_token", _raise)
    with pytest.raises(HTTPException) as exc_info:
        auth_deps.get_auth_context(authorization="Bearer bad-token")
    assert exc_info.value.status_code == 401


def test_get_auth_context_resolves_platform_owner(monkeypatch):
    _mock_user(monkeypatch, user_id="owner-1")
    monkeypatch.setattr(platform_roles, "is_platform_owner", lambda user_id: True)
    # An owner's admin_organization_ids must never even be queried — owners
    # don't need membership rows (see auth_deps.get_auth_context).
    monkeypatch.setattr(
        platform_roles,
        "get_admin_organization_ids",
        lambda user_id: (_ for _ in ()).throw(AssertionError("should not be called for an owner")),
    )

    ctx = auth_deps.get_auth_context(authorization="Bearer token")

    assert ctx.is_owner is True
    assert ctx.user_id == "owner-1"
    assert ctx.admin_organization_ids == set()


def test_get_auth_context_resolves_org_admin(monkeypatch):
    _mock_user(monkeypatch, user_id="admin-1")
    monkeypatch.setattr(platform_roles, "is_platform_owner", lambda user_id: False)
    monkeypatch.setattr(platform_roles, "get_admin_organization_ids", lambda user_id: ["org-a", "org-b"])

    ctx = auth_deps.get_auth_context(authorization="Bearer token")

    assert ctx.is_owner is False
    assert ctx.admin_organization_ids == {"org-a", "org-b"}


def test_require_platform_owner_passes_for_owner():
    ctx = auth_deps.AuthContext(user_id="u", email=None, is_owner=True, admin_organization_ids=set())
    assert auth_deps.require_platform_owner(auth=ctx) is ctx


def test_require_platform_owner_rejects_org_admin():
    ctx = auth_deps.AuthContext(user_id="u", email=None, is_owner=False, admin_organization_ids={"org-a"})
    with pytest.raises(HTTPException) as exc_info:
        auth_deps.require_platform_owner(auth=ctx)
    assert exc_info.value.status_code == 403


def test_require_org_access_passes_for_owner_regardless_of_org(monkeypatch):
    ctx = auth_deps.AuthContext(user_id="u", email=None, is_owner=True, admin_organization_ids=set())
    # require_organization would normally hit the DB — an owner must never
    # even need it to resolve, but require_org_access calls it for
    # org_admins only; assert it's skipped for an owner by making it raise
    # if called.
    from app import admin_resolve

    monkeypatch.setattr(
        admin_resolve,
        "require_organization",
        lambda slug: (_ for _ in ()).throw(AssertionError("should not resolve org for an owner")),
    )
    result = auth_deps.require_org_access(organization_slug="any-org", auth=ctx)
    assert result is ctx


def test_require_org_access_passes_for_matching_org_admin(monkeypatch):
    from app import admin_resolve

    monkeypatch.setattr(admin_resolve, "require_organization", lambda slug: {"id": "org-a", "slug": slug})
    ctx = auth_deps.AuthContext(user_id="u", email=None, is_owner=False, admin_organization_ids={"org-a"})

    result = auth_deps.require_org_access(organization_slug="demo-fc", auth=ctx)
    assert result is ctx


def test_require_org_access_rejects_non_matching_org_admin(monkeypatch):
    from app import admin_resolve

    monkeypatch.setattr(admin_resolve, "require_organization", lambda slug: {"id": "org-b", "slug": slug})
    ctx = auth_deps.AuthContext(user_id="u", email=None, is_owner=False, admin_organization_ids={"org-a"})

    with pytest.raises(HTTPException) as exc_info:
        auth_deps.require_org_access(organization_slug="demo-fc", auth=ctx)
    assert exc_info.value.status_code == 403
