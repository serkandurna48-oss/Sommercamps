"""Platform payments (decision 10.11.2026): parents pay on CampsPilot's own Stripe
account, no club account; the platform keeps its fee and pays the rest out by
bank transfer (payout ledger). Stripe is a recording fake (pattern of
test_billing_managed_risk.py); real local Postgres, synthetic data only."""

from __future__ import annotations

import json
import time
from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
import stripe

from app.routers import payments
from .auth_helpers import org_admin_headers, owner_headers
from .selfservice_helpers import make_camp, make_other_org, make_reg
from .test_billing_managed_risk import _activate_direct_fee, _options  # noqa: F401
from .test_billing_stripe_express import (  # noqa: F401
    PLATFORM_HOOK, PLATFORM_SECRET, CONNECT_HOOK, CONNECT_SECRET, _checkout, _completed, _org, _post_webhook,
    _refund, _reg, _register, _settings, env,
)
from .test_invoices import DeliveringFake, _invoices, _profile, mail  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _post, fake_provider  # noqa: F401


def _completed_platform(session_id, intent, **extra):
    event = _completed(session_id, intent, **extra)
    event["data"]["object"]["metadata"]["charge_type"] = "platform"
    return event


def _enable(env):
    _org(env, online_payment_enabled=True)


def _paid_platform(env):
    _enable(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    # A platform charge has no application fee at Stripe.
    env.fake.charge = {"amount": 1000, "amount_refunded": 0, "refunded": False}
    r = _post_webhook(env, PLATFORM_HOOK, _completed_platform(session_id, env.intent), PLATFORM_SECRET)
    assert r.json() == {"received": True, "settled": True}, r.text
    return token, session_id


def _refund_event(env, refunded, event_type="charge.refunded"):
    obj = ({"object": "charge", "payment_intent": env.intent, "refunded": refunded >= 1000,
            "amount_refunded": refunded, "amount": 1000}
           if event_type == "charge.refunded"
           else {"object": "refund", "payment_intent": env.intent, "amount": refunded, "status": "succeeded"})
    return {"id": f"evt_{uuid4().hex}", "type": event_type, "livemode": False, "created": int(time.time()),
            "data": {"object": obj}}


def _stripe_says_refunded(env, refunded):
    env.fake.charge = {"amount": 1000, "amount_refunded": refunded, "refunded": refunded >= 1000}


# ---------- mode selection and owner switch ----------

def test_club_without_stripe_account_can_be_enabled_and_disabled(env):
    switch = f"/admin/platform/organizations/{env.slug}/online-payment"
    assert _options(env) is False
    r = env.client.patch(switch, headers=owner_headers(), json={"enabled": True})
    assert r.status_code == 200, r.text
    assert r.json()["online_payment_mode"] == "platform" and r.json()["platform_enabled"] is True
    assert _options(env) is True
    club = env.client.get(f"/admin/organizations/{env.slug}/payments/stripe", headers=env.admin()).json()
    assert club["online_payment_mode"] == "platform" and club["state"] == "not_set_up"
    assert "acct_" not in json.dumps(club)
    r = env.client.patch(switch, headers=owner_headers(), json={"enabled": False})
    assert r.json()["online_payment_mode"] is None and _options(env) is False


def test_platform_mode_needs_the_platform_webhook_secret(env):
    _enable(env)
    env.state["settings"] = _settings(stripe_platform_webhook_secret=None)
    assert _options(env) is False
    assert _checkout(env, _register(env)).status_code == 503


def test_platform_route_wins_even_with_a_club_account(env):
    _activate_direct_fee(env)
    _org(env, payment_route="platform")
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert "stripe_account" not in kw and _reg(env, token)["stripe_charge_type"] == "platform"


def test_connect_route_uses_the_club_account_and_never_falls_back(env):
    _activate_direct_fee(env)  # sets route connect
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == env.express and _reg(env, token)["stripe_charge_type"] == "direct_fee"
    # Connect route without an active account: no online payment, no platform fallback.
    _activate_direct_fee(env, charges=False)
    assert _options(env) is False
    assert _checkout(env, _register(env)).status_code == 503
    _org(env, payment_route="connect", stripe_express_account_id=None, stripe_express_account_kind=None)
    assert _options(env) is False


def test_existing_clubs_default_to_platform_route(env):
    with env.cursor() as cur:
        cur.execute("select payment_route from organizations where id=%s", (env.org,))
        assert cur.fetchone()["payment_route"] == "platform"
        import psycopg2
        with pytest.raises(psycopg2.errors.CheckViolation):
            cur.execute("update organizations set payment_route='x' where id=%s", (env.org,))


def test_owner_chooses_the_payment_route(env):
    path = f"/admin/platform/organizations/{env.slug}/payment-route"
    assert env.client.patch(path, headers=env.admin(), json={"route": "connect"}).status_code == 403
    r = env.client.patch(path, headers=owner_headers(), json={"route": "connect"})
    assert r.status_code == 200 and r.json()["payment_route"] == "connect"
    assert env.client.get(f"/admin/organizations/{env.slug}/payments/stripe", headers=env.admin()).json()["payment_route"] == "connect"
    assert env.client.patch(path, headers=owner_headers(), json={"route": "bogus"}).status_code == 422
    r = env.client.patch(path, headers=owner_headers(), json={"route": "platform"})
    assert r.json()["payment_route"] == "platform"


def test_payment_options_name_the_payee(env):
    assert env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json() == {
        "online_payment_available": False, "online_payee": "club"}
    _enable(env)
    assert env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json() == {
        "online_payment_available": True, "online_payee": "platform"}
    _activate_direct_fee(env)
    assert env.client.get(f"/api/v1/organizations/{env.slug}/camps/summer-1/payment-options").json() == {
        "online_payment_available": True, "online_payee": "club"}


# ---------- checkout ----------

def test_checkout_is_a_plain_platform_session(env):
    _enable(env)
    token = _register(env)
    r = _checkout(env, token)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Session.create")
    assert "stripe_account" not in kw
    assert "payment_method_types" not in kw
    intent = kw.get("payment_intent_data", {})
    assert not {"application_fee_amount", "transfer_data", "on_behalf_of"} & set(intent)
    assert kw["metadata"] == {"campspilot": "1", "organization_id": str(env.org), "camp_slug": "summer-1",
                              "charge_type": "platform"}
    assert kw["client_reference_id"] == str(token)
    assert kw["idempotency_key"] == f"campspilot-plat-v2-{token}-first-1000"
    assert kw["line_items"][0]["price_data"]["unit_amount"] == 1000
    assert "Kind" not in json.dumps(kw) and "max@example.com" not in json.dumps(kw)
    row = _reg(env, token)
    assert (row["stripe_charge_type"], row["stripe_checkout_account_id"]) == ("platform", None)
    # Full plan fee, no Stripe-fee deduction: 5 % of 10,00 EUR.
    assert row["stripe_checkout_fee"]["fee_cents"] == 50 and "payment_fee_cents" not in row["stripe_checkout_fee"]
    # Same booking: the open session on the platform account is reused.
    assert _checkout(env, token).json()["url"] == r.json()["url"]
    assert env.fake.named("Session.retrieve")[0][2] == {}
    assert len(env.fake.named("Session.create")) == 1


def test_fee_change_replaces_the_open_platform_session(env):
    _enable(env)
    token = _register(env)
    first = _checkout(env, token).json()["url"]
    with env.cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, created_at) "
                    "values (%s,'individuell',7,'2000-01-01', now() + interval '1 second')", (env.org,))
        # The fee rule is fixed at booking date: change the stored quote instead.
        cur.execute("update camp_registrations set stripe_checkout_fee = jsonb_set(stripe_checkout_fee, '{fee_cents}', '99') "
                    "where registration_token=%s", (token,))
    assert _checkout(env, token).json()["url"] != first
    assert len(env.fake.named("Session.expire")) == 1 and env.fake.named("Session.expire")[0][2] == {}
    assert env.fake.named("Session.create")[1][1]["idempotency_key"].startswith(f"campspilot-plat-v2-{token}-cs_test_")


