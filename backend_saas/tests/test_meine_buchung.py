"""Section B: public "Meine Buchung" status, links in parent mails (self-cancel: test_parent_self_cancel.py).

Disposable local Postgres (REVIEW_POSTGRES_PORT), FakeProvider for mail, synthetic data only.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.notifications.templates import build_registration_mail
from app.routers import booking
from .auth_helpers import org_admin_headers
from .selfservice_helpers import make_camp, make_other_org, make_reg
from .test_review_postgres import local_database, real_db  # noqa: F401

FORBIDDEN = ("Pia", "Parent", "p@example.com", "0561 1234", "Geheimweg", "34117", "Kassel", "Nuesse", "Asthma",
             "emergency", "allerg", "medical", "parent_", "iban", "registration_token")
EXPECTED_KEYS = {"camp_title", "start_date", "end_date", "starts_at", "child_first_name", "status", "payment_status",
                 "amount_cents", "currency", "cancellation_requested_at", "invoice_available",
                 "self_cancel"}


@pytest.fixture
def env(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    booking.booking_limiter.reset()
    booking.cancellation_limiter.reset()
    with cursor() as cur:
        cur.execute("delete from camp_registrations")
        cur.execute("delete from audit_log where action like 'registration.cancel%'")
        cur.execute("delete from organization_members where organization_id = %s", (org,))
        other, other_slug = make_other_org(cur)
        camp_id = make_camp(cur, org, date(2027, 7, 9), start=date(2027, 7, 5), title="Sommercamp")
    fake = FakeProvider()
    fake.delivers = True
    reset_provider_for_testing(fake)
    with TestClient(app) as client:
        yield type("Env", (), dict(client=client, cursor=cursor, org=org, slug=tenant.slug, camp=camp_id,
                                   other=other, other_slug=other_slug, mail=fake))
    reset_provider_for_testing(None)
    booking.booking_limiter.reset()
    booking.cancellation_limiter.reset()


def _url(env, token, slug=None, suffix=""):
    return f"/api/v1/organizations/{slug or env.slug}/registrations/{token}{suffix}"


def _new(env, **kw):
    with env.cursor() as cur:
        return make_reg(cur, env.org, env.camp, **kw)


def _row(env, token):
    with env.cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()


# ---------- GET status ----------

def test_status_returns_only_booking_fields(env):
    token = _new(env, payment_status="open")
    r = env.client.get(_url(env, token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == EXPECTED_KEYS
    assert body["camp_title"] == "Sommercamp" and body["child_first_name"] == "Kim"
    assert body["status"] == "registered" and body["payment_status"] == "open"
    assert body["amount_cents"] == 1000 and body["currency"] == "EUR"
    assert body["cancellation_requested_at"] is None and body["invoice_available"] is False
    assert body["start_date"] == "2027-07-05" and body["end_date"] == "2027-07-09"
    text = r.text.lower()
    for word in FORBIDDEN:
        assert word.lower() not in text, word


@pytest.mark.parametrize("db_status,expected", [("registered", "registered"), ("confirmed", "registered"),
                                                ("waitlist", "waitlist"), ("cancelled", "cancelled")])
def test_status_values(env, db_status, expected):
    token = _new(env, status=db_status)
    assert env.client.get(_url(env, token)).json()["status"] == expected


def test_status_amount_prefers_applied_then_booked_price(env):
    token = _new(env)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set booked_price_cents=900 where registration_token=%s", (token,))
    assert env.client.get(_url(env, token)).json()["amount_cents"] == 900
    with env.cursor() as cur:
        cur.execute("update camp_registrations set applied_price_cents=500 where registration_token=%s", (token,))
    assert env.client.get(_url(env, token)).json()["amount_cents"] == 500


def test_status_unknown_token_404(env):
    assert env.client.get(_url(env, uuid4())).status_code == 404


def test_status_invalid_token_is_422_not_500(env):
    assert env.client.get(_url(env, "not-a-uuid")).status_code == 422


def test_status_token_of_another_organization_404(env):
    with env.cursor() as cur:
        camp = make_camp(cur, env.other, date(2027, 7, 9))
        foreign = make_reg(cur, env.other, camp)
    assert env.client.get(_url(env, foreign)).status_code == 404  # asked under my slug
    assert env.client.get(_url(env, foreign, slug=env.other_slug)).status_code == 200  # sanity: it exists
    mine = _new(env)
    assert env.client.get(_url(env, mine, slug=env.other_slug)).status_code == 404


def test_status_anonymized_booking_404(env):
    token = _new(env, anonymized=True, allergies=None, medical=None)
    assert env.client.get(_url(env, token)).status_code == 404


def test_status_unknown_organization_404(env):
    assert env.client.get(_url(env, _new(env), slug="does-not-exist")).status_code == 404


def test_status_shows_cancellation_request_and_invoice_flag(env):
    token = _new(env, cancellation_requested=True, payment_status="paid")
    reg = _row(env, token)
    with env.cursor() as cur:
        cur.execute(
            """insert into invoices (organization_id, registration_id, kind, number, year, sequence, issue_date, net_cents,
                   vat_cents, gross_cents, tax_status, recipient_email, data, pdf)
               values (%s,%s,'invoice',%s,2027,1,'2027-01-01',1000,0,1000,'kleinunternehmer','p@example.com','{}',''::bytea)""",
            (env.org, reg["id"], f"T-{uuid4().hex[:6]}"),
        )
    body = env.client.get(_url(env, token)).json()
    assert body["cancellation_requested_at"] is not None
    assert body["invoice_available"] is True and body["payment_status"] == "paid"


def test_status_is_rate_limited_per_ip(env, monkeypatch):
    monkeypatch.setattr(booking, "booking_limiter", booking.SlidingWindowLimiter(3, 3600.0))
    token = _new(env)
    codes = [env.client.get(_url(env, token)).status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


# ---------- admin list ----------

def test_admin_list_shows_cancellation_requested_at(env):
    token = _new(env, cancellation_requested=True)
    _new(env, child="Other")
    with env.cursor() as cur:
        cur.execute("select slug from camps where id=%s", (env.camp,))
        camp_slug = cur.fetchone()["slug"]
    r = env.client.get(f"/admin/organizations/{env.slug}/camps/{camp_slug}/registrations", headers=org_admin_headers(str(env.org)))
    assert r.status_code == 200, r.text
    by_token = {x["registration_token"]: x for x in r.json()}
    assert by_token[str(token)]["cancellation_requested_at"] is not None
    assert sum(1 for x in r.json() if x["cancellation_requested_at"] is None) == 1


# ---------- booking link in confirmation / waitlist mails ----------

def _mail(status, url="https://app.example.com/pilot/v/buchung/abc"):
    return build_registration_mail(
        status=status, org_name="Verein", org_email="v@example.com", org_phone=None, camp_title="Camp",
        camp_start=date(2027, 7, 5), camp_end=date(2027, 7, 9), parent_email="p@example.com",
        payment_reference="CP-1", iban=None, booking_url=url)


@pytest.mark.parametrize("status", ["registered", "confirmed", "waitlist"])
def test_registration_and_waitlist_mail_contain_booking_link(status):
    html = _mail(status).html_content
    assert 'href="https://app.example.com/pilot/v/buchung/abc"' in html and "Ihre Anmeldung ansehen" in html


def test_mail_without_booking_url_has_no_link():
    assert "Ihre Anmeldung ansehen" not in _mail("registered", url=None).html_content


def test_sent_confirmation_uses_frontend_base_url_and_token(env, monkeypatch):
    from app.notifications import sending
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "frontend_base_url", "http://localhost:3000")
    token = _new(env)
    sending._do_send(registration_token=token, status="registered", organization_id=env.org, camp_id=env.camp,
                     start_date=date(2027, 7, 5), end_date=date(2027, 7, 9), parent_email="p@example.com",
                     parent_first_name="Pia", parent_last_name="Parent", child_first_name="Kim", child_last_name="X")
    html = env.mail.sent[-1].html_content
    assert f"http://localhost:3000/pilot/{env.slug}/buchung/{token}" in html
    env.mail.sent.clear()
    with env.cursor() as cur:
        cur.execute("update camp_registrations set status='waitlist' where registration_token=%s", (token,))
    sending._send_for_status(token, env.org, "current")
    assert f"/pilot/{env.slug}/buchung/{token}" in env.mail.sent[-1].html_content
    with env.cursor() as cur:
        cur.execute("update camp_registrations set status='cancelled' where registration_token=%s", (token,))
    env.mail.sent.clear()
    sending._send_for_status(token, env.org, "current")
    assert "buchung/" not in env.mail.sent[-1].html_content  # cancellation mail has no booking link
