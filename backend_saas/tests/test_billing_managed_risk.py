"""Stripe Managed Risk: Accounts v2 club accounts, direct charges on the club's
account with application_fee_amount, Connect webhook settlement and refunds.

Stripe is always mocked (signatures are real HMACs with test secrets); real
local Postgres, synthetic data only. Onboarding (v2 account create, v2 account
link) is tested in test_billing_stripe_express.py.
"""

from __future__ import annotations

import json
import time
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import stripe

from app.routers import payments
from .auth_helpers import org_admin_headers, owner_headers
from .test_billing_stripe_express import (  # noqa: F401
    CONNECT_HOOK, CONNECT_SECRET, LEGACY, PLATFORM_HOOK, PLATFORM_SECRET, _activate_legacy, _checkout, _completed,
    _fee_month, _org, _post_webhook, _refund, _reg, _register, _settings, env,
)
from .test_invoices import DeliveringFake, _invoices, _profile, mail  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _post, fake_provider  # noqa: F401

OPTIONS = "/api/v1/organizations/{slug}/camps/summer-1/payment-options"


def _activate_direct_fee(env, enabled=True, charges=True):
    _org(env, stripe_express_account_id=env.express, stripe_express_account_kind="direct_fee",
         stripe_express_charges_enabled=charges, stripe_express_payouts_enabled=charges,
         stripe_express_details_submitted=charges, online_payment_enabled=enabled)


def _options(env):
    return env.client.get(OPTIONS.format(slug=env.slug)).json()["online_payment_available"]


def _completed_dfee(session_id, intent, **extra):
    event = _completed(session_id, intent, **extra)
    event["data"]["object"]["metadata"]["charge_type"] = "direct_fee"
    return event


def _no_payment_fee(env):
    """Webhook tests model a Stripe charge that withheld exactly the quoted 5 %
    (50 ct): switch the Stripe-fee estimate off so the quote matches the mock.
    The deduction itself is covered by the checkout tests."""
    current = env.state["settings"]
    env.state["settings"] = SimpleNamespace(**{**vars(current), "stripe_fee_percent": Decimal(0),
                                                "stripe_fee_fixed_cents": 0})


