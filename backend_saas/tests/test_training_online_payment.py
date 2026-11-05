"""Online payment (Stripe Checkout, direct charge) for training bookings.
Stripe is always mocked; real local Postgres, synthetic data."""

from __future__ import annotations

from uuid import uuid4
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import stripe
from fastapi.testclient import TestClient

from app.main import app
from app.routers import payments
from .test_training_booking import (  # noqa: F401
    BIRTH, _make, _member, _post, _row, fake_provider,
)
from .test_review_postgres import local_database, real_db  # noqa: F401

ACCOUNT = "acct_1234567890abcdef"


class _Sessions:
    """Fake stripe.checkout.Session with controllable state."""

    def __init__(self, existing=None):
        self.created = []
        self.ids = []  # globally unique: the DB enforces unique checkout session ids
        self.expired = []
        self.existing = existing or {}

    def create(self, **kwargs):
        self.created.append(kwargs)
        n = len(self.created)
        self.ids.append(f"cs_test_{uuid4().hex[:12]}")
        return {"id": self.ids[-1], "url": f"https://checkout.stripe.com/new{n}"}

    def retrieve(self, session_id, **_kwargs):
        return self.existing[session_id]

    def expire(self, session_id, **_kwargs):
        self.expired.append(session_id)
        self.existing[session_id] = {"status": "expired"}


@pytest.fixture
def stripe_env(real_db, monkeypatch):
    cursor, tenant, _ = real_db
    with cursor() as cur:
        cur.execute(
            """update organizations set stripe_account_id=%s, stripe_charges_enabled=true,
                      online_payment_enabled=true where id=%s""", (ACCOUNT, tenant.organization_id))
    sessions = _Sessions()
    client = MagicMock()
    client.checkout.Session = sessions
    settings = SimpleNamespace(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x",
        stripe_webhook_secret="whsec_x", frontend_base_url="https://example.com")
    monkeypatch.setattr(payments, "get_settings", lambda: settings)
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    payments.checkout_limiter.reset()
    yield sessions
    payments.checkout_limiter.reset()


def _checkout(real_db, session, token):
    _, tenant, _ = real_db
    with TestClient(app) as client:
        return client.post(
            f"/api/v1/organizations/{tenant.slug}/camps/{session['slug']}/registrations/{token}/checkout")


def _options(real_db, slug):
    _, tenant, _ = real_db
    with TestClient(app) as client:
        return client.get(f"/api/v1/organizations/{tenant.slug}/camps/{slug}/payment-options").json()


def _book_online(real_db, session, **overrides):
    r = _post(real_db, session, payment_method="online", **overrides)
    assert r.status_code == 201, r.text
    return r.json()["registration_token"]


# ---------- availability ----------

def test_payment_options_true_for_training_when_stripe_active(real_db, stripe_env):
    _, session = _make(real_db)
    assert _options(real_db, session["slug"]) == {"online_payment_available": True}


def test_payment_options_false_for_training_when_org_not_enabled(real_db, stripe_env):
    cursor, tenant, _ = real_db
    _, session = _make(real_db)
    with cursor() as cur:
        cur.execute("update organizations set online_payment_enabled=false where id=%s", (tenant.organization_id,))
    assert _options(real_db, session["slug"]) == {"online_payment_available": False}


def test_online_rejected_with_422_when_stripe_inactive(real_db, stripe_env):
    cursor, tenant, _ = real_db
    _, session = _make(real_db)
    with cursor() as cur:
        cur.execute("update organizations set stripe_charges_enabled=false where id=%s", (tenant.organization_id,))
    assert _post(real_db, session, payment_method="online").status_code == 422


def test_online_rejected_when_service_switch_off(real_db, stripe_env, monkeypatch):
    _, session = _make(real_db)
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=False, stripe_secret_key=None, stripe_webhook_secret=None))
    assert _post(real_db, session, payment_method="online").status_code == 422


def test_unknown_payment_method_still_rejected(real_db, stripe_env):
    _, session = _make(real_db)
    assert _post(real_db, session, payment_method="paypal").status_code == 422


def test_online_booking_is_stored_as_online(real_db, stripe_env):
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    row = _row(real_db, token)
    assert (row["payment_method"], row["payment_status"], row["applied_price_cents"]) == ("online", "open", 4500)


# ---------- checkout amount ----------

def test_checkout_charges_member_price(real_db, stripe_env):
    _member(real_db)
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    r = _checkout(real_db, session, token)
    assert r.status_code == 200, r.text
    args = stripe_env.created[0]
    assert args["line_items"][0]["price_data"]["unit_amount"] == 3000
    assert args["stripe_account"] == ACCOUNT
    assert "application_fee_amount" not in args
    assert _row(real_db, token)["stripe_checkout_amount_cents"] == 3000


def test_checkout_charges_nonmember_price(real_db, stripe_env):
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    assert _checkout(real_db, session, token).status_code == 200
    assert stripe_env.created[0]["line_items"][0]["price_data"]["unit_amount"] == 4500


