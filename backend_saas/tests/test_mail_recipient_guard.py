"""Non-production mail guard: staging must never mail real parents or clubs."""

import pytest

from app.notifications import mail as mail_mod
from app.notifications.mail import (
    BrevoProvider,
    MailMessage,
    RecipientGuardProvider,
    reset_provider_for_testing,
)


class _Inner:
    delivers = True

    def __init__(self):
        self.sent = []

    def send(self, message):
        self.sent.append(message)


def _msg(to):
    return MailMessage(to_email=to, subject="Test", html_content="<p>x</p>")


@pytest.fixture(autouse=True)
def _reset():
    reset_provider_for_testing(None)
    yield
    reset_provider_for_testing(None)


def test_guard_allows_exact_address_and_domain():
    inner = _Inner()
    guard = RecipientGuardProvider(inner, ["qa@campspilot.app", " @Example.COM "], "staging")
    guard.send(_msg("QA@campspilot.app"))
    guard.send(_msg("eltern@example.com"))
    assert [m.to_email for m in inner.sent] == ["QA@campspilot.app", "eltern@example.com"]
    assert guard.delivers is True


@pytest.mark.parametrize(
    "to", ["info@ksv-baunatal.de", "eltern@example.com.evil.de", "x@sub.example.com", "kaputt", ""]
)
def test_guard_blocks_everything_else(to):
    inner = _Inner()
    guard = RecipientGuardProvider(inner, ["@example.com"], "staging")
    with pytest.raises(RuntimeError, match="Blocked outside production"):
        guard.send(_msg(to))
    assert inner.sent == []


def test_empty_allowlist_blocks_all():
    guard = RecipientGuardProvider(_Inner(), [""], "staging")
    with pytest.raises(RuntimeError):
        guard.send(_msg("someone@example.com"))


@pytest.mark.parametrize("app_env", ["staging", "staging (Text)", "local", "preview", "prod"])
def test_brevo_is_guarded_outside_exact_production(monkeypatch, app_env):
    monkeypatch.setenv("NOTIFICATION_PROVIDER", "brevo")
    monkeypatch.setenv("BREVO_API_KEY", "not-a-real-key")
    monkeypatch.setenv("APP_ENV", app_env)
    monkeypatch.setenv("NOTIFICATION_ALLOWED_RECIPIENTS", "@example.com")
    provider = mail_mod._build_provider()
    assert isinstance(provider, RecipientGuardProvider)


@pytest.mark.parametrize("app_env", ["production", "Production", " production "])
def test_brevo_unguarded_in_production(monkeypatch, app_env):
    monkeypatch.setenv("NOTIFICATION_PROVIDER", "brevo")
    monkeypatch.setenv("BREVO_API_KEY", "not-a-real-key")
    monkeypatch.setenv("APP_ENV", app_env)
    provider = mail_mod._build_provider()
    assert isinstance(provider, BrevoProvider)


def test_blocked_registration_mail_is_recorded_not_sent(monkeypatch):
    """Through send_registration_notification: parent (max@example.com) and club
    contact are blocked by a staging allowlist -> email_error once, no email_sent_at."""
    from tests.test_notifications import _call_send, _patch

    inner = _Inner()
    reset_provider_for_testing(RecipientGuardProvider(inner, ["qa@campspilot.app"], "staging"))
    errors, sent = [], []
    _patch(
        monkeypatch,
        mark_error=lambda token, err, org_id: errors.append(err),
        mark_sent=lambda token, org_id: sent.append(token),
    )
    _call_send()
    assert inner.sent == []
    assert sent == []
    assert len(errors) == 1 and "NOTIFICATION_ALLOWED_RECIPIENTS" in errors[0]


def test_allowed_registration_mail_is_marked_sent(monkeypatch):
    from tests.test_notifications import _call_send, _patch

    inner = _Inner()
    reset_provider_for_testing(RecipientGuardProvider(inner, ["@example.com"], "staging"))
    sent = []
    _patch(monkeypatch, mark_sent=lambda token, org_id: sent.append(token))
    _call_send()
    assert any(m.to_email == "max@example.com" for m in inner.sent)
    assert len(sent) == 1


def test_guard_logs_once_at_build_and_ignores_entries_without_at(monkeypatch, caplog):
    monkeypatch.setenv("NOTIFICATION_PROVIDER", "brevo")
    monkeypatch.setenv("BREVO_API_KEY", "not-a-real-key")
    monkeypatch.setenv("APP_ENV", "staging")
    monkeypatch.setenv("NOTIFICATION_ALLOWED_RECIPIENTS", "example.com, qa@campspilot.app")
    with caplog.at_level("WARNING"):
        provider = mail_mod._build_provider()
    assert "guard ACTIVE" in caplog.text and "without '@'" in caplog.text
    assert provider.is_allowed("qa@campspilot.app")
    assert not provider.is_allowed("someone@example.com")


def test_signup_mail_failure_log_has_no_address(caplog):
    from app.notifications.sending import send_signup_confirmation_email

    reset_provider_for_testing(RecipientGuardProvider(_Inner(), [], "staging"))
    with caplog.at_level("WARNING"):
        ok = send_signup_confirmation_email(
            to_email="geheim@example.com", org_name="Testverein", confirmation_link="https://x.test/c"
        )
    assert ok is False
    assert "geheim@example.com" not in caplog.text
    assert "Testverein" in caplog.text