def _paid_direct_fee(env):
    _no_payment_fee(env)
    _activate_direct_fee(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    event = _completed_dfee(session_id, intent=env.intent, account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": True}
    return token, event


def _connect_refund_event(env, refunded, event_type="charge.refunded", account=None):
    obj = ({"object": "charge", "payment_intent": env.intent, "refunded": refunded >= 1000,
            "amount_refunded": refunded, "amount": 1000}
           if event_type == "charge.refunded"
           else {"object": "refund", "payment_intent": env.intent, "amount": refunded, "status": "succeeded"})
    return {"id": f"evt_{uuid4().hex}", "type": event_type, "livemode": False, "created": int(time.time()),
            "account": account or env.express, "data": {"object": obj}}


# ---------- status and gating ----------

def test_status_mapping_from_v1_retrieve(env):
    _org(env, stripe_express_account_id=env.express, stripe_express_account_kind="direct_fee",
         online_payment_enabled=True)
    path = f"/admin/organizations/{env.slug}/payments/stripe"
    env.fake.account_state = {"charges_enabled": False, "payouts_enabled": False, "details_submitted": True,
                              "requirements": {"currently_due": ["a", "b"], "past_due": ["b", "c"]}}
    status = env.client.post(f"{path}/sync", headers=env.admin()).json()
    assert (status["state"], status["requirements_due"], status["online_payment_mode"]) == ("incomplete", 3, None)
    assert env.fake.named("Account.retrieve") == [("Account.retrieve", env.express)]
    env.fake.account_state = {"charges_enabled": True, "payouts_enabled": True, "details_submitted": True,
                              "requirements": {"currently_due": [], "past_due": []}}
    status = env.client.post(f"{path}/sync", headers=env.admin()).json()
    assert (status["state"], status["online_payment_mode"], status["account_kind"]) == ("active", "direct_fee", "direct_fee")
    # account.updated (v1 snapshot event of the v2 account) on the Connect endpoint.
    event = {"id": "evt_acc", "type": "account.updated", "livemode": False, "account": env.express,
             "created": int(time.time()) + 5,
             "data": {"object": {"id": env.express, "charges_enabled": False, "payouts_enabled": True,
                                 "details_submitted": True, "requirements": {"currently_due": ["x"]}}}}
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).status_code == 200
    assert env.client.get(path, headers=env.admin()).json()["state"] == "incomplete"


def test_direct_fee_does_not_need_platform_webhook_secret(env):
    _activate_direct_fee(env)
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    assert _options(env) is True
    status = env.client.get(f"/admin/organizations/{env.slug}/payments/stripe", headers=env.admin()).json()
    assert status["service_ready"] is True and status["online_payment_mode"] == "direct_fee"
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    # Without the Connect webhook secret nothing goes online.
    env.state["settings"] = _settings(stripe_webhook_secret=None)
    assert _options(env) is False
    assert payments._service_ready(_settings(stripe_webhook_secret=None)) is False
    assert payments._service_ready(_settings(stripe_platform_webhook_secret=None)) is True
    assert payments._express_ready(_settings(stripe_platform_webhook_secret=None)) is False


def test_real_stripe_client_refuses_without_connect_secret(monkeypatch):
    """The un-mocked client gate used by checkout, refunds and webhooks."""
    import pytest
    from fastapi import HTTPException
    monkeypatch.setattr(payments, "get_settings", lambda: _settings(stripe_webhook_secret=None))
    with pytest.raises(HTTPException) as refused:
        payments._stripe_client()
    assert refused.value.status_code == 503
    monkeypatch.setattr(payments, "get_settings", lambda: _settings(stripe_platform_webhook_secret=None))
    assert payments._stripe_client() is not None
    assert isinstance(payments._stripe_v2(), payments.stripe.StripeClient)


def test_owner_approval_required_for_direct_fee(env):
    _activate_direct_fee(env, enabled=False)
    status = env.client.get(f"/admin/organizations/{env.slug}/payments/stripe", headers=env.admin()).json()
    assert status["state"] == "awaiting_approval" and status["online_payment_mode"] is None
    assert _options(env) is False
    token = _register(env)
    assert _checkout(env, token).status_code == 503
    assert env.fake.named("Session.create") == []
    switch = f"/admin/platform/organizations/{env.slug}/online-payment"
    assert env.client.patch(switch, headers=env.admin(), json={"enabled": True}).status_code == 403
    assert env.client.patch(switch, headers=owner_headers(), json={"enabled": True}).json()["state"] == "active"
    assert _checkout(env, token).status_code == 200


def test_incomplete_direct_fee_account_falls_back_to_legacy(env):
    _activate_legacy(env)
    _activate_direct_fee(env, charges=False)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == LEGACY and "application_fee_amount" not in kw["payment_intent_data"]
    assert _reg(env, token)["stripe_charge_type"] == "direct"


# ---------- checkout ----------

def test_checkout_is_direct_charge_with_application_fee(env):
    _activate_direct_fee(env)
    _activate_legacy(env)  # the club account wins
    token = _register(env)
    r = _checkout(env, token)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == env.express
    intent = kw["payment_intent_data"]
    # Ahmads Regel: Gebühr inkl. Zahlungsgebühren. 5 % von 10,00 € = 50 ct, abzüglich
    # geschätzter Stripe-Gebühr (1,5 % + 0,25 € = 40 ct) = 10 ct application fee.
    assert intent == {"metadata": {"campspilot": "1", "organization_id": str(env.org)}, "application_fee_amount": 10}
    assert "on_behalf_of" not in intent and "transfer_data" not in intent
    assert kw["line_items"][0]["price_data"]["unit_amount"] == 1000
    assert kw["metadata"] == {"campspilot": "1", "organization_id": str(env.org), "camp_slug": "summer-1",
                              "charge_type": "direct_fee"}
    assert kw["idempotency_key"] == f"campspilot-dfee-{token}-first-1000-10-{env.express}"
    assert "Kind" not in json.dumps(kw) and "max@example.com" not in json.dumps(kw)
    row = _reg(env, token)
    assert (row["stripe_charge_type"], row["stripe_checkout_account_id"]) == ("direct_fee", env.express)
    assert row["stripe_checkout_fee"]["fee_cents"] == 10 and row["fee_snapshot_at"] is None
    assert row["stripe_checkout_fee"]["gross_fee_cents"] == 50
    assert row["stripe_checkout_fee"]["payment_fee_cents"] == 40
    # Same booking again: open session on the club's account is reused.
    assert _checkout(env, token).json()["url"] == r.json()["url"]
    assert env.fake.named("Session.retrieve")[0][2] == {"stripe_account": env.express}
    assert len(env.fake.named("Session.create")) == 1


def test_zero_fee_omits_application_fee(env):
    _activate_direct_fee(env)
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, created_at) "
                    "values (%s,'individuell',0,'2000-01-01', now() + interval '1 second')", (env.org,))
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert "application_fee_amount" not in kw["payment_intent_data"] and kw["stripe_account"] == env.express