# ---------- webhook ----------

def test_platform_webhook_settles_with_snapshot_and_invoice(env, mail):
    _profile(env)
    token, _ = _paid_platform(env)
    row = _reg(env, token)
    assert row["payment_status"] == "paid" and row["stripe_payment_intent_id"] == env.intent
    assert row["paid_at"] is not None
    assert (row["fee_collection"], row["fee_cents"], row["fee_base_cents"]) == ("platform_collected", 50, 1000)
    invoices = _invoices(env, token)
    assert len(invoices) == 1 and len(mail.invoices) == 1
    # Replay: nothing changes, no second invoice.
    row_session = row["stripe_checkout_session_id"]
    again = _post_webhook(env, PLATFORM_HOOK, _completed_platform(row_session, env.intent), PLATFORM_SECRET)
    assert again.json() == {"received": True, "settled": True}
    assert len(_invoices(env, token)) == 1 and len(mail.invoices) == 1


def test_platform_webhook_works_without_any_club_account(env):
    with env.cursor() as cur:
        cur.execute("select stripe_account_id, stripe_express_account_id from organizations where id=%s", (env.org,))
        assert tuple(cur.fetchone().values()) == (None, None)
    token, _ = _paid_platform(env)
    assert _reg(env, token)["payment_status"] == "paid"


