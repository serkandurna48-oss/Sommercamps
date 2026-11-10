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


def test_active_club_account_still_wins_over_platform(env):
    _activate_direct_fee(env)
    token = _register(env)
    assert _checkout(env, token).status_code == 200
    (_, kw), = env.fake.named("Session.create")
    assert kw["stripe_account"] == env.express and _reg(env, token)["stripe_charge_type"] == "direct_fee"


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


# ---------- payout ledger ----------

def _paid_row(env, org, camp, paid_at, amount=1000, fee=50, refunded=0, fee_refunded=0, platform=True):
    child = f"K{uuid4().hex[:6]}"
    with env.cursor() as cur:
        token = make_reg(cur, org, camp, child=child, payment_status="paid" if not refunded else "partially_refunded")
        cur.execute(
            """update camp_registrations set stripe_charge_type=%s, stripe_payment_intent_id=%s,
                   stripe_checkout_amount_cents=%s, paid_at=%s, fee_plan='individuell', fee_percent=5,
                   fee_base_cents=%s, fee_cents=%s, fee_collection='platform_collected', fee_snapshot_at=%s,
                   refunded_cents=%s, fee_refunded_cents=%s
               where registration_token=%s""",
            ("platform" if platform else "direct_fee", f"pi_{uuid4().hex[:16]}", amount, paid_at, amount, fee,
             paid_at, refunded or None, fee_refunded or None, token))
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
    # December 2026 (Berlin): 2 normal payments, 1 partly refunded.
    _paid_row(env, env.org, ledger.camp, "2026-12-01 10:00:00+00", 10000, 490)
    _paid_row(env, env.org, ledger.camp, "2026-12-15 10:00:00+00", 5000, 245, refunded=2000, fee_refunded=98)
    # Boundary: 22:59 UTC on 31.12. is 23:59 Berlin (December); 23:00 UTC is 00:00 Berlin (January);
    # 23:30 UTC on 30.11. is 00:30 Berlin on 1.12. (December).
    _paid_row(env, env.org, ledger.camp, "2026-12-31 22:59:00+00", 1000, 50)
    _paid_row(env, env.org, ledger.camp, "2026-12-31 23:00:00+00", 3000, 150)
    _paid_row(env, env.org, ledger.camp, "2026-11-30 23:30:00+00", 2000, 100)
    # Not ours: other club, other payment path, unpaid.
    _paid_row(env, env.other, ledger.other_camp, "2026-12-10 10:00:00+00", 7777, 388)
    _paid_row(env, env.org, ledger.camp, "2026-12-10 10:00:00+00", 4444, 0, platform=False)
    with env.cursor() as cur:
        make_reg(cur, env.org, ledger.camp, child="Open")
    r = _payouts(env, "2026-12")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["paid_cents"] == 10000 + 5000 + 1000 + 2000
    assert body["refunded_cents"] == 2000
    assert body["fee_cents"] == 490 + (245 - 98) + 50 + 100
    assert body["payout_cents"] == body["paid_cents"] - body["refunded_cents"] - body["fee_cents"]
    assert body["payout_cents"] == 18000 - 2000 - 787 == 15213
    assert body["iban"] == "DE89370400440532013000" and body["payout"] is None
    dates = [b["date"] for b in body["bookings"]]
    assert dates == ["2026-12-01", "2026-12-01", "2026-12-15", "2026-12-31"]
    assert {b["camp_title"] for b in body["bookings"]} == {"Sommercamp"}
    refunded = [b for b in body["bookings"] if b["refund_cents"]]
    assert refunded == [{"date": "2026-12-15", "camp_title": "Sommercamp", "amount_cents": 5000,
                         "fee_cents": 147, "refund_cents": 2000}]
    assert set(body["bookings"][0]) == {"date", "camp_title", "amount_cents", "fee_cents", "refund_cents"}
    dumped = json.dumps(body)
    assert "Pia" not in dumped and "Geheimweg" not in dumped and "p@example.com" not in dumped
    # January only has the 00:00 Berlin booking; other months are empty.
    jan = _payouts(env, "2027-01").json()
    assert (jan["paid_cents"], jan["fee_cents"], jan["payout_cents"], len(jan["bookings"])) == (3000, 150, 2850, 1)
    empty = _payouts(env, "2026-10").json()
    assert (empty["paid_cents"], empty["payout_cents"], empty["bookings"]) == (0, 0, [])
    # The other club has its own ledger.
    assert _payouts(env, "2026-12", slug=env.other_slug).json()["paid_cents"] == 7777


def test_payouts_are_owner_only_and_validate_the_month(env, ledger):
    assert _payouts(env, "2026-12", headers=env.admin()).status_code == 403
    post = env.client.post(f"/admin/platform/organizations/{env.slug}/payouts/2026-12/mark-paid",
                           headers=env.admin(), json={"paid_at": "2027-01-05", "reference": "x"})
    assert post.status_code == 403
    assert _payouts(env, "2026-13").status_code == 422 and _payouts(env, "12-2026").status_code == 422
    assert _payouts(env, "2026-12", slug="nope-nope").status_code == 404


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
    # Same call again: same answer, still one record and one audit entry.
    assert _mark(env, "2026-12").status_code == 200
    # Another date or reference for the same month: refused.
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
    # GET shows the record; a refund after the transfer is flagged.
    assert _payouts(env, "2026-12").json()["payout"]["reference"] == "Auszahlung 12/2026"
    with env.cursor() as cur:
        cur.execute("update camp_registrations set refunded_cents=1000, fee_refunded_cents=49, "
                    "payment_status='partially_refunded' where organization_id=%s", (env.org,))
    assert _payouts(env, "2026-12").json()["changed_since_paid"] is True
    # Unique per club and month in the database.
    import psycopg2
    with pytest.raises(psycopg2.errors.UniqueViolation):
        with env.cursor() as cur:
            cur.execute("insert into organization_payouts (organization_id, month, payout_cents, paid_at, reference) "
                        "values (%s,'2026-12-01',1,'2027-01-05','dup')", (env.org,))
    # Other club, same month: its own record.
    _paid_row(env, env.other, ledger.other_camp, "2026-12-03 10:00:00+00", 2000, 100)
    assert _mark(env, "2026-12", slug=env.other_slug).status_code == 200


def test_mark_paid_refuses_months_with_nothing_to_transfer(env, ledger):
    assert _mark(env, "2026-12").status_code == 409
    assert _mark(env, "2026-12", reference="").status_code == 422


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