def test_fee_change_replaces_open_direct_fee_session_on_club_account(env):
    _activate_direct_fee(env)
    token = _register(env)
    first = _checkout(env, token).json()["url"]
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, created_at) "
                    "values (%s,'verein',4.90,'2000-01-01', now() + interval '1 second')", (env.org,))
    second = _checkout(env, token)
    assert second.status_code == 200 and second.json()["url"] != first
    expire, = env.fake.named("Session.expire")
    assert expire[2] == {"stripe_account": env.express}
    assert env.fake.named("Session.create")[1][1]["payment_intent_data"]["application_fee_amount"] == 9


def test_training_direct_fee_checkout_uses_applied_price(env, real_db):
    _activate_direct_fee(env)
    _, session = _make(real_db, member=3000, nonmember=4500)
    r = _post(real_db, session, payment_method="online")
    assert r.status_code == 201, r.text
    token = r.json()["registration_token"]
    assert _checkout(env, token, camp=session["slug"]).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == env.express
    assert kw["line_items"][0]["price_data"]["unit_amount"] == 4500
    assert kw["payment_intent_data"]["application_fee_amount"] == 132  # 225 - (68 + 25)


# ---------- Connect webhook ----------

def test_connect_webhook_marks_paid_with_snapshot_and_invoice(env, mail):
    _profile(env)
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)  # not needed
    token, event = _paid_direct_fee(env)
    row = _reg(env, token)
    assert (row["payment_status"], row["stripe_payment_intent_id"]) == ("paid", env.intent)
    assert (row["fee_plan"], row["fee_percent"], row["fee_base_cents"], row["fee_cents"], row["fee_collection"]) == (
        "individuell", Decimal("5.00"), 1000, 50, "application_fee")
    # The PaymentIntent lives on the club's account.
    assert env.fake.named("PaymentIntent.retrieve")[0][2] == {"expand": ["latest_charge"], "stripe_account": env.express}
    invoices = _invoices(env, token)
    assert [i["kind"] for i in invoices] == ["invoice"] and invoices[0]["gross_cents"] == 1000
    assert len(mail.invoices) == 1
    snapshot_at = row["fee_snapshot_at"]
    # Replay: no change, no second invoice.
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": True}
    assert _reg(env, token)["fee_snapshot_at"] == snapshot_at
    assert len(_invoices(env, token)) == 1 and len(mail.invoices) == 1
    assert _fee_month(env)["collected"]["fee_net_cents"] == 50


def test_connect_webhook_ignores_other_accounts_and_platform_endpoint(env):
    _activate_direct_fee(env)
    token = _register(env)
    _checkout(env, token)
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    # Same session reported from another connected account: never settled (retry, then review).
    foreign = _completed_dfee(session_id, intent=env.intent, account="acct_1FOREIGN0000000001")
    assert _post_webhook(env, CONNECT_HOOK, foreign, CONNECT_SECRET).status_code == 503
    old = {**foreign, "created": int(time.time()) - 7 * 3600}
    assert _post_webhook(env, CONNECT_HOOK, old, CONNECT_SECRET).json() == {"received": True, "settled": False}
    # Without our charge_type marker the legacy query runs and does not match.
    plain = _completed(session_id, intent=env.intent, account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, plain, CONNECT_SECRET).status_code == 503
    # The platform endpoint never settles a direct charge.
    platform = _completed(session_id, intent=env.intent)
    assert _post_webhook(env, PLATFORM_HOOK, platform, PLATFORM_SECRET).status_code == 503
    assert _reg(env, token)["payment_status"] == "open"