def test_platform_amount_mismatch_is_flagged_and_not_booked(env, monkeypatch):
    _enable(env)
    token = _register(env)
    _checkout(env, token)
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, reg, reason, *_: flagged.append(reason))
    event = _completed_platform(_reg(env, token)["stripe_checkout_session_id"], env.intent, amount=999)
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).json() == {"received": True, "settled": False}
    assert flagged == ["amount_mismatch"] and _reg(env, token)["payment_status"] == "open"


def test_connect_endpoint_never_settles_a_platform_payment(env):
    _enable(env)
    token = _register(env)
    _checkout(env, token)
    event = _completed_platform(_reg(env, token)["stripe_checkout_session_id"], env.intent, account=env.express)
    assert _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET).status_code == 503
    assert _reg(env, token)["payment_status"] == "open"


# ---------- refunds ----------

def test_admin_refund_is_on_the_platform_account_and_returns_the_fee(env):
    token, _ = _paid_platform(env)
    assert _refund(env, token, headers=org_admin_headers(str(env.other))).status_code == 403
    request_id = uuid4()
    r = _refund(env, token, 400, request_id)
    assert r.status_code == 200, r.text
    (_, kw), = env.fake.named("Refund.create")
    assert "stripe_account" not in kw and "reverse_transfer" not in kw and "refund_application_fee" not in kw
    assert kw["payment_intent"] == env.intent and kw["amount"] == 400
    assert kw["idempotency_key"] == f"campspilot-refund-{_reg(env, token)['id']}-400-{request_id}"
    # Webhook books Stripe's numbers: partial refund returns the fee proportionally (40 %: 20 of 50 ct).
    _stripe_says_refunded(env, 400)
    assert _post_webhook(env, PLATFORM_HOOK, _refund_event(env, 400), PLATFORM_SECRET).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("partially_refunded", 400, 20)
    # Rest: full refund, the whole fee is back.
    assert _refund(env, token, None).status_code == 200
    assert env.fake.named("Refund.create")[1][1]["amount"] == 600
    _stripe_says_refunded(env, 1000)
    assert _post_webhook(env, PLATFORM_HOOK, _refund_event(env, 1000, "charge.refund.updated"),
                         PLATFORM_SECRET).status_code == 200
    row = _reg(env, token)
    assert (row["payment_status"], row["refunded_cents"], row["fee_refunded_cents"]) == ("refunded", 1000, 50)
    month = _fee_month_platform(env)
    assert month["collected"]["fee_net_cents"] == 0 and month["not_collected"]["bookings"] == 0