def test_checkout_sends_no_child_or_parent_data(real_db, stripe_env):
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    _checkout(real_db, session, token)
    sent = str(stripe_env.created[0]).lower()
    assert "mustermann" not in sent and "@" not in sent


@pytest.mark.parametrize("pm", ["bar", "ueberweisung"])
def test_checkout_refused_when_not_booked_online(real_db, stripe_env, pm):
    _, session = _make(real_db)
    r = _post(real_db, session, payment_method=pm)
    assert _checkout(real_db, session, r.json()["registration_token"]).status_code == 409
    assert stripe_env.created == []


# ---------- reuse ----------

def test_open_session_with_same_amount_is_reused(real_db, stripe_env):
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    assert _checkout(real_db, session, token).json()["url"] == "https://checkout.stripe.com/new1"
    stripe_env.existing[stripe_env.ids[0]] = {"status": "open", "url": "https://checkout.stripe.com/new1"}
    r = _checkout(real_db, session, token)
    assert r.json()["url"] == "https://checkout.stripe.com/new1"
    assert len(stripe_env.created) == 1 and stripe_env.expired == []


def test_open_session_with_other_amount_is_expired_and_replaced(real_db, stripe_env):
    cursor, _, _ = real_db
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    _checkout(real_db, session, token)
    stripe_env.existing[stripe_env.ids[0]] = {"status": "open", "url": "https://checkout.stripe.com/new1"}
    with cursor() as cur:  # admin corrected the booking price after the session was created
        cur.execute("update camp_registrations set applied_price_cents=3000 where registration_token=%s", (token,))
    r = _checkout(real_db, session, token)
    assert r.status_code == 200, r.text
    assert r.json()["url"] == "https://checkout.stripe.com/new2"
    assert stripe_env.expired == [stripe_env.ids[0]]
    assert stripe_env.created[1]["line_items"][0]["price_data"]["unit_amount"] == 3000
    row = _row(real_db, token)
    assert (row["stripe_checkout_session_id"], row["stripe_checkout_amount_cents"]) == (stripe_env.ids[1], 3000)


def test_expire_failure_does_not_reuse_or_create(real_db, stripe_env):
    cursor, _, _ = real_db
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    _checkout(real_db, session, token)
    stripe_env.existing[stripe_env.ids[0]] = {"status": "open", "url": "https://checkout.stripe.com/new1"}
    stripe_env.expire = MagicMock(side_effect=stripe.error.APIConnectionError("x"))
    with cursor() as cur:
        cur.execute("update camp_registrations set applied_price_cents=3000 where registration_token=%s", (token,))
    assert _checkout(real_db, session, token).status_code == 503
    assert len(stripe_env.created) == 1


# ---------- 0 EUR ----------

def test_free_training_cannot_be_booked_online(real_db, stripe_env):
    _member(real_db)
    _, session = _make(real_db, member=0, nonmember=4500)
    r = _post(real_db, session, payment_method="online")
    assert r.status_code == 422
    # no registration was created, and bar still works for the free price
    assert _post(real_db, session, payment_method="bar").json()["applied_price_cents"] == 0


def test_free_booking_row_cannot_reach_checkout(real_db, stripe_env):
    cursor, _, _ = real_db
    _, session = _make(real_db)
    token = _book_online(real_db, session)
    with cursor() as cur:
        cur.execute("update camp_registrations set applied_price_cents=0 where registration_token=%s", (token,))
    assert _checkout(real_db, session, token).status_code == 409
    assert stripe_env.created == []


# ---------- camps unchanged ----------

def test_camp_checkout_still_uses_camp_price(real_db, stripe_env):
    _, tenant, _ = real_db
    payload = {k: v for k, v in __import__("tests.test_registrations_api", fromlist=["x"])._valid_payload(
        child_birth_date=BIRTH.isoformat()).items()}
    with TestClient(app) as client:
        r = client.post(f"/api/v1/organizations/{tenant.slug}/camps/summer-1/registrations", json=payload)
        assert r.status_code == 201, r.text
        token = r.json()["registration_token"]
        c = client.post(f"/api/v1/organizations/{tenant.slug}/camps/summer-1/registrations/{token}/checkout")
    assert c.status_code == 200, c.text
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select price_cents from camps where slug='summer-1' and organization_id=%s", (tenant.organization_id,))
        price = cur.fetchone()["price_cents"]
    assert stripe_env.created[0]["line_items"][0]["price_data"]["unit_amount"] == price


def test_camp_payment_options_unchanged(real_db, stripe_env):
    assert _options(real_db, "summer-1") == {"online_payment_available": True}


def test_online_confirmation_mail_has_no_transfer_block(real_db, stripe_env, fake_provider):
    _, session = _make(real_db)
    _book_online(real_db, session)
    parent = [m for m in fake_provider.sent if m.subject.startswith("Buchungsbestätigung")]
    assert len(parent) == 1
    assert "IBAN" not in parent[0].html_content and "Sie zahlen online" in parent[0].html_content
