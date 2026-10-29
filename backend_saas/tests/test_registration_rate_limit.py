"""Rate limit on the public parent registration endpoint (app/ratelimit.py)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.repositories import registrations as registrations_repo
from tests.test_registrations_api import _fake_created_row, _patch_org, _post, _target, _valid_payload


@pytest.fixture
def stub_registration(monkeypatch):
    _patch_org(monkeypatch)
    monkeypatch.setattr(registrations_repo, "get_registration_target", lambda tenant, slug: _target())
    calls = []

    def create(tenant, camp, data):
        calls.append(data)
        return _fake_created_row()

    monkeypatch.setattr(registrations_repo, "create_registration", create)
    monkeypatch.setattr(ratelimit.registration_limiter, "max_hits", 2)
    return calls


def _post_from(client, ip=None, header="true-client-ip"):
    return client.post(
        "/api/v1/organizations/demo-fc/camps/summer-1/registrations",
        json=_valid_payload(),
        headers={header: ip} if ip else {},
    )


def test_limit_blocks_after_max_hits_without_writing(stub_registration):
    with TestClient(app) as client:
        assert [_post(client, _valid_payload()).status_code for _ in range(3)] == [201, 201, 429]
    assert len(stub_registration) == 2


def test_429_detail_is_german(stub_registration):
    with TestClient(app) as client:
        _post(client, _valid_payload()), _post(client, _valid_payload())
        response = _post(client, _valid_payload())
    assert response.status_code == 429
    assert "Zu viele Anmeldungen" in response.json()["detail"]


def test_trusted_header_separates_visitors(stub_registration, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TRUSTED_CLIENT_IP_HEADER", "True-Client-IP")
    with TestClient(app) as client:
        assert [_post_from(client, "203.0.113.1").status_code for _ in range(3)] == [201, 201, 429]
        # A different visitor behind the same proxy is not affected.
        assert _post_from(client, "203.0.113.2").status_code == 201


def test_production_without_trusted_source_does_not_limit(stub_registration, monkeypatch):
    """Behind Render's proxy request.client.host is shared by all parents;
    limiting on it would lock out every family, so the limit stays off."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("TRUSTED_CLIENT_IP_HEADER", raising=False)
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    with TestClient(app) as client:
        assert {_post(client, _valid_payload()).status_code for _ in range(4)} == {201}


def test_forged_forwarded_for_does_not_bypass_proxy_hops(stub_registration, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("TRUSTED_CLIENT_IP_HEADER", raising=False)
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    with TestClient(app) as client:
        codes = [
            _post_from(client, f"198.51.100.{i}, 203.0.113.9", header="x-forwarded-for").status_code
            for i in range(3)
        ]
    assert codes == [201, 201, 429]


def test_empty_trusted_header_falls_back(stub_registration, monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TRUSTED_CLIENT_IP_HEADER", "true-client-ip")
    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    with TestClient(app) as client:
        assert {_post(client, _valid_payload()).status_code for _ in range(4)} == {201}
