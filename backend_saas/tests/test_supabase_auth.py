"""
Unit tests for app/supabase_auth.py. Replaces the module's shared httpx
client so no test ever makes a real network call to Supabase — same "no
real external service" rule as the rest of this suite.
"""

from __future__ import annotations

import base64
import json

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

    def post(self, *args, **kwargs):
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


@pytest.fixture(autouse=True)
def _clear_token_cache():
    with supabase_auth._token_cache_lock:
        supabase_auth._token_cache.clear()
    yield
    with supabase_auth._token_cache_lock:
        supabase_auth._token_cache.clear()


def _jwt(exp=1100, **claims):
    payload = {"exp": exp, **claims}
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJIUzI1NiJ9.{encoded}.test-signature"


@pytest.fixture
def cache_clock(monkeypatch):
    clock = {"wall": 1000.0, "mono": 100.0}
    monkeypatch.setattr(supabase_auth.time, "time", lambda: clock["wall"])
    monkeypatch.setattr(supabase_auth.time, "monotonic", lambda: clock["mono"])
    return clock


def test_verified_jwt_reuses_identity_but_does_not_expose_mutable_cached_user(monkeypatch, cache_clock):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1", "email": "a@example.com"}))
    token = _jwt()
    first = supabase_auth.verify_access_token(token)
    first.id = "mutated"
    second = supabase_auth.verify_access_token(token)
    assert second.id == "user-1"
    assert client.calls == 1
    assert token not in supabase_auth._token_cache


def test_cached_verification_expires_at_sixty_seconds(monkeypatch, cache_clock):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1"}))
    token = _jwt(exp=5000)
    supabase_auth.verify_access_token(token)
    cache_clock.update(wall=1059.9, mono=159.9)
    supabase_auth.verify_access_token(token)
    assert client.calls == 1
    cache_clock.update(wall=1060, mono=160)
    supabase_auth.verify_access_token(token)
    assert client.calls == 2


def test_cache_never_outlives_jwt_expiry(monkeypatch, cache_clock):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1"}))
    token = _jwt(exp=1010)
    supabase_auth.verify_access_token(token)
    cache_clock.update(wall=1010, mono=110)
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token(token)
    assert client.calls == 2
    assert not supabase_auth._token_cache


def test_rejected_jwt_is_never_cached(monkeypatch, cache_clock):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(401, {}))
    for _ in range(2):
        with pytest.raises(supabase_auth.SupabaseAuthError):
            supabase_auth.verify_access_token(_jwt())
    assert client.calls == 2
    assert not supabase_auth._token_cache


def test_network_errors_are_never_cached(monkeypatch, cache_clock):
    def unreachable(*a, **k):
        raise httpx.ConnectError("offline")
    client = _fake_client(monkeypatch, unreachable)
    for _ in range(2):
        with pytest.raises(supabase_auth.SupabaseAuthError):
            supabase_auth.verify_access_token(_jwt())
    assert client.calls == 2
    assert not supabase_auth._token_cache


@pytest.mark.parametrize("expiry", [None, "1100", True, float('nan'), float('inf'), 10**400])
def test_unusable_expiry_is_not_cached(monkeypatch, cache_clock, expiry):
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1"}))
    token = _jwt(exp=expiry)
    supabase_auth.verify_access_token(token)
    supabase_auth.verify_access_token(token)
    assert client.calls == 2
    assert not supabase_auth._token_cache


def test_missing_expiry_is_not_cached(monkeypatch, cache_clock):
    payload = base64.urlsafe_b64encode(b'{"sub":"user-1"}').decode().rstrip('=')
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1"}))
    token = f"header.{payload}.signature"
    supabase_auth.verify_access_token(token)
    supabase_auth.verify_access_token(token)
    assert client.calls == 2


@pytest.mark.parametrize("body", [{}, {"id": 3}, {"id": "  "}, {"id": "user", "email": []}, []])
def test_malformed_success_response_is_not_cached(monkeypatch, cache_clock, body):
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, body))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token(_jwt())
    assert not supabase_auth._token_cache


def test_cache_evicts_least_recently_used_entry_at_size_limit(monkeypatch, cache_clock):
    monkeypatch.setattr(supabase_auth, "_TOKEN_CACHE_MAX_SIZE", 2)
    client = _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(200, {"id": "user-1"}))
    tokens = [_jwt(sub=str(i)) for i in range(3)]
    for token in tokens[:2]:
        supabase_auth.verify_access_token(token)
    supabase_auth.verify_access_token(tokens[0])
    supabase_auth.verify_access_token(tokens[2])
    assert len(supabase_auth._token_cache) == 2
    supabase_auth.verify_access_token(tokens[0])
    assert client.calls == 3
    supabase_auth.verify_access_token(tokens[1])
    assert client.calls == 4
    assert len(supabase_auth._token_cache) == 2


def test_network_time_counts_towards_ttl(monkeypatch, cache_clock):
    def slow(*a, **k):
        cache_clock["mono"] += 5
        cache_clock["wall"] += 5
        return _FakeResponse(200, {"id": "user-1"})
    client = _fake_client(monkeypatch, slow)
    token = _jwt()
    supabase_auth.verify_access_token(token)
    cache_clock.update(wall=1060, mono=160)
    supabase_auth.verify_access_token(token)
    assert client.calls == 2


def test_revoked_token_is_rejected_after_ttl(monkeypatch, cache_clock):
    responses = iter([_FakeResponse(200, {"id": "user-1"}), _FakeResponse(401, {})])
    client = _fake_client(monkeypatch, lambda *a, **k: next(responses))
    token = _jwt()
    supabase_auth.verify_access_token(token)
    cache_clock.update(wall=1060, mono=160)
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.verify_access_token(token)
    assert client.calls == 2
    assert not supabase_auth._token_cache


