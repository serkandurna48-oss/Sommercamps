"""
MK1 Pilotanfrage — Backend-Tests

POST /public/pilot-request:
  1. 200 mit Mail-Mock (Empfänger, Betreff, Reply-To geprüft)
  2. 422 bei fehlendem Verein / ungültiger E-Mail
  3. Honeypot ⇒ 204 ohne Mail
  4. 4. Anfrage derselben IP ⇒ 429
  5. Fehlende PLATFORM_CONTACT_EMAIL ⇒ 503
  6. Mailfehler ⇒ 503
  7. Log enthält keine E-Mail-Adresse

Mutationsprobe:
  Wenn die Honeypot-Prüfung (`if data.website: return Response(status_code=204)`)
  aus pilot_request.py entfernt wird, schlägt test_honeypot_no_mail rot —
  weil dann die Mail gesendet wird und resp.status_code 200 statt 204 ist.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing

client = TestClient(app)

_VALID_BODY = {
    "verein": "Testverein FC",
    "email": "info@testverein.de",
    "website": "",
}

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset(monkeypatch: pytest.MonkeyPatch):
    """Reset rate limiter and mail provider; set PLATFORM_CONTACT_EMAIL by default."""
    from app.routers import signup as signup_mod
    with signup_mod._rate_lock:
        signup_mod._ip_timestamps.clear()

    monkeypatch.setenv("PLATFORM_CONTACT_EMAIL", "team@campspilot.app")

    provider = FakeProvider()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_success_sends_mail(_reset: FakeProvider) -> None:
    resp = client.post("/public/pilot-request", json=_VALID_BODY)

    assert resp.status_code == 200
    assert len(_reset.sent) == 1
    msg = _reset.sent[0]
    assert msg.to_email == "team@campspilot.app"
    assert msg.subject == "Pilotanfrage: Testverein FC"
    assert msg.reply_to == "info@testverein.de"


def test_success_optional_fields(_reset: FakeProvider) -> None:
    body = {**_VALID_BODY, "telefon": "+49 561 12345", "nachricht": "Hallo!"}
    resp = client.post("/public/pilot-request", json=body)
    assert resp.status_code == 200
    assert len(_reset.sent) == 1
    assert "+49 561 12345" in _reset.sent[0].html_content
    assert "Hallo!" in _reset.sent[0].html_content


def test_422_missing_verein() -> None:
    resp = client.post("/public/pilot-request", json={"email": "info@testverein.de", "website": ""})
    assert resp.status_code == 422


def test_422_invalid_email() -> None:
    resp = client.post(
        "/public/pilot-request",
        json={"verein": "Testverein FC", "email": "kein-email", "website": ""},
    )
    assert resp.status_code == 422


def test_422_verein_too_short() -> None:
    resp = client.post(
        "/public/pilot-request",
        json={"verein": "A", "email": "info@testverein.de", "website": ""},
    )
    assert resp.status_code == 422


def test_honeypot_no_mail(_reset: FakeProvider) -> None:
    resp = client.post(
        "/public/pilot-request",
        json={**_VALID_BODY, "website": "http://spam.com"},
    )
    assert resp.status_code == 204
    assert len(_reset.sent) == 0


def test_rate_limit_fourth_request(_reset: FakeProvider) -> None:
    for _ in range(3):
        r = client.post("/public/pilot-request", json=_VALID_BODY)
        assert r.status_code == 200
    r4 = client.post("/public/pilot-request", json=_VALID_BODY)
    assert r4.status_code == 429


def test_missing_platform_contact_email(
    _reset: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("PLATFORM_CONTACT_EMAIL", raising=False)
    resp = client.post("/public/pilot-request", json=_VALID_BODY)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "pilot_request_unavailable"
    assert len(_reset.sent) == 0


def test_mail_failure_returns_503(
    _reset: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    failing = MagicMock()
    failing.send.side_effect = RuntimeError("Brevo down")
    reset_provider_for_testing(failing)
    resp = client.post("/public/pilot-request", json=_VALID_BODY)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "pilot_request_unavailable"


def test_log_no_email_address(_reset: FakeProvider, caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/public/pilot-request", json=_VALID_BODY)
    assert resp.status_code == 200
    for record in caplog.records:
        msg = record.getMessage()
        assert "info@testverein.de" not in msg, f"E-Mail-Adresse im Log: {msg!r}"
