"""
Unit tests for app/supabase_auth.py. Mocks httpx.get so no test ever makes
a real network call to Supabase — same "no real external service" rule as
the rest of this suite.
"""

from __future__ import annotations

import httpx
import pytest

from app import supabase_auth


class _FakeResponse:
    def __init__(self, status_code: int, json_body: dict):
        self.status_code = status_code
        self._json_body = json_body

    def json(self):
        return self._json_body


def test_verify_access_token_success(monkeypatch):
    monkeypatch.setattr(
        supabase_auth.httpx, "get", lambda *a, **k: _FakeResponse(200, {"id": "user-1", "email": "a@example.com"})
    )
    user = supabase_auth.verify_access_token("some-token")
    assert user.id == "user-1"
    assert user.email == "a@example.com"


def test_verify_access_token_rejected_by_supabase(monkeypatch):
    monkeypatch.setattr(supabase_auth.httpx, "get", lambda *a, **k: _FakeResponse(401, {}))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("expired-token")


def test_verify_access_token_network_failure(monkeypatch):
    def _raise(*a, **k):
        raise httpx.ConnectError("unreachable")

    monkeypatch.setattr(supabase_auth.httpx, "get", _raise)
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("token")


def test_verify_access_token_missing_id_in_response(monkeypatch):
    monkeypatch.setattr(supabase_auth.httpx, "get", lambda *a, **k: _FakeResponse(200, {"email": "a@example.com"}))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("token")


def test_find_user_by_email_without_service_role_key_raises(monkeypatch):
    from app.config import get_settings

    get_settings.cache_clear()
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.find_user_by_email("someone@example.com")
    get_settings.cache_clear()


def test_find_user_by_email_found(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    get_settings.cache_clear()
    monkeypatch.setattr(
        supabase_auth.httpx,
        "get",
        lambda *a, **k: _FakeResponse(
            200, {"users": [{"id": "user-9", "email": "someone@example.com"}]}
        ),
    )

    user = supabase_auth.find_user_by_email("someone@example.com")

    assert user is not None
    assert user.id == "user-9"
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()


def test_find_user_by_email_not_found(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    get_settings.cache_clear()
    monkeypatch.setattr(supabase_auth.httpx, "get", lambda *a, **k: _FakeResponse(200, {"users": []}))

    user = supabase_auth.find_user_by_email("nobody@example.com")

    assert user is None
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()
