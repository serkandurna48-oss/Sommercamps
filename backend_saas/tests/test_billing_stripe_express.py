"""Billing B2: Stripe Connect Express onboarding, destination charges with
application fee, platform webhook, refunds.

Stripe is always mocked (signatures are real HMACs with test secrets); real
local Postgres, synthetic data only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
import stripe
from fastapi.testclient import TestClient

from app.main import app
from app.routers import payments
from .auth_helpers import org_admin_headers, owner_headers
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _post, _row, fake_provider  # noqa: F401

LEGACY = "acct_1LEGACY00000000001"
CONNECT_SECRET = "whsec_connect_test"
PLATFORM_SECRET = "whsec_platform_test"


class FakeStripe:
    """Records every call; returns minimal Stripe-shaped dicts."""

    def __init__(self, express):
        self.express = express
        self.calls = []
        self.account_state = {"charges_enabled": False, "payouts_enabled": False, "details_submitted": False,
                              "requirements": {"currently_due": ["external_account"], "past_due": []}}
        self.sessions = {}
        outer = self

        class Account:
            @staticmethod
            def create(**kw):
                outer.calls.append(("Account.create", kw))
                return {"id": outer.express, **outer.account_state}

            @staticmethod
            def retrieve(account_id, **kw):
                outer.calls.append(("Account.retrieve", account_id))
                return {"id": account_id, **outer.account_state}

        class AccountLink:
            @staticmethod
            def create(**kw):
                outer.calls.append(("AccountLink.create", kw))
                return {"url": "https://connect.stripe.com/setup/e/test_link"}

        class Session:
            @staticmethod
            def create(**kw):
                outer.calls.append(("Session.create", kw))
                sid = f"cs_test_{uuid4().hex[:16]}"
                outer.sessions[sid] = {"status": "open", "url": f"https://checkout.stripe.com/{sid}"}
                return {"id": sid, "url": outer.sessions[sid]["url"]}

            @staticmethod
            def retrieve(session_id, **kw):
                outer.calls.append(("Session.retrieve", session_id, kw))
                return outer.sessions[session_id]

            @staticmethod
            def expire(session_id, **kw):
                outer.calls.append(("Session.expire", session_id, kw))
                outer.sessions[session_id] = {"status": "expired"}

        class PaymentIntent:
            @staticmethod
            def retrieve(intent, **kw):
                outer.calls.append(("PaymentIntent.retrieve", intent, kw))
                return {"latest_charge": {"refunded": False, "amount_refunded": 0, "amount": 1}}

        class Refund:
            @staticmethod
            def create(**kw):
                outer.calls.append(("Refund.create", kw))
                return {"id": "re_test_1", "status": "succeeded", "amount": kw.get("amount", 1000)}

        self.Account, self.AccountLink, self.PaymentIntent, self.Refund = Account, AccountLink, PaymentIntent, Refund
        self.checkout = SimpleNamespace(Session=Session)
        self.Webhook = stripe.Webhook  # real signature verification

    def named(self, name):
        return [c for c in self.calls if c[0] == name]


def _settings(**over):
    values = dict(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x", stripe_webhook_secret=CONNECT_SECRET,
        stripe_platform_webhook_secret=PLATFORM_SECRET, frontend_base_url="https://example.com",
        app_env="staging",
    )
    values.update(over)
    return SimpleNamespace(**values, frontend_base_is_usable=lambda: True)


@pytest.fixture
def env(real_db, monkeypatch):
    cursor, tenant, _ = real_db
    express = f"acct_1EX{uuid4().hex[:16]}"
    intent = f"pi_test{uuid4().hex[:16]}"
    fake = FakeStripe(express)
    state = {"settings": _settings()}
    monkeypatch.setattr(payments, "get_settings", lambda: state["settings"])
    monkeypatch.setattr(payments, "_stripe_client", lambda: fake)
    payments.checkout_limiter.reset()
    other, actor = uuid4(), uuid4()
    with cursor() as cur:
        cur.execute("insert into auth.users(id) values (%s)", (actor,))
        cur.execute("insert into organizations(id,slug,name,contact_email,site_published,plan_status) "
                    "values (%s,%s,'Other','o@example.com',true,'active')", (other, f"other-{other.hex}"))
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from) "
                    "values (%s,'individuell',5.00,'2000-01-01')", (tenant.organization_id,))
        cur.execute("update camps set capacity=50 where organization_id=%s", (tenant.organization_id,))
    with TestClient(app) as client:
        yield SimpleNamespace(
            client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug, fake=fake, state=state,
            other=other, other_slug=f"other-{other.hex}", express=express, intent=intent,
            admin=lambda: org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )
    payments.checkout_limiter.reset()


def _org(env, **values):
    sets = ", ".join(f"{k} = %s" for k in values)
    with env.cursor() as cur:
        cur.execute(f"update organizations set {sets} where id = %s", (*values.values(), env.org))


def _activate_express(env):
    _org(env, stripe_express_account_id=env.express, stripe_express_charges_enabled=True,
         stripe_express_payouts_enabled=True, stripe_express_details_submitted=True)


def _activate_legacy(env):
    _org(env, stripe_account_id=LEGACY, stripe_charges_enabled=True, online_payment_enabled=True)


def _register(env):
    child = f"Kind{uuid4().hex[:6]}"  # one booking per child and camp
    r = env.client.post(f"/api/v1/organizations/{env.slug}/camps/summer-1/registrations",
                        json=_valid_payload(child_first_name=child))
    assert r.status_code == 201, r.text
    return r.json()["registration_token"]


def _checkout(env, token, camp="summer-1"):
    return env.client.post(f"/api/v1/organizations/{env.slug}/camps/{camp}/registrations/{token}/checkout")


def _reg(env, token):
    with env.cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()


def _signed(event, secret):
    body = json.dumps(event, separators=(",", ":")).encode()
    ts = int(time.time())
    digest = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={digest}"


def _post_webhook(env, path, event, secret):
    body, header = _signed(event, secret)
    return env.client.post(path, content=body, headers={"stripe-signature": header, "content-type": "application/json"})


PLATFORM_HOOK = "/api/v1/payments/stripe/platform-webhook"
CONNECT_HOOK = "/api/v1/payments/stripe/webhook"


def _completed(session_id, intent, amount=1000, **extra):
    return {"id": f"evt_{uuid4().hex}", "type": "checkout.session.completed", "livemode": False,
            "created": int(time.time()), **extra,
            "data": {"object": {"id": session_id, "object": "checkout.session", "payment_status": "paid",
                                "amount_total": amount, "currency": "eur", "payment_intent": intent,
                                "metadata": {"campspilot": "1"}}}}


# ---------- onboarding and status ----------

def test_onboarding_creates_express_account_once_and_returns_link(env):
    path = f"/admin/organizations/{env.slug}/payments/stripe"
    assert env.client.get(path, headers=env.admin()).json()["state"] == "not_set_up"
    r = env.client.post(f"{path}/onboarding", headers=env.admin(), json={"business_type": "non_profit"})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://connect.stripe.com/")
    (_, created), = env.fake.named("Account.create")
    assert created["type"] == "express" and created["country"] == "DE" and created["business_type"] == "non_profit"
    assert created["capabilities"] == {"card_payments": {"requested": True}, "transfers": {"requested": True}}
    assert created["metadata"]["campspilot"] == "1"
    assert created["idempotency_key"] == f"campspilot-express-{env.org}"
    (_, link), = env.fake.named("AccountLink.create")
    assert link["account"] == env.express and link["type"] == "account_onboarding"
    assert link["return_url"] == f"https://example.com/pilot/{env.slug}/konfiguration?stripe=return#zahlungen"
    assert link["refresh_url"].endswith("?stripe=refresh#zahlungen")
    with env.cursor() as cur:
        cur.execute("select stripe_express_account_id, stripe_express_business_type, stripe_account_id "
                    "from organizations where id=%s", (env.org,))
        row = cur.fetchone()
    assert (row["stripe_express_account_id"], row["stripe_express_business_type"], row["stripe_account_id"]) == (
        env.express, "non_profit", None)  # legacy column untouched
    status = env.client.get(path, headers=env.admin()).json()
    assert status["state"] == "incomplete" and status["requirements_due"] == 1
    assert "acct_" not in json.dumps(status)  # no account ids to the club
    # Continue onboarding: new link, same account.
    assert env.client.post(f"{path}/onboarding", headers=env.admin()).status_code == 200
    assert len(env.fake.named("Account.create")) == 1 and len(env.fake.named("AccountLink.create")) == 2


def test_status_check_and_account_updated_webhook(env):
    _org(env, stripe_express_account_id=env.express)
    path = f"/admin/organizations/{env.slug}/payments/stripe"
    env.fake.account_state = {"charges_enabled": True, "payouts_enabled": True, "details_submitted": True,
                              "requirements": {"currently_due": [], "past_due": []}}
    r = env.client.post(f"{path}/sync", headers=env.admin())
    assert r.status_code == 200 and r.json()["state"] == "active" and r.json()["online_payment_mode"] == "destination"

    # Older webhook event (before the sync) must not overwrite the newer state.
    stale = {"id": "evt_old", "type": "account.updated", "livemode": False, "account": env.express,
             "created": int(time.time()) - 3600,
             "data": {"object": {"id": env.express, "charges_enabled": False, "payouts_enabled": False,
                                 "details_submitted": True, "requirements": {"currently_due": ["x"]}}}}
    assert _post_webhook(env, CONNECT_HOOK, stale, CONNECT_SECRET).status_code == 200
    assert env.client.get(path, headers=env.admin()).json()["state"] == "active"
    fresh = {**stale, "id": "evt_new", "created": int(time.time()) + 5}
    assert _post_webhook(env, CONNECT_HOOK, fresh, CONNECT_SECRET).status_code == 200
    status = env.client.get(path, headers=env.admin()).json()
    assert status["state"] == "incomplete" and status["requirements_due"] == 1
    # Unknown account: acknowledged, nothing changed.
    other = {**fresh, "id": "evt_x", "account": "acct_1UNKNOWN000000001"}
    assert _post_webhook(env, CONNECT_HOOK, other, CONNECT_SECRET).json() == {"received": True}


def test_onboarding_tenant_isolation_and_service_switch(env):
    foreign = org_admin_headers(str(env.other))
    base = f"/admin/organizations/{env.slug}/payments/stripe"
    assert env.client.get(base, headers=foreign).status_code == 403
    assert env.client.post(f"{base}/onboarding", headers=foreign).status_code == 403
    assert env.client.post(f"{base}/sync", headers=foreign).status_code == 403
    assert env.fake.calls == []
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    assert env.client.post(f"{base}/onboarding", headers=env.admin()).status_code == 503
    assert env.client.get(base, headers=env.admin()).json()["service_ready"] is False
    assert env.fake.calls == []
    # Platform owner may look at any club.
    assert env.client.get(base, headers=owner_headers()).status_code == 200


def test_legacy_notice_in_status(env):
    _activate_legacy(env)
    status = env.client.get(f"/admin/organizations/{env.slug}/payments/stripe", headers=env.admin()).json()
    assert status["legacy_account_linked"] and status["legacy_active"]
    assert status["state"] == "not_set_up" and status["online_payment_mode"] == "direct"


# ---------- checkout: express vs legacy vs none ----------

def test_express_checkout_is_destination_charge_with_fee(env):
    _activate_express(env)
    _activate_legacy(env)  # Express wins
    token = _register(env)
    r = _checkout(env, token)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Session.create")
    assert "stripe_account" not in kw  # created on the platform
    intent = kw["payment_intent_data"]
    assert intent["on_behalf_of"] == env.express and intent["transfer_data"] == {"destination": env.express}
    assert intent["application_fee_amount"] == 50  # 5 % of 1000
    assert kw["line_items"][0]["price_data"]["unit_amount"] == 1000
    assert kw["metadata"]["campspilot"] == "1" and intent["metadata"]["campspilot"] == "1"
    assert "Kind" not in json.dumps(kw) and "max@example.com" not in json.dumps(kw)
    row = _reg(env, token)
    assert (row["stripe_charge_type"], row["stripe_checkout_account_id"]) == ("destination", env.express)
    assert row["stripe_checkout_fee"]["fee_cents"] == 50 and row["stripe_checkout_fee"]["percent"] == "5.00"
    assert row["fee_snapshot_at"] is None  # snapshot only when paid
    # Same booking again: open session reused, no new Stripe session.
    assert _checkout(env, token).json()["url"] == r.json()["url"]
    assert len(env.fake.named("Session.create")) == 1


def test_fee_change_replaces_open_destination_session(env):
    _activate_express(env)
    token = _register(env)
    first = _checkout(env, token).json()["url"]
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, created_at) "
                    "values (%s,'verein',4.90,'2000-01-01', now() + interval '1 second')", (env.org,))
    second = _checkout(env, token)
    assert second.status_code == 200 and second.json()["url"] != first
    expire, = env.fake.named("Session.expire")
    assert expire[2] == {}  # platform session: no stripe_account
    assert env.fake.named("Session.create")[1][1]["payment_intent_data"]["application_fee_amount"] == 49


def test_legacy_checkout_unchanged_without_express(env):
    _activate_legacy(env)
    _org(env, stripe_express_account_id=env.express)  # onboarding started, not active yet
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == LEGACY
    assert "application_fee_amount" not in kw["payment_intent_data"]
    assert "transfer_data" not in kw["payment_intent_data"]
    assert kw["idempotency_key"] == f"campspilot-{token}-first-1000"
    assert _reg(env, token)["stripe_charge_type"] == "direct"


def test_express_needs_platform_webhook_secret(env):
    _activate_express(env)
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    token = _register(env)
    assert _checkout(env, token).status_code == 503
    assert env.fake.named("Session.create") == []
    options = env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json()
    assert options == {"online_payment_available": False}


def test_no_account_no_online_payment(env):
    token = _register(env)
    assert _checkout(env, token).status_code == 503
    assert env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json() == {
        "online_payment_available": False}
    _activate_express(env)
    assert env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json() == {
        "online_payment_available": True}


def test_training_express_checkout_uses_applied_price(env, real_db):
    _activate_express(env)
    _, session = _make(real_db, member=3000, nonmember=4500)
    r = _post(real_db, session, payment_method="online")
    assert r.status_code == 201, r.text
    token = r.json()["registration_token"]
    assert _checkout(env, token, camp=session["slug"]).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["line_items"][0]["price_data"]["unit_amount"] == 4500
    assert kw["payment_intent_data"]["application_fee_amount"] == 225


# ---------- platform webhook ----------

def _paid_destination(env):
    _activate_express(env)
    token = _register(env)
    _checkout(env, token)
    return token, _reg(env, token)["stripe_checkout_session_id"]


def test_platform_webhook_marks_paid_with_snapshot_idempotently(env):
    token, session_id = _paid_destination(env)
    event = _completed(session_id, intent=env.intent)
    r = _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET)
    assert r.json() == {"received": True, "settled": True}
    row = _reg(env, token)
    assert (row["payment_status"], row["stripe_payment_intent_id"]) == ("paid", env.intent)
    assert (row["fee_plan"], row["fee_percent"], row["fee_base_cents"], row["fee_cents"], row["fee_collection"]) == (
        "individuell", Decimal("5.00"), 1000, 50, "application_fee")
    # PaymentIntent of a platform charge is read without stripe_account.
    assert env.fake.named("PaymentIntent.retrieve")[0][2] == {"expand": ["latest_charge"]}
    snapshot_at = row["fee_snapshot_at"]
    # Replay: no change, no error.
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).json() == {"received": True, "settled": True}
    assert _reg(env, token)["fee_snapshot_at"] == snapshot_at


def test_platform_webhook_signature_and_scope(env):
    token, session_id = _paid_destination(env)
    event = _completed(session_id, intent=env.intent)
    body, _ = _signed(event, PLATFORM_SECRET)
    bad = env.client.post(PLATFORM_HOOK, content=body, headers={"stripe-signature": "t=1,v1=00"})
    assert bad.status_code == 400
    # Signed with the Connect secret: not accepted on the platform endpoint.
    assert _post_webhook(env, PLATFORM_HOOK, event, CONNECT_SECRET).status_code == 400
    # A connected-account event at the platform endpoint.
    assert _post_webhook(env, PLATFORM_HOOK, {**event, "account": env.express}, PLATFORM_SECRET).status_code == 400
    # Live event in staging.
    assert _post_webhook(env, PLATFORM_HOOK, {**event, "livemode": True}, PLATFORM_SECRET).status_code == 400
    assert _reg(env, token)["payment_status"] == "open"
    # The Connect endpoint never settles a platform (destination) session.
    connect = {**event, "account": env.express}
    assert _post_webhook(env, CONNECT_HOOK, connect, CONNECT_SECRET).status_code == 503
    assert _reg(env, token)["payment_status"] == "open"
    # Endpoint off without its secret.
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).status_code == 503


def test_platform_webhook_amount_mismatch_is_flagged(env, monkeypatch):
    token, session_id = _paid_destination(env)
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, tok, reason: flagged.append(reason))
    r = _post_webhook(env, PLATFORM_HOOK, _completed(session_id, amount=999, intent=env.intent), PLATFORM_SECRET)
    assert r.json() == {"received": True, "settled": False} and flagged == ["amount_mismatch"]
    assert _reg(env, token)["payment_status"] == "open"


def test_platform_webhook_unknown_session_and_foreign_event(env):
    _activate_express(env)
    # Not ours (no marker): ignored without retry.
    foreign = _completed("cs_test_foreign00000001", env.intent)
    foreign["data"]["object"]["metadata"] = {}
    assert _post_webhook(env, PLATFORM_HOOK, foreign, PLATFORM_SECRET).json() == {"received": True, "ignored": True}
    # Ours but unknown yet: retry (503).
    assert _post_webhook(env, PLATFORM_HOOK, _completed("cs_test_unknown00000001", env.intent), PLATFORM_SECRET).status_code == 503


# ---------- refunds ----------

def test_refund_reverses_transfer_and_application_fee(env):
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    path = f"/admin/organizations/{env.slug}/registrations/{token}/refund"
    assert env.client.post(path, headers=org_admin_headers(str(env.other))).status_code == 403
    r = env.client.post(path, headers=env.admin(), json={"amount_cents": 400})
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Refund.create")
    assert kw["payment_intent"] == env.intent and kw["amount"] == 400
    assert kw["refund_application_fee"] is True and kw["reverse_transfer"] is True
    assert "stripe_account" not in kw
    assert kw["idempotency_key"] == f"campspilot-refund-{token}-400"
    assert _reg(env, token)["payment_status"] == "paid"  # partial: stays paid
    assert env.client.post(path, headers=env.admin(), json={"amount_cents": 1001}).status_code == 422
    # Full refund confirmed by the platform webhook.
    refunded = {"id": "evt_r", "type": "charge.refunded", "livemode": False, "created": int(time.time()),
                "data": {"object": {"payment_intent": env.intent, "refunded": True,
                                    "amount_refunded": 1000, "amount": 1000}}}
    assert _post_webhook(env, PLATFORM_HOOK, refunded, PLATFORM_SECRET).status_code == 200
    row = _reg(env, token)
    assert row["payment_status"] == "refunded" and row["fee_cents"] == 50  # snapshot kept for the fee invoice
    with env.cursor() as cur:
        cur.execute("select metadata from audit_log where action='stripe.refund_requested' and organization_id=%s",
                    (env.org,))
        assert cur.fetchone()["metadata"] == {"amount_cents": 400, "full": False}


def test_refund_only_for_paid_destination_payments(env):
    _activate_legacy(env)
    token = _register(env)
    path = f"/admin/organizations/{env.slug}/registrations/{token}/refund"
    _checkout(env, token)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set payment_status='paid', stripe_payment_intent_id='pi_legacy000001' "
                    "where registration_token=%s", (token,))
    assert env.client.post(path, headers=env.admin()).status_code == 409  # legacy direct charge
    token2, _ = _paid_destination(env)
    assert env.client.post(f"/admin/organizations/{env.slug}/registrations/{token2}/refund",
                           headers=env.admin()).status_code == 409  # not paid yet
    assert env.client.post(f"/admin/organizations/{env.slug}/registrations/{uuid4()}/refund",
                           headers=env.admin()).status_code == 404
    assert env.fake.named("Refund.create") == []


def test_destination_rows_not_touched_by_connect_refund(env):
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    refunded = {"id": "evt_c", "type": "charge.refunded", "livemode": False, "account": env.express,
                "data": {"object": {"payment_intent": env.intent, "refunded": True,
                                    "amount_refunded": 1000, "amount": 1000}}}
    assert _post_webhook(env, CONNECT_HOOK, refunded, CONNECT_SECRET).status_code == 200
    assert _reg(env, token)["payment_status"] == "paid"


def test_expire_open_destination_checkout_uses_platform(env):
    token, session_id = _paid_destination(env)
    env.client.patch(f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/payment-status",
                     headers=env.admin(), json={"payment_status": "paid"})
    expire, = env.fake.named("Session.expire")
    assert expire[1] == session_id and expire[2] == {}
    assert _reg(env, token)["fee_collection"] == "not_collected"  # paid by transfer: fee owed, not withheld
