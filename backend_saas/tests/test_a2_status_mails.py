"""A2: parents learn about cancellation / waitlist promotion; clubs see failed mails and can resend."""

from __future__ import annotations

from datetime import date, datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications import sending
from app.notifications.mail import FakeProvider, RecipientGuardProvider, reset_provider_for_testing
from app.notifications.templates import build_cancellation_mail, build_registration_mail
from app.repositories import camps as camps_repo
from app.repositories import organizations
from app.repositories import platform_roles
from app.repositories import registrations as registrations_repo

from .auth_helpers import owner_headers

ORG_ID = uuid4()
CAMP_ID = uuid4()


def _ctx():
    return {
        "org_name": "Testverein",
        "payee_name": "Testverein e.V.",
        "org_email": "verein@example.com",
        "org_phone": None,
        "iban": "DE89370400440532013000",
        "camp_title": "Herbstcamp",
        "price_cents": 14900,
        "currency": "EUR",
    }


def _reg(status="registered"):
    return {
        "registration_token": uuid4(),
        "status": status,
        "parent_first_name": "Eva",
        "parent_last_name": "Muster",
        "parent_email": "eva@example.com",
        "child_first_name": "Mia",
        "child_last_name": "Muster",
        "email_sent_at": None,
        "camp_id": CAMP_ID,
        "start_date": date(2027, 7, 5),
        "end_date": date(2027, 7, 9),
    }


@pytest.fixture()
def fake(monkeypatch):
    provider = FakeProvider()
    provider.delivers = True
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


def _wire(monkeypatch, reg, marks):
    monkeypatch.setattr(sending, "_fetch_registration", lambda token, org: reg)
    monkeypatch.setattr(sending, "_fetch_mail_context", lambda org, camp: _ctx())
    monkeypatch.setattr(sending, "_mark_sent", lambda token, org: marks.append(("sent", token)))
    monkeypatch.setattr(sending, "_mark_error", lambda token, err, org: marks.append(("error", err)))


# --- templates -------------------------------------------------------------

def test_promoted_mail_says_spot_opened_and_has_payment_data():
    msg = build_registration_mail(
        status="registered", org_name="Testverein", org_email="verein@example.com", org_phone=None,
        camp_title="Herbstcamp", camp_start=date(2027, 7, 5), camp_end=date(2027, 7, 9),
        parent_email="eva@example.com", payment_reference="Herbstcamp CP-ABCD1234",
        iban="DE89370400440532013000", promoted=True,
    )
    assert msg.subject == "Platz frei – Ihre Anmeldung ist bestätigt – Herbstcamp"
    assert "Platz frei geworden" in msg.html_content
    assert "DE89370400440532013000" in msg.html_content
    assert "Mia" not in msg.subject


def test_regular_confirmation_unchanged():
    msg = build_registration_mail(
        status="registered", org_name="T", org_email="t@example.com", org_phone=None,
        camp_title="Herbstcamp", camp_start=date(2027, 7, 5), camp_end=date(2027, 7, 9),
        parent_email="eva@example.com", payment_reference="X", iban=None,
    )
    assert msg.subject == "Anmeldebestätigung – Herbstcamp"
    assert "ist bei uns eingegangen" in msg.html_content


def test_cancellation_mail_escapes_and_names_club_contact():
    msg = build_cancellation_mail(
        org_name="<b>Verein</b>", org_email="verein@example.com", org_phone="0561 1",
        camp_title="Camp & Co", camp_start=date(2027, 7, 5), camp_end=date(2027, 7, 9),
        parent_email="eva@example.com",
    )
    assert msg.subject == "Anmeldung storniert – Camp & Co"
    assert "<b>Verein</b>" not in msg.html_content and "&lt;b&gt;Verein&lt;/b&gt;" in msg.html_content
    assert msg.reply_to == "verein@example.com" and msg.to_email == "eva@example.com"


# --- sending ---------------------------------------------------------------

def test_status_change_promoted_sends_and_marks_sent(monkeypatch, fake):
    marks = []
    reg = _reg("registered")
    _wire(monkeypatch, reg, marks)
    sending.send_status_change_notification(reg["registration_token"], ORG_ID, "promoted")
    assert fake.sent[0].subject.startswith("Platz frei")
    assert fake.sent[0].sender_name == "Testverein über CampsPilot"
    assert marks == [("sent", reg["registration_token"])]


def test_status_change_cancelled_sends_cancellation(monkeypatch, fake):
    marks = []
    reg = _reg("cancelled")
    _wire(monkeypatch, reg, marks)
    sending.send_status_change_notification(reg["registration_token"], ORG_ID, "cancelled")
    assert fake.sent[0].subject == "Anmeldung storniert – Herbstcamp"


def test_status_change_failure_is_recorded_never_raised(monkeypatch):
    marks = []
    reg = _reg("registered")
    _wire(monkeypatch, reg, marks)
    reset_provider_for_testing(RecipientGuardProvider(FakeProvider(), [], "staging"))
    try:
        sending.send_status_change_notification(reg["registration_token"], ORG_ID, "promoted")
    finally:
        reset_provider_for_testing(None)
    assert marks == [("error", "promoted: blocked_outside_production")]