def test_connect_webhook_amount_mismatch_is_flagged(env, monkeypatch):
    _activate_direct_fee(env)
    token = _register(env)
    _checkout(env, token)
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, reg, reason, *_: flagged.append(reason))
    event = _completed_dfee(_reg(env, token)["stripe_checkout_session_id"], intent=env.intent, amount=999,
                            account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": False}
    assert flagged == ["amount_mismatch"] and _reg(env, token)["payment_status"] == "open"


def test_legacy_direct_settlement_unchanged(env):
    _activate_legacy(env)
    token = _register(env)
    _checkout(env, token)
    event = _completed(_reg(env, token)["stripe_checkout_session_id"], intent=env.intent, account=LEGACY)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": True}
    row = _reg(env, token)
    assert (row["payment_status"], row["stripe_charge_type"], row["fee_collection"]) == ("paid", "direct", "not_collected")
    assert env.fake.named("PaymentIntent.retrieve")[0][2] == {"expand": ["latest_charge"], "stripe_account": LEGACY}
    # Full refund on the legacy account: booked from the charge, no fee lookup.
    env.fake.calls.clear()
    refunded = {"id": "evt_r", "type": "charge.refunded", "livemode": False, "account": LEGACY,
                "data": {"object": {"payment_intent": env.intent, "refunded": True, "amount_refunded": 1000, "amount": 1000}}}
    assert _post_webhook(env, CONNECT_HOOK, refunded, CONNECT_SECRET).status_code == 200
    assert _reg(env, token)["payment_status"] == "refunded"
    assert env.fake.named("PaymentIntent.retrieve") == []


# ---------- refunds ----------

def test_refund_is_created_on_club_account_without_reverse_transfer(env):
    token, _ = _paid_direct_fee(env)
    assert _refund(env, token, headers=org_admin_headers(str(env.other))).status_code == 403
    request_id = uuid4()
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    r = _refund(env, token, 400, request_id)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Refund.create")
    assert kw["payment_intent"] == env.intent and kw["amount"] == 400
    assert kw["refund_application_fee"] is True and kw["stripe_account"] == env.express
    assert "reverse_transfer" not in kw
    assert kw["idempotency_key"] == f"campspilot-refund-{_reg(env, token)['id']}-400-{request_id}"
    assert _reg(env, token)["payment_status"] == "paid"  # booked only from Stripe's webhook
    reg = env.client.get(f"/admin/organizations/{env.slug}/registrations/{token}/invoices", headers=env.admin()).json()
    assert reg["refund"] == {"possible": True, "remaining_cents": 1000}


def test_refund_webhooks_update_amounts_from_stripe(env):
    token, _ = _paid_direct_fee(env)
    # Partial refund; application fee not expanded (lives on the platform): read there.
    env.fake.charge = {**env.fake.charge, "amount_refunded": 400, "application_fee": "fee_test_1"}
    env.fake.application_fee = {"id": "fee_test_1", "amount": 50, "amount_refunded": 20}
    env.fake.calls.clear()
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 400), CONNECT_SECRET).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("partially_refunded", 400, 20)
    assert env.fake.named("PaymentIntent.retrieve")[0][2]["stripe_account"] == env.express
    assert env.fake.named("ApplicationFee.retrieve") == [("ApplicationFee.retrieve", "fee_test_1", {})]
    # charge.refund.updated with the rest, then a late older event: never backwards.
    env.fake.charge = {**env.fake.charge, "amount_refunded": 1000, "refunded": True,
                       "application_fee": {"amount": 50, "amount_refunded": 50}}
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 600, "charge.refund.updated"),
                         CONNECT_SECRET).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("refunded", 1000, 50)
    env.fake.charge = {**env.fake.charge, "amount_refunded": 400, "refunded": False,
                       "application_fee": {"amount": 50, "amount_refunded": 20}}
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 400), CONNECT_SECRET).status_code == 200
    assert _reg(env, token)["payment_status"] == "refunded"
    assert _fee_month(env)["collected"]["fee_net_cents"] == 0


def test_refund_event_from_other_account_changes_nothing(env):
    token, _ = _paid_direct_fee(env)
    env.fake.charge = {**env.fake.charge, "amount_refunded": 1000, "refunded": True,
                       "application_fee": {"amount": 50, "amount_refunded": 50}}
    event = _connect_refund_event(env, 1000, account="acct_1FOREIGN0000000001")
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True}
    assert _reg(env, token)["payment_status"] == "paid"


def test_refund_waits_for_unexpanded_fee_object(env):
    token, _ = _paid_direct_fee(env)
    # Application fees of direct charges are created asynchronously: no fee yet -> retry.
    env.fake.charge = {**env.fake.charge, "amount_refunded": 400, "application_fee": None}
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 400), CONNECT_SECRET).status_code == 503
    assert _reg(env, token)["refunded_cents"] in (None, 0)


# ---------- fix round 1 ----------

