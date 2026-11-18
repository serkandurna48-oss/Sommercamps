"""Sentry must never receive personal data (children's data, GDPR Art. 9).

The delivery test runs the real SDK with exactly the production options and a
capturing transport, so it proves what would leave the process, not only what
scrub_event does to a hand-built dict. Synthetic values only; nothing is sent.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
import sentry_sdk
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sentry_sdk.transport import Transport

from app import monitoring
from app.routers import internal

TOKEN = "3f2b8a1c-9d4e-4f6a-8b7c-1a2b3c4d5e6f"
SECRETS = ["Maximiliane", "Mustermann-Test", "2015-04-01", "Erdnussallergie", "max.test@example.com", TOKEN,
           "0151-0000000", "session-cookie-value", "Bearer-secret-value"]


class _Capture(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.sent: list[str] = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            payload = item.payload
            self.sent.append(payload.bytes.decode("utf-8") if payload.bytes is not None else json.dumps(payload.json))


@pytest.fixture
def captured():
    transport = _Capture()
    options = monitoring.build_options("https://public@o0.ingest.de.sentry.io/0", "test-capture", "abc123")
    sentry_sdk.init(**options, transport=transport)
    try:
        yield transport
    finally:
        sentry_sdk.flush()
        sentry_sdk.init(dsn=None)  # off again for every other test


class _Registration(BaseModel):
    child_first_name: str
    child_last_name: str
    child_birth_date: str
    allergies: str
    parent_email: str
    parent_phone: str


def _app() -> FastAPI:
    app = FastAPI()

    @app.post("/api/v1/bookings/{token}")
    def explode(token: str, body: _Registration):
        local_copy = body.model_dump()  # noqa: F841 - must not show up as a frame variable
        # Mirrors psycopg2 integrity errors, which quote the whole row.
        raise RuntimeError(
            f"Failing row contains ({body.child_first_name}, {body.child_last_name}, {body.child_birth_date}, "
            f"{body.allergies}, {body.parent_email}, {token})"
        )

    return app


def _all_text(transport: _Capture) -> str:
    sentry_sdk.flush()
    return "\n".join(transport.sent)


def test_unhandled_error_reaches_sentry_without_personal_data(captured):
    client = TestClient(_app(), raise_server_exceptions=False)
    r = client.post(
        f"/api/v1/bookings/{TOKEN}?email=max.test@example.com",
        json=dict(child_first_name="Maximiliane", child_last_name="Mustermann-Test", child_birth_date="2015-04-01",
                  allergies="Erdnussallergie", parent_email="max.test@example.com", parent_phone="0151-0000000"),
        headers={"Authorization": "Bearer-secret-value", "Cookie": "sid=session-cookie-value"},
    )
    assert r.status_code == 500
    text = _all_text(captured)
    assert '"type":"RuntimeError"' in text.replace(": ", ":"), "the error itself must arrive"
    assert "explode" in text, "the stack frame must arrive"
    for secret in SECRETS:
        assert secret not in text, f"{secret!r} leaked to Sentry"


def test_logged_error_reaches_sentry_without_interpolated_values(captured):
    import logging

    log = logging.getLogger("app.test")
    # Lower-level lines before the error must not travel along as breadcrumbs.
    log.info("Pilot request from ip=%s for %s", "203.0.113.7", "max.test@example.com")
    logging.getLogger("httpx").info("HTTP Request: GET https://x.supabase.co/auth/v1/admin/users?email=max.test%40example.com")
    log.warning("Reminder skipped for Maximiliane")
    log.error("Mail to %s failed for booking %s", "max.test@example.com", TOKEN)
    text = _all_text(captured)
    assert "Mail to %s failed" in text
    for secret in ("max.test@example.com", "max.test%40example.com", TOKEN, "203.0.113.7", "Maximiliane", "supabase.co"):
        assert secret not in text, f"{secret!r} leaked to Sentry"


def test_preformatted_error_text_is_dropped(captured):
    import logging

    name, born = "Maximiliane", "2015-04-01"
    logging.getLogger("thirdparty").error(f"failed for {name} born {born}")
    text = _all_text(captured)
    assert '"logger":"thirdparty"' in text.replace(": ", ":"), "the event itself must arrive"
    assert "Maximiliane" not in text and "2015-04-01" not in text


def test_third_party_log_templates_are_dropped_too(captured):
    import logging

    name = "Maximiliane"
    logging.getLogger("thirdparty").error(f"mixed {name}: %s", "x")
    assert "Maximiliane" not in _all_text(captured)


def test_no_tracing_headers_sessions_or_extra_integrations(captured):
    client = sentry_sdk.get_client()
    assert client.options["traces_sample_rate"] is None
    assert client.options["trace_propagation_targets"] == []
    assert client.options["auto_session_tracking"] is False
    assert client.options["max_breadcrumbs"] == 0
    assert not any('"type":"session' in item.replace(": ", ":") for item in captured.sent)


def test_scrub_event_removes_request_payload_and_frame_variables():
    event = {
        "message": f"booking {TOKEN} for max.test@example.com",
        "transaction": f"/api/v1/bookings/{TOKEN}",
        "user": {"email": "max.test@example.com", "ip_address": "203.0.113.7"},
        "extra": {"child": "Maximiliane"},
        "tags": {"child": "Maximiliane"},
        "logentry": {"message": "saved Maximiliane"},
        "request": {
            "url": f"https://api.example.test/api/v1/bookings/{TOKEN}?name=Maximiliane",
            "method": "POST",
            "query_string": "name=Maximiliane",
            "data": {"child_first_name": "Maximiliane", "allergies": "Erdnussallergie"},
            "cookies": {"sid": "session-cookie-value"},
            "env": {"REMOTE_ADDR": "203.0.113.7"},
            "headers": {"Authorization": "Bearer-secret-value", "User-Agent": "pytest", "Content-Type": "application/json"},
        },
        "exception": {"values": [{
            "type": "CheckViolation",
            "value": "Failing row contains (Maximiliane, Mustermann-Test, 2015-04-01)",
            "stacktrace": {"frames": [{"function": "create", "lineno": 12, "vars": {"data": "Maximiliane"},
                                       "context_line": "name = 'Maximiliane'"}]},
        }]},
        "breadcrumbs": {"values": [{"category": "query", "message": "select max.test@example.com",
                                    "data": {"params": ["Maximiliane"]}}]},
    }
    cleaned = monitoring.scrub_event(event, {})
    text = json.dumps(cleaned)
    for secret in SECRETS + ["203.0.113.7"]:
        assert secret not in text
    assert "breadcrumbs" not in cleaned and "tags" not in cleaned
    assert cleaned["logentry"] == {"message": monitoring.REMOVED}
    assert cleaned["request"]["method"] == "POST"
    assert cleaned["request"]["headers"] == {"User-Agent": "pytest", "Content-Type": "application/json"}
    assert cleaned["request"]["url"] == "https://api.example.test/api/v1/bookings/[id]"
    assert cleaned["exception"]["values"][0]["type"] == "CheckViolation"
    assert cleaned["exception"]["values"][0]["stacktrace"]["frames"][0] == {"function": "create", "lineno": 12}


def test_scrub_event_drops_the_event_when_cleaning_fails():
    class Broken(dict):
        def get(self, *_args, **_kwargs):
            raise ValueError("boom")

    assert monitoring.scrub_event(Broken(), {}) is None


def test_mask_text_caps_length():
    assert len(monitoring.mask_text("x" * 5000)) <= 301


@pytest.mark.parametrize("dsn, env, expected", [("", "production", False), ("  ", "staging", False),
                                                  ("https://public@o0.ingest.de.sentry.io/0", "test", False)])
def test_sentry_stays_off_without_dsn_and_in_tests(monkeypatch, dsn, env, expected):
    called = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: called.append(kwargs))
    settings = SimpleNamespace(sentry_dsn=dsn, app_env=env, sentry_environment="", sentry_release="")
    assert monitoring.init_sentry(settings) is expected
    assert called == []


def test_sentry_starts_with_privacy_options(monkeypatch):
    called = []
    monkeypatch.setattr(sentry_sdk, "init", lambda **kwargs: called.append(kwargs))
    settings = SimpleNamespace(sentry_dsn="https://public@o0.ingest.de.sentry.io/0", app_env="production",
                               sentry_environment="", sentry_release="abc123")
    assert monitoring.init_sentry(settings) is True
    (options,) = called
    assert options["environment"] == "production" and options["release"] == "abc123"
    assert options["send_default_pii"] is False
    assert options["include_local_variables"] is False
    assert options["max_request_body_size"] == "never"
    assert "traces_sample_rate" not in options
    assert options["include_source_context"] is False
    assert options["auto_enabling_integrations"] is False
    assert options["before_send"] is monitoring.scrub_event
    assert options["before_breadcrumb"] is monitoring.drop_breadcrumb


def test_broken_dsn_does_not_stop_the_api(caplog):
    settings = SimpleNamespace(sentry_dsn='"not-a-dsn"', app_env="production", sentry_environment="", sentry_release="")
    assert monitoring.init_sentry(settings) is False
    assert "not-a-dsn" not in caplog.text


# ---------- test endpoint ----------

def _post_test(monkeypatch, headers, secret="s3cret-for-tests-only"):
    from app.main import app

    monkeypatch.setattr(internal, "get_settings", lambda: SimpleNamespace(cron_secret=secret))
    with TestClient(app, raise_server_exceptions=False) as client:
        return client.post("/internal/sentry-test", headers=headers)


def test_sentry_test_endpoint_requires_the_cron_secret(monkeypatch):
    assert _post_test(monkeypatch, {}).status_code == 401
    assert _post_test(monkeypatch, {"Authorization": "Bearer wrong"}).status_code == 401
    assert _post_test(monkeypatch, {"Authorization": "Bearer x"}, secret=None).status_code == 503


def test_sentry_test_endpoint_raises_the_marker_error(monkeypatch):
    r = _post_test(monkeypatch, {"Authorization": "Bearer s3cret-for-tests-only"})
    assert r.status_code == 500
    assert "Sentry" not in r.text, "the response must not describe the internal error"