@pytest.fixture
def confirmation_settings(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("FRONTEND_BASE_URL", "https://frontend.example")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    get_settings.cache_clear()
    yield get_settings()
    get_settings.cache_clear()


@pytest.mark.parametrize("org_slug,path", [
    ("testverein", "/pilot/testverein/login"),
    (None, "/platform/login"),
])
def test_confirmation_link_redirects_to_same_site_login(monkeypatch, confirmation_settings, org_slug, path):
    requests = []

    def respond(url, **kwargs):
        requests.append((url, kwargs))
        return _FakeResponse(200, {"action_link": "https://auth.example/verify?token=fake"})

    client = _fake_client(monkeypatch, respond)
    assert supabase_auth.generate_confirmation_link("club@example.com", org_slug=org_slug) == "https://auth.example/verify?token=fake"
    assert client.calls == 1
    url, kwargs = requests[0]
    assert url.endswith("/auth/v1/admin/generate_link")
    assert kwargs["params"] == {"redirect_to": "https://frontend.example" + path}
    assert kwargs["json"] == {"type": "signup", "email": "club@example.com"}


@pytest.mark.parametrize("target", [
    "https://external.example/login",
    "https://frontend.example.external.example/login",
    "https://external.frontend.example/login",
    "http://frontend.example/platform/login",
    "https://frontend.example:444/platform/login",
    "https://frontend.example:0/platform/login",
    "//external.example/login",
    "/platform/login",
    "https://frontend.example@external.example/login",
    "https://external.example@frontend.example/login",
    "https://frontend.example\\@external.example/login",
    "https://front\nend.example/platform/login",
    "javascript:alert(1)",
    "https://frontend.example:invalid/login",
    "https://frontend.example/platform/login?next=https://external.example",
    "https://frontend.example/platform/login#https://external.example",
    "",
])
def test_confirmation_link_rejects_unsafe_redirect_before_provider_call(monkeypatch, confirmation_settings, target):
    client = _fake_client(monkeypatch, lambda *a, **kw: pytest.fail("Must not contact Supabase"))
    with pytest.raises(supabase_auth.SupabaseAuthError, match="Invalid confirmation redirect target"):
        supabase_auth.generate_confirmation_link("club@example.com", redirect_to=target)
    assert client.calls == 0


def test_confirmation_link_accepts_explicit_same_origin_target(monkeypatch, confirmation_settings):
    requests = []

    def respond(url, **kwargs):
        requests.append(kwargs)
        return _FakeResponse(200, {"action_link": "https://auth.example/verify"})

    _fake_client(monkeypatch, respond)
    target = "https://frontend.example:443/pilot/testverein/login"
    supabase_auth.generate_confirmation_link("club@example.com", redirect_to=target)
    assert requests[0]["params"]["redirect_to"] == target


@pytest.mark.parametrize("slug", ["../external", "//external.example", "club?next=external", "club/login", ""])
def test_confirmation_link_rejects_invalid_org_slug(monkeypatch, confirmation_settings, slug):
    client = _fake_client(monkeypatch, lambda *a, **kw: pytest.fail("Must not contact Supabase"))
    with pytest.raises(supabase_auth.SupabaseAuthError):
        supabase_auth.generate_confirmation_link("club@example.com", org_slug=slug)
    assert client.calls == 0


@pytest.mark.parametrize("origin", [
    "https://frontend.example/path", "https://frontend.example?next=external",
    "https://frontend.example#fragment", "https://user@frontend.example",
    "http://frontend.example", "javascript:alert(1)", "//frontend.example",
    "https://frontend.example:invalid", "https://front\nend.example", "",
])
def test_frontend_base_url_rejects_unsafe_configuration(confirmation_settings, origin):
    from pydantic import ValidationError
    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(_env_file=None, FRONTEND_BASE_URL=origin)


def test_frontend_base_url_has_safe_local_default(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("FRONTEND_BASE_URL", raising=False)
    settings = Settings(_env_file=None)
    assert settings.login_url("testverein") == "http://localhost:3000/pilot/testverein/login"


def test_find_user_by_email_pages_through_users(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    get_settings.cache_clear()
    pages = []

    def get(*a, **k):
        page = k["params"]["page"]
        pages.append(page)
        if page == 1:
            return _FakeResponse(200, {"users": [{"id": f"u{i}", "email": f"u{i}@example.com"} for i in range(200)]})
        return _FakeResponse(200, {"users": [{
            "id": "late", "email": "late@example.com",
            "email_confirmed_at": "2026-01-01T00:00:00Z", "last_sign_in_at": "2026-02-01T00:00:00Z",
        }]})

    _fake_client(monkeypatch, get)
    user = supabase_auth.find_user_by_email("late@example.com")
    assert user is not None and user.id == "late"
    assert user.needs_password_setup is False
    assert pages == [1, 2]
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()


@pytest.mark.parametrize("fields", [
    {},  # never confirmed (squatted self-signup)
    {"email_confirmed_at": "2026-01-01T00:00:00Z"},  # confirmed but never signed in
])
def test_find_user_by_email_flags_accounts_needing_password_setup(monkeypatch, fields):
    from app.config import get_settings

    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    get_settings.cache_clear()
    _fake_client(monkeypatch, lambda *a, **k: _FakeResponse(
        200, {"users": [{"id": "u1", "email": "x@example.com", **fields}]}))
    assert supabase_auth.find_user_by_email("x@example.com").needs_password_setup is True
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    get_settings.cache_clear()
