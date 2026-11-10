"""Billing B2: Stripe Connect onboarding (Accounts v2, Managed Risk), destination
charges with application fee (B2 Express accounts, staging), platform webhook,
refunds. Managed Risk direct charges: tests/test_billing_managed_risk.py.

Stripe is always mocked (signatures are real HMACs with test secrets); real
local Postgres, synthetic data only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import psycopg2
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
        # latest_charge of the PaymentIntent (expanded application_fee)
        self.charge = {"amount": 1000, "amount_refunded": 0, "refunded": False, "application_fee_amount": 50,
                       "application_fee": {"amount": 50, "amount_refunded": 0}}
        self.refund_error = None
        self.account_error = None
        outer = self

        class Account:
            @staticmethod
            def create(**kw):
                outer.calls.append(("Account.create", kw))
                if outer.account_error is not None:
                    raise outer.account_error
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
                return {"latest_charge": dict(outer.charge)}

        class Refund:
            @staticmethod
            def create(**kw):
                outer.calls.append(("Refund.create", kw))
                if outer.refund_error:
                    raise outer.refund_error
                return {"id": "re_test_1", "status": "succeeded", "amount": kw.get("amount", 1000)}

        class ApplicationFee:
            @staticmethod
            def retrieve(fee_id, **kw):
                outer.calls.append(("ApplicationFee.retrieve", fee_id, kw))
                return dict(outer.application_fee)

        class V2Accounts:
            @staticmethod
            def create(params, options=None):
                outer.calls.append(("v2.accounts.create", params, options))
                if outer.account_error is not None:
                    raise outer.account_error
                return {"id": outer.express, "object": "v2.core.account"}

        class V2AccountLinks:
            @staticmethod
            def create(params, options=None):
                outer.calls.append(("v2.account_links.create", params, options))
                return {"object": "v2.core.account_link", "url": f"https://accounts.stripe.com/r/{params['account']}#alu_test_x"}

        self.application_fee = {"id": "fee_test_1", "amount": 50, "amount_refunded": 0}
        self.Account, self.AccountLink, self.PaymentIntent, self.Refund = Account, AccountLink, PaymentIntent, Refund
        self.ApplicationFee = ApplicationFee
        self.v2 = SimpleNamespace(core=SimpleNamespace(accounts=V2Accounts, account_links=V2AccountLinks))
        self.checkout = SimpleNamespace(Session=Session)
        self.Webhook = stripe.Webhook  # real signature verification

    def named(self, name):
        return [c for c in self.calls if c[0] == name]


def _settings(**over):
    values = dict(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x", stripe_webhook_secret=CONNECT_SECRET,
        stripe_platform_webhook_secret=PLATFORM_SECRET, frontend_base_url="https://example.com",
        app_env="staging", stripe_fee_percent=Decimal("1.5"), stripe_fee_fixed_cents=25,
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
    monkeypatch.setattr(payments, "_stripe_v2", lambda: fake)
    payments.checkout_limiter.reset()
    payments.stripe_admin_limiter.reset()
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


def _activate_express(env, enabled=True):
    _org(env, stripe_express_account_id=env.express, stripe_express_charges_enabled=True,
         stripe_express_payouts_enabled=True, stripe_express_details_submitted=True,
         online_payment_enabled=enabled)


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

def test_onboarding_creates_v2_managed_risk_account_once_and_returns_link(env):
    path = f"/admin/organizations/{env.slug}/payments/stripe"
    assert env.client.get(path, headers=env.admin()).json()["state"] == "not_set_up"
    r = env.client.post(f"{path}/onboarding", headers=env.admin(), json={"business_type": "non_profit"})
    assert r.status_code == 200, r.text
    assert r.json()["url"].startswith("https://accounts.stripe.com/")
    assert env.fake.named("Account.create") == [] and env.fake.named("AccountLink.create") == []
    (_, created, options), = env.fake.named("v2.accounts.create")
    assert options == {"idempotency_key": f"campspilot-acct-v2-{env.org}-{payments._params_hash(created)}"}
    assert created["dashboard"] == "full"
    assert created["identity"] == {"country": "de", "entity_type": "non_profit"}
    assert created["defaults"]["responsibilities"] == {"fees_collector": "stripe", "losses_collector": "stripe"}
    assert created["defaults"]["currency"] == "eur"
    assert created["configuration"] == {"merchant": {"capabilities": {"card_payments": {"requested": True}}}}
    assert created["metadata"] == {"campspilot": "1", "organization_id": str(env.org)}
    assert created["contact_email"] == "review@example.com"  # club contact (no billing profile yet)
    assert "type" not in created and "controller" not in created and "recipient" not in created["configuration"]
    (_, link, _), = env.fake.named("v2.account_links.create")
    assert link == {"account": env.express, "use_case": {"type": "account_onboarding", "account_onboarding": {
        "refresh_url": f"https://example.com/pilot/{env.slug}/konfiguration?stripe=refresh#zahlungen",
        "return_url": f"https://example.com/pilot/{env.slug}/konfiguration?stripe=return#zahlungen"}}}
    with env.cursor() as cur:
        cur.execute("select stripe_express_account_id, stripe_express_business_type, stripe_express_account_kind, "
                    "stripe_account_id from organizations where id=%s", (env.org,))
        row = cur.fetchone()
    assert (row["stripe_express_account_id"], row["stripe_express_business_type"],
            row["stripe_express_account_kind"], row["stripe_account_id"]) == (
        env.express, "non_profit", "direct_fee", None)  # legacy column untouched
    status = env.client.get(path, headers=env.admin()).json()
    assert status["state"] == "incomplete" and status["account_kind"] == "direct_fee"
    assert "acct_" not in json.dumps(status)  # no account ids to the club
    # Continue onboarding: new link, same account.
    assert env.client.post(f"{path}/onboarding", headers=env.admin()).status_code == 200
    assert len(env.fake.named("v2.accounts.create")) == 1 and len(env.fake.named("v2.account_links.create")) == 2


def test_onboarding_v2_uses_billing_email_and_company_type(env):
    with env.cursor() as cur:
        cur.execute(
            """insert into organization_billing_profiles (organization_id, legal_name, street, postal_code, city,
                   tax_number, tax_status, default_vat_rate, invoice_number_prefix, invoice_email)
               values (%s, 'Test GmbH', 'Weg 1', '34225', 'Baunatal', '12/345/67890', 'ust_pflichtig', 19, 'RE',
                       'rechnung@example.com')""", (env.org,))
    r = env.client.post(f"/admin/organizations/{env.slug}/payments/stripe/onboarding", headers=env.admin(),
                        json={"business_type": "company"})
    assert r.status_code == 200, r.text
    (_, created, _), = env.fake.named("v2.accounts.create")
    assert created["identity"]["entity_type"] == "company" and created["contact_email"] == "rechnung@example.com"


def test_onboarding_continues_existing_destination_account_with_v1_link(env):
    _org(env, stripe_express_account_id=env.express, stripe_express_account_kind="destination")
    r = env.client.post(f"/admin/organizations/{env.slug}/payments/stripe/onboarding", headers=env.admin())
    assert r.status_code == 200 and r.json()["url"].startswith("https://connect.stripe.com/")
    (_, link), = env.fake.named("AccountLink.create")
    assert link["account"] == env.express and link["type"] == "account_onboarding"
    assert env.fake.named("v2.accounts.create") == [] and env.fake.named("v2.account_links.create") == []


def test_onboarding_shows_stripe_reason_for_config_errors(env):
    path = f"/admin/organizations/{env.slug}/payments/stripe/onboarding"
    env.fake.account_error = stripe.error.InvalidRequestError(
        "You must complete your platform profile to create connected accounts.", None, code="platform_profile")
    r = env.client.post(path, headers=env.admin(), json={"business_type": "non_profit"})
    assert r.status_code == 409
    assert r.json()["detail"] == (
        "Stripe hat die Einrichtung abgelehnt: You must complete your platform profile to create connected accounts.")
    env.fake.account_error = stripe.error.APIConnectionError("down")
    assert env.client.post(path, headers=env.admin()).status_code == 503
    # v2 rejection of a misconfigured platform (the sandbox error that led to Managed Risk).
    env.fake.account_error = stripe.error.InvalidRequestError(
        "Use Accounts v2 and set `losses_collector` to `stripe`", None, code="account_creation_invalid")
    r = env.client.post(path, headers=env.admin())
    assert r.status_code == 409 and "losses_collector" in r.json()["detail"]
    # Typed v2 errors are no InvalidRequestError: still Stripe's reason, 409.
    env.fake.account_error = stripe.error.FeatureNotEnabledError("Accounts v2 is not enabled", http_status=400)
    r = env.client.post(path, headers=env.admin())
    assert r.status_code == 409 and r.json()["detail"].endswith("Accounts v2 is not enabled")
    env.fake.account_error = stripe.error.RateLimitError("slow down", http_status=429)
    assert env.client.post(path, headers=env.admin()).status_code == 503
    # A corrected retry (other legal form) uses another idempotency key; a repeat the same one.
    env.fake.account_error = stripe.error.APIConnectionError("down")
    env.client.post(path, headers=env.admin(), json={"business_type": "company"})
    env.client.post(path, headers=env.admin(), json={"business_type": "company"})
    keys = [c[2]["idempotency_key"] for c in env.fake.named("v2.accounts.create")]
    assert keys[-1] == keys[-2] and keys[-1] != keys[0]
    with env.cursor() as cur:
        cur.execute("select stripe_express_account_id from organizations where id=%s", (env.org,))
        assert cur.fetchone()["stripe_express_account_id"] is None


def test_status_check_and_account_updated_webhook(env):
    _org(env, stripe_express_account_id=env.express, online_payment_enabled=True)
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
    env.state["settings"] = _settings(stripe_webhook_secret=None)
    assert env.client.post(f"{base}/onboarding", headers=env.admin()).status_code == 503
    assert env.client.get(base, headers=env.admin()).json()["service_ready"] is False
    assert env.fake.calls == []
    # Managed Risk accounts do not need the platform webhook.
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    assert env.client.get(base, headers=env.admin()).json()["service_ready"] is True
    assert env.client.post(f"{base}/onboarding", headers=env.admin()).status_code == 200
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
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, tok, reason, *_: flagged.append(reason))
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

def _refund(env, token, amount=None, request_id=None, headers=None):
    body = {"request_id": str(request_id or uuid4())}
    if amount is not None:
        body["amount_cents"] = amount
    return env.client.post(f"/admin/organizations/{env.slug}/registrations/{token}/refund",
                           headers=headers or env.admin(), json=body)


def _charge_refunded(env, refunded, fee_refunded):
    env.fake.charge = {**env.fake.charge, "amount_refunded": refunded, "refunded": refunded >= 1000,
                       "application_fee": {"amount": 50, "amount_refunded": fee_refunded}}
    event = {"id": f"evt_{uuid4().hex}", "type": "charge.refunded", "livemode": False, "created": int(time.time()),
             "data": {"object": {"payment_intent": env.intent, "refunded": refunded >= 1000,
                                 "amount_refunded": refunded, "amount": 1000}}}
    return _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET)


def _fee_month(env):
    month = datetime.now(ZoneInfo("Europe/Berlin")).strftime("%Y-%m")
    r = env.client.get(f"/admin/platform/organizations/{env.slug}/fees", params={"month": month}, headers=owner_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_partial_then_full_refund_reaches_fee_data(env):
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    assert _refund(env, token, headers=org_admin_headers(str(env.other))).status_code == 403
    request_id = uuid4()
    r = _refund(env, token, 400, request_id)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Refund.create")
    assert kw["payment_intent"] == env.intent and kw["amount"] == 400
    assert kw["refund_application_fee"] is True and kw["reverse_transfer"] is True
    assert "stripe_account" not in kw
    row = _reg(env, token)
    assert kw["idempotency_key"] == f"campspilot-refund-{row['id']}-400-{request_id}"
    assert str(token) not in kw["idempotency_key"]
    assert row["payment_status"] == "paid"  # booked only from Stripe's webhook

    assert _charge_refunded(env, 400, 20).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("partially_refunded", 400, 20)
    month = _fee_month(env)
    assert month["collected"] == {"bookings": 1, "fee_cents": 50, "fee_refunded_cents": 20, "fee_net_cents": 30}
    assert month["bookings"][0]["fee_net_cents"] == 30 and month["bookings"][0]["refunded_cents"] == 400
    assert "Kind" not in json.dumps(month) and str(token) not in json.dumps(month)

    # Same amount again on purpose (new request id): a separate Stripe refund.
    assert _refund(env, token, 400).status_code == 200
    keys = [c[1]["idempotency_key"] for c in env.fake.named("Refund.create")]
    assert len(set(keys)) == 2
    # More than the remaining 600 is refused before reaching Stripe.
    assert _refund(env, token, 601).status_code == 422
    assert len(env.fake.named("Refund.create")) == 2

    # Rest (no amount = remaining 600), then Stripe reports the full refund.
    assert _refund(env, token).status_code == 200
    assert env.fake.named("Refund.create")[-1][1]["amount"] == 600
    assert _charge_refunded(env, 1000, 50).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("refunded", 1000, 50)
    assert _fee_month(env)["collected"]["fee_net_cents"] == 0
    # An older partial event arriving late does not reopen it.
    assert _charge_refunded(env, 400, 20).status_code == 200
    assert _reg(env, token)["payment_status"] == "refunded"
    with env.cursor() as cur:
        cur.execute("select target_id, metadata from audit_log where action='stripe.refund_requested' "
                    "and organization_id=%s order by created_at", (env.org,))
        entries = cur.fetchall()
    assert entries[0]["metadata"] == {"amount_cents": 400, "full": False}
    assert {e["target_id"] for e in entries} == {str(row["id"])}  # never the bearer token


def test_refund_before_settlement_is_stored(env):
    token, session_id = _paid_destination(env)
    env.fake.charge = {**env.fake.charge, "amount_refunded": 300, "application_fee": {"amount": 50, "amount_refunded": 15}}
    assert _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"], row["fee_cents"]) == (
        "partially_refunded", 300, 15, 50)


def test_refund_error_mapping(env):
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    env.fake.refund_error = stripe.error.InvalidRequestError("no funds", "amount", code="insufficient_funds")
    r = _refund(env, token)
    assert r.status_code == 409 and "Guthaben" in r.json()["detail"]
    env.fake.refund_error = stripe.error.InvalidRequestError("x", "x", code="charge_already_refunded")
    assert "bereits vollständig" in _refund(env, token).json()["detail"]
    env.fake.refund_error = stripe.error.InvalidRequestError("x", "x", code="something_new")
    assert _refund(env, token).status_code == 502
    env.fake.refund_error = stripe.error.APIConnectionError("down")
    assert _refund(env, token).status_code == 503
    # Refunds do not depend on FRONTEND_BASE_URL.
    env.fake.refund_error = None
    env.state["settings"] = SimpleNamespace(**{**vars(_settings()), "frontend_base_is_usable": lambda: False})
    assert _refund(env, token).status_code == 200


def test_refund_only_for_paid_destination_payments(env):
    _activate_legacy(env)
    token = _register(env)
    _checkout(env, token)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set payment_status='paid', stripe_payment_intent_id=%s "
                    "where registration_token=%s", (f"pi_legacy{uuid4().hex[:12]}", token))
    assert _refund(env, token).status_code == 409  # legacy direct charge
    token2, _ = _paid_destination(env)
    assert _refund(env, token2).status_code == 409  # not paid yet
    assert _refund(env, uuid4()).status_code == 404
    assert env.client.post(f"/admin/organizations/{env.slug}/registrations/{token2}/refund",
                           headers=env.admin(), json={}).status_code == 422  # request_id required
    assert env.fake.named("Refund.create") == []


def test_manual_refund_of_transfer_payment_nets_fee_to_zero(env):
    token = _register(env)
    path = f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/payment-status"
    env.client.patch(path, headers=env.admin(), json={"payment_status": "paid"})
    assert _fee_month(env)["not_collected"] == {"bookings": 1, "fee_cents": 50, "fee_refunded_cents": 0, "fee_net_cents": 50}
    env.client.patch(path, headers=env.admin(), json={"payment_status": "refunded"})
    row = _reg(env, token)
    assert (row["refunded_cents"], row["fee_refunded_cents"]) == (1000, 50)
    assert _fee_month(env)["not_collected"]["fee_net_cents"] == 0
    env.client.patch(path, headers=env.admin(), json={"payment_status": "paid"})  # undo
    assert _fee_month(env)["not_collected"]["fee_net_cents"] == 50


def test_fee_month_is_owner_only_and_validated(env):
    path = f"/admin/platform/organizations/{env.slug}/fees"
    assert env.client.get(path, params={"month": "2026-11"}, headers=env.admin()).status_code == 403
    assert env.client.get(path, params={"month": "2026-13"}, headers=owner_headers()).status_code == 422
    assert env.client.get(f"/admin/platform/organizations/{env.other_slug}/fees", params={"month": "2026-11"},
                          headers=owner_headers()).json()["bookings"] == []


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


# ---------- fix round 1: owner kill switch (I1), hardening (M1, M6, M8) ----------

def test_express_needs_platform_owner_switch(env):
    _activate_express(env, enabled=False)
    status_path = f"/admin/organizations/{env.slug}/payments/stripe"
    status = env.client.get(status_path, headers=env.admin()).json()
    assert status["state"] == "awaiting_approval" and status["platform_enabled"] is False
    assert status["online_payment_mode"] is None
    options = f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options"
    assert env.client.get(options).json() == {"online_payment_available": False}
    token = _register(env)
    assert _checkout(env, token).status_code == 503
    assert env.fake.named("Session.create") == []

    switch = f"/admin/platform/organizations/{env.slug}/online-payment"
    assert env.client.patch(switch, headers=env.admin(), json={"enabled": True}).status_code == 403
    r = env.client.patch(switch, headers=owner_headers(), json={"enabled": True})
    assert r.status_code == 200 and r.json()["state"] == "active"
    assert env.client.get(options).json() == {"online_payment_available": True}
    assert _checkout(env, token).status_code == 200
    # Switching off again stops new checkouts at once.
    env.client.patch(switch, headers=owner_headers(), json={"enabled": False})
    payments.checkout_limiter.reset()
    assert _checkout(env, _register(env)).status_code == 503


def test_connect_account_refuses_an_express_account_of_any_club(env):
    _org(env, stripe_express_account_id=env.express)
    r = env.client.post(f"/admin/organizations/{env.other_slug}/stripe/connect-account",
                        headers=owner_headers(), json={"stripe_account_id": env.express})
    assert r.status_code == 409
    _activate_legacy(env)
    r = env.client.post(f"/admin/organizations/{env.other_slug}/stripe/connect-account",
                        headers=owner_headers(), json={"stripe_account_id": LEGACY})
    assert r.status_code == 409
    assert env.fake.named("Account.retrieve") == []


def test_stripe_admin_calls_are_rate_limited(env, monkeypatch):
    from app.ratelimit import SlidingWindowLimiter
    monkeypatch.setattr(payments, "stripe_admin_limiter", SlidingWindowLimiter(1, 3600.0))
    path = f"/admin/organizations/{env.slug}/payments/stripe"
    assert env.client.post(f"{path}/onboarding", headers=env.admin()).status_code == 200
    assert env.client.post(f"{path}/sync", headers=env.admin()).status_code == 429
    assert len(env.fake.named("Account.retrieve")) == 0


GRANTS = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261106160000_billing_refunds_and_grants.sql"
B3_GRANTS = GRANTS.with_name("20261107110000_invoice_retry.sql")


def test_fee_and_stripe_columns_not_readable_by_authenticated(env):
    """M1: column grants on camp_registrations (the test DB fixture re-grants
    every table after migrations, so the migration is applied again here)."""
    user = uuid4()
    with env.cursor() as cur:
        cur.execute("insert into auth.users(id) values (%s)", (user,))
        cur.execute("insert into organization_members(user_id, organization_id) values (%s, %s)", (user, env.org))
    token = _register(env)
    try:
        with env.cursor() as cur:
            cur.execute(GRANTS.read_text(encoding="utf-8"))
            cur.execute(B3_GRANTS.read_text(encoding="utf-8"))
            # Re-run: the guard skips (no table-level grant any more), so later columns stay hidden.
            cur.execute(GRANTS.read_text(encoding="utf-8"))
            cur.execute("select has_table_privilege('authenticated', 'public.camp_registrations', 'SELECT') as t")
            assert cur.fetchone()["t"] is False
        for column in ("fee_cents", "fee_percent", "fee_refunded_cents", "refunded_cents",
                       "stripe_checkout_fee", "stripe_charge_type", "stripe_payment_intent_id",
                       # Later migrations: a re-run of 20261106160000 must not grant them (guard).
                       "booked_price_cents", "invoice_pending_reason", "invoice_error"):
            with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                with env.cursor() as cur:
                    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user)}),))
                    cur.execute("set local role authenticated")
                    cur.execute(f"select {column} from camp_registrations")
        with env.cursor() as cur:
            cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user)}),))
            cur.execute("set local role authenticated")
            cur.execute("select registration_token, payment_status from camp_registrations where registration_token=%s",
                        (token,))
            assert cur.fetchone()["payment_status"] == "open"
    finally:
        with env.cursor() as cur:
            cur.execute("grant select on public.camp_registrations to authenticated")


@pytest.mark.parametrize("status", ["failed", "canceled"])
def test_admin_refund_with_failed_status_is_502(env, status):
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    orig = env.fake.Refund.create
    env.fake.Refund.create = staticmethod(lambda **kw: {**orig(**kw), "status": status})
    r = _refund(env, token, 400)
    assert r.status_code == 502, r.text
