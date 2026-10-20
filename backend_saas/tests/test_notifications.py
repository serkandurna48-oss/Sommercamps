"""
Tests for app/notifications — mail provider, templates, and send/retry logic.

All tests are unit tests: no real DB, no real network calls.
  - FakeProvider captures sent messages for assertions.
  - sending._fetch_mail_context / _fetch_registration / _mark_sent / _mark_error
    are monkeypatched per test to return controlled data.
"""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import httpx
import pytest

from app.notifications import sending
from app.notifications.mail import (
    BrevoProvider,
    FakeProvider,
    MailMessage,
    reset_provider_for_testing,
)
from app.notifications.templates import build_registration_mail


class _RealMockProvider:
    """Test-only stand-in with delivers=True: records sent messages without network calls."""

    delivers: bool = True

    def __init__(self) -> None:
        self.sent: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.sent.append(message)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

_ORG_ID = uuid4()
_CAMP_ID = uuid4()
_TOKEN = uuid4()
_EXPECTED_PAYMENT_REF = f"CP-{str(_TOKEN)[:8].upper()}"


def _ctx() -> dict:
    return {
        "org_name": "JK Performance Academy",
        "org_email": "info@jk.example",
        "org_phone": "+49 123 456",
        "iban": "DE89370400440532013000",
        "camp_title": "Sommercamp 2027",
    }


def _reg(
    status: str = "registered",
    email_sent_at=None,
    registration_token=None,
) -> dict:
    return {
        "registration_token": registration_token or _TOKEN,
        "status": status,
        "parent_first_name": "Max",
        "parent_last_name": "Mustermann",
        "parent_email": "max@example.com",
        "child_first_name": "Lena",
        "child_last_name": "Mustermann",
        "email_sent_at": email_sent_at,
        "camp_id": _CAMP_ID,
        "start_date": date(2027, 7, 5),
        "end_date": date(2027, 7, 9),
    }


@pytest.fixture(autouse=True)
def fake_provider():
    provider = FakeProvider()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


def _patch(monkeypatch, ctx=None, reg=None, mark_sent=None, mark_error=None):
    monkeypatch.setattr(sending, "_fetch_mail_context", lambda *_: ctx if ctx is not None else _ctx())
    monkeypatch.setattr(sending, "_fetch_registration", lambda *_: reg)
    monkeypatch.setattr(sending, "_mark_sent", mark_sent or (lambda *_: None))
    monkeypatch.setattr(sending, "_mark_error", mark_error or (lambda *_: None))


def _call_send(status: str = "registered"):
    sending.send_registration_notification(
        registration_token=_TOKEN,
        status=status,
        organization_id=_ORG_ID,
        camp_id=_CAMP_ID,
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        parent_email="max@example.com",
        parent_first_name="Max",
        parent_last_name="Mustermann",
        child_first_name="Lena",
        child_last_name="Mustermann",
    )


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def test_registered_mail_subject_contains_camp_title():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "Anmeldebestätigung" in msg.subject
    assert "Sommercamp 2027" in msg.subject


def test_registered_mail_body_contains_child_name_and_payment_ref():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "Lena Mustermann" in msg.html_content
    assert "CP-ABCD1234" in msg.html_content
    assert "DE89370400440532013000" in msg.html_content


def test_registered_mail_without_iban_omits_payment_block():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban=None,
    )
    assert "CP-ABCD1234" not in msg.html_content


def test_waitlist_mail_subject_contains_warteliste():
    msg = build_registration_mail(
        status="waitlist",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "Warteliste" in msg.subject


def test_waitlist_mail_body_has_no_payment_details():
    msg = build_registration_mail(
        status="waitlist",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "CP-ABCD1234" not in msg.html_content
    assert "DE89370400440532013000" not in msg.html_content


def test_waitlist_mail_body_has_no_deadline_promise():
    msg = build_registration_mail(
        status="waitlist",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban=None,
    )
    assert "zusagen" not in msg.html_content.lower()
    assert "48" not in msg.html_content


def test_registered_mail_with_iban_shows_amount_and_recipient():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
        price_cents=14900,
        currency="EUR",
    )
    assert "149" in msg.html_content
    assert "EUR" in msg.html_content
    assert "JK Academy" in msg.html_content
    assert "DE89370400440532013000" in msg.html_content
    assert "CP-ABCD1234" in msg.html_content


def test_registered_mail_without_iban_shows_provider_hint():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban=None,
    )
    assert "Zahlungsdetails" in msg.html_content
    assert "JK Academy" in msg.html_content
    assert "CP-ABCD1234" not in msg.html_content