def test_fee_lookup_failure_never_blocks_paid(env, monkeypatch):
    """I1: a refund before the completed event, and the ApplicationFee cannot be
    read yet: the payment is still booked, the fee refund comes later."""
    _no_payment_fee(env)
    _activate_direct_fee(env)
    token = _register(env)
    _checkout(env, token)
    env.fake.charge = {**env.fake.charge, "amount_refunded": 400, "application_fee": "fee_test_1"}

    working = env.fake.ApplicationFee.retrieve

    def broken(fee_id, **kw):
        env.fake.calls.append(("ApplicationFee.retrieve", fee_id, kw))
        raise stripe.error.InvalidRequestError("No such application fee", "id")
    monkeypatch.setattr(env.fake.ApplicationFee, "retrieve", staticmethod(broken))
    event = _completed_dfee(_reg(env, token)["stripe_checkout_session_id"], intent=env.intent, account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": True}
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"], row["fee_cents"]) == (
        "partially_refunded", 400, 0, 50)
    assert env.fake.named("PaymentIntent.retrieve")[0][2] == {"expand": ["latest_charge"], "stripe_account": env.express}
    # The refund event retries until the fee is readable, then books it.
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 400), CONNECT_SECRET).status_code == 503
    monkeypatch.setattr(env.fake.ApplicationFee, "retrieve", staticmethod(working))
    env.fake.application_fee = {"id": "fee_test_1", "amount": 50, "amount_refunded": 20}
    assert _post_webhook(env, CONNECT_HOOK, _connect_refund_event(env, 400), CONNECT_SECRET).status_code == 200
    assert _reg(env, token)["fee_refunded_cents"] == 20


def test_no_fee_lookup_without_refund(env):
    _paid_direct_fee(env)
    assert env.fake.named("ApplicationFee.retrieve") == []


def test_fee_is_capped_below_the_charge_amount(env):
    """M2: application_fee_amount must be less than the charge."""
    _no_payment_fee(env)
    _activate_direct_fee(env)
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, min_fee_cents, valid_from, "
                    "created_at) values (%s,'individuell',5,5000,'2000-01-01', now() + interval '1 second')", (env.org,))
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["payment_intent_data"]["application_fee_amount"] == 999
    assert _reg(env, token)["stripe_checkout_fee"]["fee_cents"] == 999


def test_fee_mismatch_is_flagged_but_paid(env, monkeypatch):
    """M3: Stripe withholds another fee than the quote: paid, flagged."""
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, reg, reason, *_: flagged.append(reason))
    env.fake.charge = {**env.fake.charge, "application_fee_amount": 40}
    token, _ = _paid_direct_fee(env)
    assert _reg(env, token)["payment_status"] == "paid" and flagged == ["fee_mismatch"]
    flagged.clear()
    env.intent = f"pi_test{uuid4().hex[:16]}"
    env.fake.charge = {**env.fake.charge, "application_fee_amount": 50}
    _paid_direct_fee(env)
    assert flagged == []


def test_fee_below_payment_fee_omits_application_fee(env):
    """Gebühr kleiner als die geschätzte Stripe-Gebühr: keine application fee,
    der Verein zahlt nie mehr als den Prozentsatz seines Pakets."""
    _activate_direct_fee(env)
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, created_at) "
                    "values (%s,'individuell',2,'2000-01-01', now() + interval '1 second')", (env.org,))
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert "application_fee_amount" not in kw["payment_intent_data"]
    assert _reg(env, token)["stripe_checkout_fee"]["fee_cents"] == 0


def test_destination_charges_keep_the_full_fee(env):
    """Bei Destination Charges zahlt die Plattform Stripe selbst: kein Abzug."""
    from app import fees
    rule = fees.FeeRule(None, "starter", Decimal("6.90"), None, None, None)
    assert fees.fee_quote(rule, 15000)["fee_cents"] == 1035


def test_net_fee_settles_without_flag_and_snapshot_holds_net_fee(env, monkeypatch):
    """Stripe behält genau die gekürzte Gebühr (10 ct) ein: bezahlt, keine
    Prüfmeldung, im Snapshot steht, was die Plattform wirklich bekommt."""
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, reg, reason, *_: flagged.append(reason))
    env.fake.charge = {**env.fake.charge, "application_fee_amount": 10}
    _activate_direct_fee(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    event = _completed_dfee(_reg(env, token)["stripe_checkout_session_id"], intent=env.intent, account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).json() == {"received": True, "settled": True}
    row = _reg(env, token)
    assert (row["payment_status"], row["fee_cents"], row["fee_collection"]) == ("paid", 10, "application_fee")
    assert flagged == []