def _fee_month_platform(env):
    month = datetime.now(__import__("zoneinfo").ZoneInfo("Europe/Berlin")).strftime("%Y-%m")
    r = env.client.get(f"/admin/platform/organizations/{env.slug}/fees", params={"month": month}, headers=owner_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_platform_payment_counts_as_collected_in_the_fee_month(env):
    _paid_platform(env)
    month = _fee_month_platform(env)
    assert month["collected"]["bookings"] == 1 and month["collected"]["fee_net_cents"] == 50
    assert month["not_collected"]["bookings"] == 0


def test_refund_is_refused_for_foreign_payments_but_allowed_for_platform(env):
    token, _ = _paid_platform(env)
    r = env.client.get(f"/admin/organizations/{env.slug}/registrations/{token}/invoices", headers=env.admin())
    assert r.json()["refund"] == {"possible": True, "remaining_cents": 1000}


def test_open_platform_checkout_is_closed_on_the_platform_account(env):
    _enable(env)
    token = _register(env)
    _checkout(env, token)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set payment_status='waived' where registration_token=%s", (token,))
    payments.expire_open_checkout(env.org, token)
    assert env.fake.named("Session.expire")[0][2] == {}


# ---------- manual status, webhook replay, refund guards ----------

def test_manual_status_change_is_refused_for_online_paid_bookings(env):
    token, _ = _paid_platform(env)
    r = env.client.patch(f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/payment-status",
                         headers=env.admin(), json={"payment_status": "open"})
    assert r.status_code == 409 and "online bezahlt" in r.json()["detail"] and "du" not in r.json()["detail"].split()[:0]
    assert _reg(env, token)["payment_status"] == "paid" and _reg(env, token)["fee_collection"] == "platform_collected"


def test_webhook_replay_keeps_paid_at(env):
    token, session_id = _paid_platform(env)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set paid_at='2026-12-02 10:00:00+00' where registration_token=%s", (token,))
    assert _post_webhook(env, PLATFORM_HOOK, _completed_platform(session_id, env.intent), PLATFORM_SECRET).status_code == 200
    assert _reg(env, token)["paid_at"] == datetime(2026, 12, 2, 10, 0, tzinfo=__import__("datetime").timezone.utc)


def test_refund_balance_errors_name_the_right_balance(env):
    token, _ = _paid_platform(env)
    env.fake.refund_error = stripe.error.InvalidRequestError("no funds", "amount", code="insufficient_funds")
    r = _refund(env, token)
    assert r.status_code == 409 and "Plattformguthaben" in r.json()["detail"] and "des Vereins" not in r.json()["detail"]
    assert payments._refund_error("balance_insufficient", "direct_fee")[1].startswith("Das Stripe-Guthaben des Vereins")
    assert payments._refund_error("balance_insufficient", "platform")[1].startswith("Das Plattformguthaben")


# ---------- payout ledger ----------

def _paid_row(env, org, camp, paid_at, amount=1000, fee=50, refunds=(), collection="platform_collected", charge="platform"):
    """refunds: (created_at, refunded_delta_cents, fee_delta_cents) events."""
    child = f"K{uuid4().hex[:6]}"
    with env.cursor() as cur:
        token = make_reg(cur, org, camp, child=child, payment_status="paid")
        cur.execute(
            """update camp_registrations set stripe_charge_type=%s, stripe_payment_intent_id=%s,
                   stripe_checkout_amount_cents=%s, paid_at=%s, fee_plan='individuell', fee_percent=5,
                   fee_base_cents=%s, fee_cents=%s, fee_collection=%s, fee_snapshot_at=%s
               where registration_token=%s returning id""",
            (charge, f"pi_{uuid4().hex[:16]}", amount, paid_at, amount, fee, collection, paid_at, token))
        reg_id = cur.fetchone()["id"]
        for created, refunded, fee_back in refunds:
            cur.execute("insert into registration_refund_events (organization_id, registration_id, refunded_delta_cents, "
                        "fee_delta_cents, source, created_at) values (%s,%s,%s,%s,'stripe',%s)",
                        (org, reg_id, refunded, fee_back, created))
    return token


def _payouts(env, month, slug=None, headers=None):
    return env.client.get(f"/admin/platform/organizations/{slug or env.slug}/payouts", params={"month": month},
                          headers=headers or owner_headers())


@pytest.fixture
def ledger(env):
    with env.cursor() as cur:
        camp = make_camp(cur, env.org, datetime(2027, 7, 9).date(), title="Sommercamp")
        other_camp = make_camp(cur, env.other, datetime(2027, 7, 9).date(), title="Fremdcamp")
        cur.execute("update organizations set iban='DE89370400440532013000' where id=%s", (env.org,))
    return SimpleNamespace(camp=camp, other_camp=other_camp)


def test_payout_math_with_refunds_isolation_and_berlin_month_boundary(env, ledger):
    # December 2026 (Berlin): two payments; one refunded in January (not December).
    _paid_row(env, env.org, ledger.camp, "2026-12-01 10:00:00+00", 10000, 490)
    _paid_row(env, env.org, ledger.camp, "2026-12-15 10:00:00+00", 5000, 245,
              refunds=[("2027-01-10 10:00:00+00", 2000, 98)])
    # Boundary: 22:59 UTC on 31.12. is 23:59 Berlin (December); 23:00 UTC is 00:00 Berlin (January);
    # 23:30 UTC on 30.11. is 00:30 Berlin on 1.12. (December).
    _paid_row(env, env.org, ledger.camp, "2026-12-31 22:59:00+00", 1000, 50)
    _paid_row(env, env.org, ledger.camp, "2026-12-31 23:00:00+00", 3000, 150)
    _paid_row(env, env.org, ledger.camp, "2026-11-30 23:30:00+00", 2000, 100)
    # Not ours: other club, other payment path (fee not collected by the platform).
    _paid_row(env, env.other, ledger.other_camp, "2026-12-10 10:00:00+00", 7777, 388)
    _paid_row(env, env.org, ledger.camp, "2026-12-10 10:00:00+00", 4444, 0, collection="application_fee", charge="direct_fee")
    with env.cursor() as cur:
        make_reg(cur, env.org, ledger.camp, child="Open")
    body = _payouts(env, "2026-12").json()
    assert body["paid_cents"] == 10000 + 5000 + 1000 + 2000
    assert (body["refunded_cents"], body["refunds"]) == (0, [])
    assert body["fee_cents"] == 490 + 245 + 50 + 100
    assert body["payout_cents"] == 18000 - 885 == 17115
    assert body["iban"] == "DE89370400440532013000" and body["payout"] is None and body["carry_over"] is False
    assert [b["date"] for b in body["bookings"]] == ["2026-12-01", "2026-12-01", "2026-12-15", "2026-12-31"]
    assert set(body["bookings"][0]) == {"date", "camp_title", "amount_cents", "fee_cents"}
    assert {b["camp_title"] for b in body["bookings"]} == {"Sommercamp"}
    dumped = json.dumps(body)
    assert "Pia" not in dumped and "Geheimweg" not in dumped and "p@example.com" not in dumped
    # January: the 00:00-Berlin payment, minus the refund booked in January.
    jan = _payouts(env, "2027-01").json()
    assert (jan["paid_cents"], jan["refunded_cents"], jan["fee_cents"]) == (3000, 2000, 150 - 98)
    assert jan["payout_cents"] == 3000 - 2000 - 52 == 948
    assert jan["refunds"] == [{"date": "2027-01-10", "camp_title": "Sommercamp", "refund_cents": 2000,
                               "fee_returned_cents": 98}]
    assert _payouts(env, "2026-10").json()["payout_cents"] == 0
    assert _payouts(env, "2026-12", slug=env.other_slug).json()["paid_cents"] == 7777


def test_refund_in_a_month_without_payments_is_a_carry_over(env, ledger):
    _paid_row(env, env.org, ledger.camp, "2026-12-15 10:00:00+00", 5000, 245,
              refunds=[("2027-02-10 10:00:00+00", 5000, 245)])
    feb = _payouts(env, "2027-02").json()
    assert (feb["paid_cents"], feb["refunded_cents"], feb["fee_cents"]) == (0, 5000, -245)
    assert feb["payout_cents"] == -4755 and feb["carry_over"] is True and feb["bookings"] == []
    # Berlin boundary for refunds: 23:30 UTC on 31.01. is 00:30 on 1.02.
    _paid_row(env, env.org, ledger.camp, "2026-12-16 10:00:00+00", 1000, 50,
              refunds=[("2027-01-31 23:30:00+00", 1000, 50)])
    assert _payouts(env, "2027-02").json()["refunded_cents"] == 6000
    assert _payouts(env, "2027-01").json()["refunded_cents"] == 0


def test_ledger_filters_by_fee_collection_not_payment_status(env, ledger):
    token = _paid_row(env, env.org, ledger.camp, "2026-12-03 10:00:00+00", 1000, 50)
    with env.cursor() as cur:  # a status edited afterwards does not remove the payment from the ledger
        cur.execute("update camp_registrations set payment_status='cancelled' where registration_token=%s", (token,))
        make_reg(cur, env.org, ledger.camp, child="Unpaid")
    assert _payouts(env, "2026-12").json()["paid_cents"] == 1000


def test_review_flagged_payments_are_listed_separately(env, ledger):
    token = _paid_row(env, env.org, ledger.camp, "2026-12-03 10:00:00+00", 1000, 50)
    with env.cursor() as cur:
        cur.execute("select id from camp_registrations where registration_token=%s", (token,))
        rid = cur.fetchone()["id"]
        for reason, when in (("duplicate_payment", "2026-12-04 10:00:00+00"),
                             ("payment_for_closed_registration", "2026-12-05 10:00:00+00"),
                             ("amount_mismatch", "2026-12-06 10:00:00+00"),
                             ("duplicate_payment", "2027-01-04 10:00:00+00")):
            cur.execute("insert into audit_log (action, organization_id, target_type, target_id, metadata, created_at) "
                        "values ('stripe.payment_needs_review', %s, 'registration', %s, %s::jsonb, %s)",
                        (env.org, str(rid), json.dumps({"reason": reason}), when))
    review = _payouts(env, "2026-12").json()["review"]
    assert review == [
        {"date": "2026-12-04", "camp_title": "Sommercamp", "amount_cents": 1000, "reason": "duplicate_payment"},
        {"date": "2026-12-05", "camp_title": "Sommercamp", "amount_cents": 1000, "reason": "payment_for_closed_registration"}]
    assert len(_payouts(env, "2027-01").json()["review"]) == 1


def test_payouts_are_owner_only_and_validate_the_month(env, ledger):
    assert _payouts(env, "2026-12", headers=env.admin()).status_code == 403
    post = env.client.post(f"/admin/platform/organizations/{env.slug}/payouts/2026-12/mark-paid",
                           headers=env.admin(), json={"paid_at": "2027-01-05", "reference": "x"})
    assert post.status_code == 403
    assert _payouts(env, "2026-13").status_code == 422 and _payouts(env, "12-2026").status_code == 422
    assert _payouts(env, "2026-12", slug="nope-nope").status_code == 404


@pytest.fixture(autouse=True)
def _berlin_february(monkeypatch):
    monkeypatch.setattr(payments, "_berlin_month_now", lambda: "2027-02")


def _mark(env, month, paid_at="2027-01-05", reference="Auszahlung 12/2026", slug=None):
    owner = uuid4()
    with env.cursor() as cur:
        cur.execute("insert into auth.users(id) values (%s)", (owner,))
    return env.client.post(f"/admin/platform/organizations/{slug or env.slug}/payouts/{month}/mark-paid",
                           headers=owner_headers(user_id=str(owner)), json={"paid_at": paid_at, "reference": reference})


def test_mark_paid_is_idempotent_unique_and_audited(env, ledger):
    _paid_row(env, env.org, ledger.camp, "2026-12-03 10:00:00+00", 10000, 490)
    r = _mark(env, "2026-12")
    assert r.status_code == 200, r.text
    assert r.json()["payout"] == {"payout_cents": 9510, "paid_at": "2027-01-05", "reference": "Auszahlung 12/2026"}
    assert r.json()["changed_since_paid"] is False
    assert _mark(env, "2026-12").status_code == 200
    assert _mark(env, "2026-12", reference="anderer Text").status_code == 409
    assert _mark(env, "2026-12", paid_at="2027-01-06").status_code == 409
    with env.cursor() as cur:
        cur.execute("select month, payout_cents, paid_at, reference from organization_payouts where organization_id=%s",
                    (env.org,))
        rows = cur.fetchall()
        cur.execute("select * from audit_log where action='payout.marked_paid' and organization_id=%s", (env.org,))
        audit = cur.fetchall()
    assert len(rows) == 1 and str(rows[0]["month"]) == "2026-12-01" and rows[0]["payout_cents"] == 9510
    assert len(audit) == 1 and audit[0]["metadata"] == {"month": "2026-12", "payout_cents": 9510}
    assert _payouts(env, "2026-12").json()["payout"]["reference"] == "Auszahlung 12/2026"
    # A refund booked in a LATER month does not touch the paid month.
    _paid_row(env, env.other, ledger.other_camp, "2026-12-03 10:00:00+00", 2000, 100,
              refunds=[("2027-01-20 10:00:00+00", 2000, 100)])
    assert _payouts(env, "2026-12").json()["changed_since_paid"] is False
    import psycopg2
    with pytest.raises(psycopg2.errors.UniqueViolation):
        with env.cursor() as cur:
            cur.execute("insert into organization_payouts (organization_id, month, payout_cents, paid_at, reference) "
                        "values (%s,'2026-12-01',1,'2027-01-05','dup')", (env.org,))
    assert _mark(env, "2026-12", slug=env.other_slug).status_code == 200


def test_changed_since_paid_when_a_refund_lands_in_the_marked_month(env, ledger):
    _paid_row(env, env.org, ledger.camp, "2026-12-03 10:00:00+00", 10000, 490)
    assert _mark(env, "2026-12").status_code == 200
    with env.cursor() as cur:
        cur.execute("select id from camp_registrations where organization_id=%s", (env.org,))
        cur.execute("insert into registration_refund_events (organization_id, registration_id, refunded_delta_cents, "
                    "fee_delta_cents, source, created_at) select %s, id, 100, 5, 'stripe', '2026-12-20 10:00:00+00' "
                    "from camp_registrations where organization_id=%s and fee_collection='platform_collected'",
                    (env.org, env.org))
    assert _payouts(env, "2026-12").json()["changed_since_paid"] is True


def test_mark_paid_only_for_finished_months(env, ledger, monkeypatch):
    _paid_row(env, env.org, ledger.camp, "2027-02-03 10:00:00+00", 10000, 490)
    r = _mark(env, "2027-02")
    assert r.status_code == 409 and "noch nicht abgeschlossen" in r.json()["detail"]
    monkeypatch.setattr(payments, "_berlin_month_now", lambda: "2027-03")
    assert _mark(env, "2027-02").status_code == 200


def test_mark_paid_refuses_months_with_nothing_to_transfer(env, ledger):
    assert _mark(env, "2026-12").status_code == 409
    _paid_row(env, env.org, ledger.camp, "2026-12-15 10:00:00+00", 5000, 245,
              refunds=[("2027-01-10 10:00:00+00", 5000, 245)])
    assert _mark(env, "2027-01").status_code == 409  # negative: carried over
    assert _mark(env, "2026-12", reference="").status_code == 422


def test_club_admin_cannot_refund_a_payment_of_a_paid_out_month_owner_can(env, ledger):
    token, _ = _paid_platform(env)
    month = datetime.now(__import__("zoneinfo").ZoneInfo("Europe/Berlin")).strftime("%Y-%m")
    monkey_open = _refund(env, token)  # month not paid out yet: club admin may refund
    assert monkey_open.status_code == 200, monkey_open.text
    with env.cursor() as cur:
        cur.execute("insert into organization_payouts (organization_id, month, payout_cents, paid_at, reference) "
                    "values (%s, %s, 1, '2027-02-01', 'x')", (env.org, f"{month}-01"))
    r = _refund(env, token)
    assert r.status_code == 409 and "Bitte wende dich an CampsPilot" in r.json()["detail"]
    assert len(env.fake.named("Refund.create")) == 1
    assert _refund(env, token, headers=owner_headers()).status_code == 200


def test_payouts_table_is_backend_only(env):
    """RLS on, no policy; the fixture grants everything after the migrations, so the
    revoke is checked in the migration text, and idempotence by running it again."""
    from pathlib import Path
    migration = (Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261110130000_platform_payments.sql")
    text = migration.read_text(encoding="utf-8")
    assert "alter table public.organization_payouts enable row level security;" in text
    assert "revoke all on public.organization_payouts from public, anon, authenticated;" in text
    with env.cursor() as cur:
        cur.execute("select relrowsecurity from pg_class where oid='public.organization_payouts'::regclass")
        assert cur.fetchone()["relrowsecurity"] is True
        cur.execute("select count(*) as n from pg_policies where tablename='organization_payouts'")
        assert cur.fetchone()["n"] == 0
        cur.execute(text)  # idempotent re-run