def test_waitlist_mail_body_has_no_iban_block():
    msg = build_registration_mail(
        status="waitlist",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name="Lena Mustermann",
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "IBAN" not in msg.html_content
    assert "DE89370400440532013000" not in msg.html_content


def test_html_escaping_of_malicious_child_name():
    msg = build_registration_mail(
        status="registered",
        org_name="JK Academy",
        org_email="info@jk.example",
        org_phone=None,
        camp_title="Sommercamp 2027",
        camp_start=date(2027, 7, 5),
        camp_end=date(2027, 7, 9),
        parent_name="Max Mustermann",
        parent_email="max@example.com",
        child_name='<script>alert("xss")</script>',
        payment_reference="CP-ABCD1234",
        iban="DE89370400440532013000",
    )
    assert "<script>" not in msg.html_content
    assert "&lt;script&gt;" in msg.html_content


# ---------------------------------------------------------------------------
# send_registration_notification
# ---------------------------------------------------------------------------


def test_registered_sends_one_mail_with_correct_subject(monkeypatch, fake_provider):
    _patch(monkeypatch)
    _call_send("registered")

    assert len(fake_provider.sent) == 1
    assert "Anmeldebestätigung" in fake_provider.sent[0].subject
    assert "Sommercamp 2027" in fake_provider.sent[0].subject


def test_waitlist_sends_one_mail_with_waitlist_subject(monkeypatch, fake_provider):
    _patch(monkeypatch)
    _call_send("waitlist")

    assert len(fake_provider.sent) == 1
    assert "Warteliste" in fake_provider.sent[0].subject


def test_send_marks_sent_on_success(monkeypatch, fake_provider):
    # FakeProvider.delivers=False; use a real-delivering provider to verify _mark_sent is called.
    real = _RealMockProvider()
    reset_provider_for_testing(real)

    marked = []
    _patch(monkeypatch, mark_sent=lambda token, org_id: marked.append(token))
    _call_send()

    assert marked == [_TOKEN]


def test_send_does_not_raise_when_provider_fails(monkeypatch, fake_provider):
    def failing_send(msg):
        raise ConnectionError("brevo down")

    fake_provider.send = failing_send
    _patch(monkeypatch)

    _call_send()  # must not raise


def test_send_marks_error_when_provider_fails(monkeypatch, fake_provider):
    def failing_send(msg):
        raise ConnectionError("brevo down")

    fake_provider.send = failing_send
    errors = []
    _patch(monkeypatch, mark_error=lambda token, err, org_id: errors.append(err))

    _call_send()

    assert len(errors) == 1
    assert "brevo down" in errors[0]


def test_send_does_not_raise_when_context_missing(monkeypatch, fake_provider):
    _patch(monkeypatch, ctx=None)
    monkeypatch.setattr(sending, "_fetch_mail_context", lambda *_: None)
    _call_send()  # must not raise


# ---------------------------------------------------------------------------
# retry_registration_notification
# ---------------------------------------------------------------------------


def test_retry_sends_if_not_yet_sent(monkeypatch, fake_provider):
    _patch(monkeypatch, reg=_reg(email_sent_at=None))
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert len(fake_provider.sent) == 1


def test_retry_is_noop_when_already_sent(monkeypatch, fake_provider):
    from datetime import datetime, timezone
    _patch(monkeypatch, reg=_reg(email_sent_at=datetime.now(timezone.utc)))
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert len(fake_provider.sent) == 0


def test_retry_is_noop_when_registration_missing(monkeypatch, fake_provider):
    _patch(monkeypatch, reg=None)
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert len(fake_provider.sent) == 0


def test_sender_name_contains_org_name(monkeypatch, fake_provider):
    _patch(monkeypatch)
    _call_send()

    assert len(fake_provider.sent) == 1
    assert fake_provider.sent[0].sender_name == "JK Performance Academy über CampsPilot"


def test_retry_idempotent_double_call(monkeypatch, fake_provider):
    """Second call after first success sends nothing."""
    from datetime import datetime, timezone

    real = _RealMockProvider()
    reset_provider_for_testing(real)

    call_count = [0]

    def counting_mark_sent(token, org_id):
        call_count[0] += 1

    # First call: reg has no sent_at, send succeeds
    _patch(monkeypatch, reg=_reg(email_sent_at=None), mark_sent=counting_mark_sent)
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    # Second call: reg now shows sent_at (simulate idempotency via fixed patch)
    _patch(monkeypatch, reg=_reg(email_sent_at=datetime.now(timezone.utc)))
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert len(real.sent) == 1  # only first call sent
    assert call_count[0] == 1  # _mark_sent called exactly once


# ---------------------------------------------------------------------------
# B1: BrevoProvider — httpx, no real network
# ---------------------------------------------------------------------------


class _StatusTransport(httpx.BaseTransport):
    def __init__(self, status_code: int) -> None:
        self._status_code = status_code

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        return httpx.Response(self._status_code, json={"messageId": "test-id"})


class _NetworkErrorTransport(httpx.BaseTransport):
    def handle_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated network failure")


def _brevo(status_code: int) -> BrevoProvider:
    client = httpx.Client(transport=_StatusTransport(status_code))
    return BrevoProvider("test-key", "noreply@test.com", "Test Sender", _http_client=client)


def _sample_msg() -> MailMessage:
    return MailMessage(
        to_email="to@test.com",
        to_name="Test User",
        subject="Test Subject",
        html_content="<p>Test</p>",
    )


def test_brevo_2xx_succeeds():
    _brevo(200).send(_sample_msg())  # no exception


def test_brevo_201_succeeds():
    _brevo(201).send(_sample_msg())  # no exception


def test_brevo_4xx_raises():
    with pytest.raises(httpx.HTTPStatusError):
        _brevo(422).send(_sample_msg())


def test_brevo_5xx_raises():
    with pytest.raises(httpx.HTTPStatusError):
        _brevo(500).send(_sample_msg())


def test_brevo_network_error_raises():
    client = httpx.Client(transport=_NetworkErrorTransport())
    provider = BrevoProvider("test-key", "noreply@test.com", "Sender", _http_client=client)
    with pytest.raises(httpx.ConnectError):
        provider.send(_sample_msg())


# ---------------------------------------------------------------------------
# B2: Provider configuration — email_sent_at invariants
# ---------------------------------------------------------------------------


def test_missing_provider_does_not_mark_email_sent_at(monkeypatch):
    """Missing NOTIFICATION_PROVIDER in test env must not set email_sent_at."""
    monkeypatch.delenv("NOTIFICATION_PROVIDER", raising=False)
    reset_provider_for_testing(None)  # force _build_provider() to run

    marked = []
    _patch(monkeypatch, mark_sent=lambda token, org_id: marked.append(token))
    _call_send()

    assert marked == [], "email_sent_at must not be set when NOTIFICATION_PROVIDER is unconfigured"


def test_fake_provider_does_not_mark_email_sent_at(monkeypatch, fake_provider):
    """FakeProvider.send() must not cause email_sent_at to be set (delivers=False)."""
    marked = []
    _patch(monkeypatch, mark_sent=lambda token, org_id: marked.append(token))
    _call_send()

    assert marked == [], "FakeProvider must not set email_sent_at so the send remains retry-able"


def test_retry_reaches_registration_after_provider_switch(monkeypatch, fake_provider):
    """After switching to a real (delivers=True) provider, retry finds the unsent registration."""
    real = _RealMockProvider()
    reset_provider_for_testing(real)

    marked = []
    _patch(
        monkeypatch,
        reg=_reg(email_sent_at=None),
        mark_sent=lambda token, org_id: marked.append(token),
    )
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert marked == [_TOKEN], "retry must mark email_sent_at when a real provider is active"
    assert len(real.sent) == 1


# ---------------------------------------------------------------------------
# B7: organization_id threaded through _mark_sent / _mark_error
# ---------------------------------------------------------------------------

_ORG_A_ID = uuid4()
_ORG_B_ID = uuid4()


def test_mark_sent_receives_organization_id(monkeypatch, fake_provider):
    """_do_send passes the caller's organization_id to _mark_sent (WHERE guards tenant boundary)."""
    real = _RealMockProvider()
    reset_provider_for_testing(real)

    sent_args: list[tuple] = []
    monkeypatch.setattr(sending, "_fetch_mail_context", lambda *_: _ctx())
    monkeypatch.setattr(sending, "_fetch_registration", lambda *_: None)
    monkeypatch.setattr(sending, "_mark_sent", lambda token, org_id: sent_args.append((token, org_id)))
    monkeypatch.setattr(sending, "_mark_error", lambda *_: None)

    sending.send_registration_notification(
        registration_token=_TOKEN,
        status="registered",
        organization_id=_ORG_A_ID,
        camp_id=_CAMP_ID,
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        parent_email="max@example.com",
        parent_first_name="Max",
        parent_last_name="Mustermann",
        child_first_name="Lena",
        child_last_name="Mustermann",
    )

    assert len(sent_args) == 1
    assert sent_args[0] == (_TOKEN, _ORG_A_ID)
    assert sent_args[0][1] != _ORG_B_ID


def test_mark_error_receives_organization_id(monkeypatch, fake_provider):
    """On provider failure, _mark_error receives organization_id so the UPDATE WHERE scopes to org."""
    real = _RealMockProvider()

    def failing_send(msg: MailMessage) -> None:
        raise RuntimeError("provider down")

    real.send = failing_send
    reset_provider_for_testing(real)

    error_args: list[tuple] = []
    monkeypatch.setattr(sending, "_fetch_mail_context", lambda *_: _ctx())
    monkeypatch.setattr(sending, "_fetch_registration", lambda *_: None)
    monkeypatch.setattr(sending, "_mark_sent", lambda *_: None)
    monkeypatch.setattr(
        sending, "_mark_error", lambda token, err, org_id: error_args.append((token, org_id))
    )

    sending.send_registration_notification(
        registration_token=_TOKEN,
        status="registered",
        organization_id=_ORG_B_ID,
        camp_id=_CAMP_ID,
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        parent_email="max@example.com",
        parent_first_name="Max",
        parent_last_name="Mustermann",
        child_first_name="Lena",
        child_last_name="Mustermann",
    )

    assert len(error_args) == 1
    assert error_args[0] == (_TOKEN, _ORG_B_ID)
    assert error_args[0][1] != _ORG_A_ID