def test_resend_uses_current_status_and_raises_on_failure(monkeypatch, fake):
    marks = []
    reg = _reg("waitlist")
    _wire(monkeypatch, reg, marks)
    sending.resend_registration_mail(reg["registration_token"], ORG_ID)
    assert fake.sent[0].subject == "Wartelistenbestätigung – Herbstcamp"
    reset_provider_for_testing(RecipientGuardProvider(FakeProvider(), [], "staging"))
    with pytest.raises(RuntimeError):
        sending.resend_registration_mail(reg["registration_token"], ORG_ID)
    assert marks[-1] == ("error", "current: blocked_outside_production")


def test_resend_after_failed_promoted_mail_resends_platz_frei(monkeypatch, fake):
    marks = []
    reg = {**_reg("registered"), "email_error": "promoted: provider_http_500"}
    _wire(monkeypatch, reg, marks)
    sending.resend_registration_mail(reg["registration_token"], ORG_ID)
    assert fake.sent[0].subject.startswith("Platz frei")


def test_error_code_hides_provider_text():
    import httpx

    request = httpx.Request("POST", "https://api.brevo.com/v3/smtp/email")
    response = httpx.Response(400, request=request, text="invalid email eva@example.com")
    exc = httpx.HTTPStatusError("Client error for eva@example.com", request=request, response=response)
    assert sending._error_code(exc) == "provider_http_400"
    assert sending._error_code(ValueError("eva@example.com")) == "ValueError"


def test_plus_address_reaches_listed_base_inbox_only():
    guard = RecipientGuardProvider(FakeProvider(), ["tester@example.org"], "staging")
    assert guard.is_allowed("tester+verein1@example.org")
    assert guard.is_allowed("TESTER@example.org")
    assert not guard.is_allowed("tester+x@other.org")
    assert not guard.is_allowed("other+tester@example.org")


# --- admin API -------------------------------------------------------------

def _org():
    return {"id": ORG_ID, "slug": "demo-fc", "name": "Demo", "legal_name": None, "contact_email": "d@example.com",
            "contact_phone": None, "logo_url": None, "primary_color": None, "plan_status": "pilot"}


def _camp():
    return {"id": CAMP_ID, "organization_id": ORG_ID, "slug": "summer-1", "title": "Summer", "status": "published"}


def _api(monkeypatch):
    calls, audit = [], []
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: _org())
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: _camp())
    monkeypatch.setattr(platform_roles, "write_audit_log", lambda **kw: audit.append(kw))
    monkeypatch.setattr(sending, "send_status_change_notification", lambda token, org, kind: calls.append((kind, token)))
    return calls, audit


def test_cancel_mails_cancelled_parent_and_promoted_parent(monkeypatch):
    calls, _ = _api(monkeypatch)
    cancelled_token, promoted_token = uuid4(), uuid4()
    monkeypatch.setattr(registrations_repo, "cancel_registration_and_promote_next", lambda t, c, r: {
        "cancelled": {"registration_token": cancelled_token, "status": "cancelled", "payment_status": "open"},
        "promoted": {"registration_token": promoted_token, "status": "registered", "payment_status": "open"},
    })
    with TestClient(app) as client:
        r = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{cancelled_token}/cancel",
                        headers=owner_headers())
    assert r.status_code == 200
    assert calls == [("cancelled", cancelled_token), ("promoted", promoted_token)]


def test_manual_promote_mails_parent_and_is_audited(monkeypatch):
    calls, audit = _api(monkeypatch)
    token = uuid4()
    monkeypatch.setattr(registrations_repo, "promote_next_waitlisted_registration", lambda t, c: {
        "registration_token": token, "status": "registered", "payment_status": "open"})
    with TestClient(app) as client:
        r = client.post("/admin/organizations/demo-fc/camps/summer-1/waitlist/promote", headers=owner_headers())
    assert r.status_code == 200
    assert calls == [("promoted", token)]
    assert audit[0]["action"] == "registration.waitlist_promoted"


def test_resend_endpoint_success_422_and_404(monkeypatch):
    _, audit = _api(monkeypatch)
    token = uuid4()
    row = {"registration_token": token, "email_sent_at": datetime(2027, 1, 1, tzinfo=timezone.utc)}
    monkeypatch.setattr(registrations_repo, "list_registrations_for_camp", lambda o, c: [row])
    sent = []
    monkeypatch.setattr(sending, "resend_registration_mail", lambda t, o: sent.append(t))
    with TestClient(app) as client:
        ok = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{token}/resend-mail",
                         headers=owner_headers())
        missing = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/resend-mail",
                              headers=owner_headers())

        def boom(t, o):
            raise RuntimeError("provider down")

        monkeypatch.setattr(sending, "resend_registration_mail", boom)
        failed = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{token}/resend-mail",
                             headers=owner_headers())
    assert ok.status_code == 200 and sent == [token]
    assert audit[0]["action"] == "registration.mail_resent"
    assert missing.status_code == 404
    assert failed.status_code == 422 and "provider" not in failed.text


def test_resend_requires_auth():
    with TestClient(app) as client:
        r = client.post(f"/admin/organizations/demo-fc/camps/summer-1/registrations/{uuid4()}/resend-mail")
    assert r.status_code == 401
