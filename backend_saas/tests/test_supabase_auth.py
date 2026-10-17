"""
Unit tests for app/supabase_auth.py. Replaces the module's shared httpx
client so no test ever makes a real network call to Supabase — same "no
real external service" rule as the rest of this suite.
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


class _FakeClient:
    """Stands in for the shared httpx.Client and counts calls, so a test can
    tell a reused client from a per-call one."""

    def __init__(self, respond):
        self._respond = respond
        self.calls = 0

    def get(self, *args, **kwargs):
        self.calls += 1
        return self._respond(*args, **kwargs)


def _fake_client(monkeypatch, respond) -> _FakeClient:
    client = _FakeClient(respond)
    monkeypatch.setattr(supabase_auth, "get_client", lambda: client)
    return client


def test_verify_access_token_success(monkeypatch):
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1", "email": "a@example.com"}))
    user = supabase_auth.verify_access_token("some-token")
    assert user.id == "user-1"
    assert user.email == "a@example.com"


def test_verify_access_token_rejected_by_supabase(monkeypatch):
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(401, {}))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("expired-token")


def test_verify_access_token_network_failure(monkeypatch):
    def _raise(*a, **k):
        raise httpx.ConnectError("unreachable")

    _fake_client(monkeypatch, _raise)
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("token")


def test_verify_access_token_missing_id_in_response(monkeypatch):
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"email": "a@example.com"}))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token("token")


def test_get_client_is_reused_across_requests():
    """Guards the fix for the measured ~216 ms per-request cost: building a
    fresh httpx client per call rebuilds the certifi SSL context every time,
    which dominated every authenticated admin request."""
    assert supabase_auth.get_client() is supabase_auth.get_client()


def test_verify_access_token_uses_one_client_for_repeated_calls(monkeypatch):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1", "email": None}))

    supabase_auth.verify_access_token("token")
    supabase_auth.verify_access_token("token")

    assert client.calls == 2


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
    _fake_client(
        monkeypatch,
        lambda *a, **k: _FakeResponse(200, {"users": [{"id": "user-9", "email": "someone@example.com"}]}),
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
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"users": []}))

    user = supabase_auth.find_user_by_email("nobody@example.com")

    assert user is None
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()
