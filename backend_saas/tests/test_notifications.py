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

import pytest

from app.notifications import sending
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.notifications.templates import build_registration_mail
from app.notifications.mail import MailMessage


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
    marked = []
    _patch(monkeypatch, mark_sent=lambda token: marked.append(token))
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
    _patch(monkeypatch, mark_error=lambda token, err: errors.append(err))

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

    call_count = [0]
    original_mark_sent = lambda token: None

    def counting_mark_sent(token):
        call_count[0] += 1

    # First call: reg has no sent_at, send succeeds
    _patch(monkeypatch, reg=_reg(email_sent_at=None), mark_sent=counting_mark_sent)
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    # Second call: reg now shows sent_at (simulate idempotency via fixed patch)
    _patch(monkeypatch, reg=_reg(email_sent_at=datetime.now(timezone.utc)))
    sending.retry_registration_notification(_TOKEN, _ORG_ID)

    assert len(fake_provider.sent) == 1  # only first call sent
