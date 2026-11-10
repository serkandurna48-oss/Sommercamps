"""Parent self-cancel in "Meine Buchung": POST .../registrations/{token}/cancel.

Stripe is a recording fake (pattern of test_billing_managed_risk.py); real local
Postgres, FakeProvider for mail, synthetic data only.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
import stripe
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.routers import booking, payments
from .selfservice_helpers import make_camp, make_other_org, make_reg
from .test_review_postgres import local_database, real_db  # noqa: F401

ACCOUNT = "acct_1ABCDEFGH12345"
START = date(2027, 7, 5)


class FakeStripe:
    def __init__(self):
        self.calls = []
        self.refund_error = None
        self.refund_status = "succeeded"
        self.listed = []  # refunds Stripe already holds for the payment intent
        self.list_error = None
        outer = self

        class Refund:
            @staticmethod
            def create(**kw):
                outer.calls.append(kw)
                if outer.refund_error:
                    raise outer.refund_error
                return {"id": "re_test_1", "status": outer.refund_status, "amount": kw["amount"]}

            @staticmethod
            def list(**kw):
                outer.lists = getattr(outer, "lists", []) + [kw]
                if outer.list_error:
                    raise outer.list_error
                return {"data": list(outer.listed)}

        self.Refund = Refund


@pytest.fixture
def env(real_db, monkeypatch):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    fake = FakeStripe()
    settings = SimpleNamespace(stripe_checkout_enabled=True, stripe_secret_key="sk_test_x",
                               stripe_webhook_secret="whsec_x", stripe_platform_webhook_secret="whsec_p")
    monkeypatch.setattr(payments, "get_settings", lambda: settings)
    monkeypatch.setattr(payments, "_stripe_client", lambda: fake)
    today = {"value": date(2027, 6, 1)}
    monkeypatch.setattr(booking, "berlin_today", lambda now=None: today["value"])
    booking.booking_limiter.reset()
    booking.cancellation_limiter.reset()
    with cursor() as cur:
        cur.execute("delete from camp_registrations")
        cur.execute("delete from audit_log where action like 'registration.cancel%' or action = 'stripe.payment_needs_review'")
        cur.execute("delete from organization_members where organization_id = %s", (org,))
        other, other_slug = make_other_org(cur)
        camp_id = make_camp(cur, org, date(2027, 7, 9), start=START, title="Sommercamp")
    mail = FakeProvider()
    mail.delivers = True
    reset_provider_for_testing(mail)
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, cursor=cursor, org=org, slug=tenant.slug, camp=camp_id, other=other,
                              other_slug=other_slug, mail=mail, stripe=fake, today=today)
    reset_provider_for_testing(None)
    booking.booking_limiter.reset()
    booking.cancellation_limiter.reset()


def _url(env, token, slug=None, suffix=""):
    return f"/api/v1/organizations/{slug or env.slug}/registrations/{token}{suffix}"


def _cancel(env, token, slug=None):
    return env.client.post(_url(env, token, slug, "/cancel"))


def _new(env, paid_online=True, camp=None, online_method=False, **kw):
    if paid_online:
        kw.setdefault("payment_status", "paid")
    with env.cursor() as cur:
        token = make_reg(cur, env.org, camp or env.camp, **kw)
        if paid_online:
            cur.execute(
                """update camp_registrations set payment_method='online', stripe_charge_type='direct_fee',
                       stripe_payment_intent_id=%s, stripe_checkout_account_id=%s, stripe_checkout_amount_cents=1000
                   where registration_token=%s""",
                (f"pi_{uuid4().hex[:16]}", ACCOUNT, token),
            )
        elif online_method:
            cur.execute("update camp_registrations set payment_method='online' where registration_token=%s", (token,))
    return token


def _row(env, token):
    with env.cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()


def _audit(env):
    with env.cursor() as cur:
        cur.execute("select * from audit_log where action='registration.cancelled_by_parent'")
        return cur.fetchall()


# ---------- GET self_cancel ----------

def _sc(env, token):
    r = env.client.get(_url(env, token))
    assert r.status_code == 200, r.text
    return r.json()["self_cancel"]


def test_status_self_cancel_ok(env):
    token = _new(env)
    assert _sc(env, token) == {"possible": True, "reason": "ok", "deadline": "2027-06-21", "refund_cents": 1000,
                               "days": 14}


def test_status_self_cancel_refund_is_remaining_amount(env):
    token = _new(env)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set refunded_cents=300 where registration_token=%s", (token,))
    # partially refunded already: club handles it
    with env.cursor() as cur:
        cur.execute("update camp_registrations set payment_status='partially_refunded' where registration_token=%s", (token,))
    sc = _sc(env, token)
    assert sc["possible"] is False and sc["reason"] == "not_paid_online" and sc["refund_cents"] is None


@pytest.mark.parametrize("payment_status", ["open", "waived"])
def test_status_self_cancel_unpaid(env, payment_status):
    token = _new(env, paid_online=False, payment_status=payment_status)
    sc = _sc(env, token)
    assert sc["possible"] is False and sc["reason"] == "not_paid_online" and sc["refund_cents"] is None


def test_status_self_cancel_paid_by_transfer(env):
    token = _new(env, paid_online=False, payment_status="paid")
    assert _sc(env, token)["reason"] == "not_paid_online"


def test_status_self_cancel_deadline_passed_keeps_deadline(env):
    token = _new(env)
    env.today["value"] = date(2027, 6, 22)
    sc = _sc(env, token)
    assert sc == {"possible": False, "reason": "deadline_passed", "deadline": "2027-06-21", "refund_cents": None,
                  "days": 14}


def test_status_self_cancel_waitlist_and_cancelled(env):
    wl = _new(env, paid_online=False, status="waitlist")
    assert _sc(env, wl) == {"possible": True, "reason": "waitlist", "deadline": None, "refund_cents": None, "days": 14}
    gone = _new(env, status="cancelled")
    sc = _sc(env, gone)
    assert sc["possible"] is False and sc["reason"] == "already_cancelled"


def test_berlin_today_uses_berlin_date_not_utc():
    # 22:30 UTC on 21 June is already 22 June in Berlin (summer time).
    assert booking.berlin_today(datetime(2027, 6, 21, 22, 30, tzinfo=timezone.utc)) == date(2027, 6, 22)
    assert booking.berlin_today(datetime(2027, 6, 21, 21, 30, tzinfo=timezone.utc)) == date(2027, 6, 21)
    assert booking.SELF_CANCEL_DAYS == 14


# ---------- POST cancel ----------

def _admin_recipient(env):
    with env.cursor() as cur:
        a = uuid4()
        cur.execute("insert into auth.users(id) values (%s)", (a,))
        cur.execute("insert into organization_members (organization_id,user_id,role,notification_channel,"
                    "notification_email,notification_events) values (%s,%s,'org_admin','email','admin1@example.com',"
                    "'{cancellation}')", (env.org, a))


def test_success_refunds_cancels_promotes_mails_and_audits(env):
    _admin_recipient(env)
    with env.cursor() as cur:
        cur.execute("update camps set capacity=1 where id=%s", (env.camp,))
    token = _new(env)
    waiting = _new(env, paid_online=False, status="waitlist", email="wait@example.com", child="Wal")
    row = _row(env, token)
    r = _cancel(env, token)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled" and r.json()["self_cancel"]["reason"] == "already_cancelled"
    (call,) = env.stripe.calls
    assert call["payment_intent"] == row["stripe_payment_intent_id"] and call["amount"] == 1000
    assert call["stripe_account"] == ACCOUNT and call["refund_application_fee"] is True
    assert call["idempotency_key"].startswith(f"campspilot-refund-{row['id']}-1000-")
    after = _row(env, token)
    assert after["status"] == "cancelled"
    assert after["cancellation_requested_at"] is None  # legacy column, not touched any more
    assert after["parent_cancel_started_at"] is not None and after["parent_cancelled_at"] is not None
    assert _row(env, waiting)["status"] == "registered"  # promoted
    by_to = {m.to_email: m for m in env.mail.sent}
    parent_mail = by_to["p@example.com"]
    parent_plain = parent_mail.html_content.replace("<strong>", "").replace("</strong>", "")
    assert "Sie haben die Anmeldung für Sommercamp storniert." in parent_plain
    assert "10,00 € werden auf Ihr Zahlungsmittel erstattet (je nach Bank einige Werktage)." in parent_plain
    assert "wurde storniert" not in parent_plain  # not the club-cancel mail
    assert set(by_to) == {"p@example.com", "wait@example.com", "admin1@example.com"}
    admin_mail = by_to["admin1@example.com"]
    plain = admin_mail.html_content.replace("<strong>", "").replace("</strong>", "")
    assert "Eltern haben die Anmeldung für Sommercamp storniert. Die Zahlung von 10,00 € wurde über Stripe erstattet." in plain
    assert "automatisch nachgerückt" in plain
    blob = (admin_mail.subject + admin_mail.html_content).lower()
    for word in ("kim", "pia", "parent", "p@example.com", "asthma", "geheimweg", str(token)):
        assert word.lower() not in blob
    (audit,) = _audit(env)
    assert audit["organization_id"] == env.org and audit["actor_user_id"] is None and audit["actor_email"] is None
    assert audit["target_id"] == str(row["id"])
    dumped = json.dumps(audit, default=str)
    assert str(token) not in dumped and "p@example.com" not in dumped and "Kim" not in dumped
    assert audit["metadata"] == {"refund_cents": 1000, "promoted": True}


@pytest.mark.parametrize("today,allowed", [(date(2027, 6, 21), True), (date(2027, 6, 22), False)])
def test_deadline_14_vs_13_days_before_start(env, today, allowed):
    env.today["value"] = today
    token = _new(env)
    r = _cancel(env, token)
    if allowed:
        assert r.status_code == 200 and len(env.stripe.calls) == 1
        assert _row(env, token)["status"] == "cancelled"
    else:
        assert r.status_code == 409 and "14 Tage" in r.json()["detail"] and "21.06.2027" in r.json()["detail"]
        assert env.stripe.calls == [] and _row(env, token)["status"] == "registered"


@pytest.mark.parametrize("kind", ["transfer", "open"])
def test_not_paid_online_is_409_without_refund(env, kind):
    token = _new(env, paid_online=False, payment_status="paid" if kind == "transfer" else "open")
    r = _cancel(env, token)
    assert r.status_code == 409 and "Verein" in r.json()["detail"]
    assert env.stripe.calls == [] and _row(env, token)["status"] == "registered"
    assert _row(env, token)["parent_cancel_started_at"] is None and _row(env, token)["parent_cancelled_at"] is None
    assert env.mail.sent == [] and _audit(env) == []


def test_stripe_error_is_502_and_booking_stays(env):
    token = _new(env)
    env.stripe.refund_error = stripe.error.APIConnectionError("down")
    r = _cancel(env, token)
    assert r.status_code == 502 and "Verein" in r.json()["detail"] and "nicht storniert" in r.json()["detail"]
    after = _row(env, token)
    assert after["status"] == "registered" and after["parent_cancelled_at"] is None
    assert env.mail.sent == [] and _audit(env) == []
    assert "Bitte versuchen Sie es später erneut oder wenden Sie sich an den Verein." in r.json()["detail"]
    # Stripe rejects (invalid request): same outcome.
    env.stripe.refund_error = stripe.error.InvalidRequestError("nope", "amount", code="charge_already_refunded")
    assert _cancel(env, token).status_code == 502
    assert _row(env, token)["status"] == "registered"


def test_second_call_is_idempotent_without_second_refund(env):
    token = _new(env)
    assert _cancel(env, token).status_code == 200
    mails = len(env.mail.sent)
    again = _cancel(env, token)
    assert again.status_code == 200 and again.json()["status"] == "cancelled"
    assert len(env.stripe.calls) == 1 and len(env.mail.sent) == mails and len(_audit(env)) == 1


def test_cancelled_by_club_before_is_200_no_refund(env):
    token = _new(env, status="cancelled")
    r = _cancel(env, token)
    assert r.status_code == 200 and r.json()["status"] == "cancelled" and env.stripe.calls == []


def test_unknown_other_org_and_anonymized_are_404(env):
    assert _cancel(env, uuid4()).status_code == 404
    mine = _new(env)
    assert _cancel(env, mine, slug=env.other_slug).status_code == 404
    anon = _new(env, anonymized=True, allergies=None, medical=None)
    assert _cancel(env, anon).status_code == 404
    with env.cursor() as cur:
        camp = make_camp(cur, env.other, date(2027, 7, 9), start=START)
        foreign = make_reg(cur, env.other, camp, payment_status="paid")
    assert _cancel(env, foreign).status_code == 404
    assert env.stripe.calls == [] and _row(env, mine)["status"] == "registered"


def test_waitlist_self_removal_without_refund(env):
    _admin_recipient(env)
    token = _new(env, paid_online=False, status="waitlist")
    env.today["value"] = date(2027, 7, 1)  # deadline does not matter, nothing was paid
    r = _cancel(env, token)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert env.stripe.calls == []
    assert _row(env, token)["parent_cancelled_at"] is not None and _row(env, token)["cancellation_requested_at"] is None
    admin = [m for m in env.mail.sent if m.to_email == "admin1@example.com"]
    assert len(admin) == 1 and "Warteliste" in admin[0].html_content and "Stripe" not in admin[0].html_content
    (audit,) = _audit(env)
    assert audit["metadata"] == {"refund_cents": 0, "promoted": False}


def test_cancel_is_rate_limited(env, monkeypatch):
    monkeypatch.setattr(booking, "cancellation_limiter", booking.SlidingWindowLimiter(2, 3600.0))
    token = _new(env, paid_online=False, payment_status="open")
    codes = [_cancel(env, token).status_code for _ in range(4)]
    assert codes == [409, 409, 429, 429]


def test_old_request_endpoint_is_gone(env):
    token = _new(env)
    assert env.client.post(_url(env, token, suffix="/cancellation-request")).status_code in (404, 405)


# ---------- review findings ----------

def _needs_review(env):
    with env.cursor() as cur:
        cur.execute("select * from audit_log where action='stripe.payment_needs_review'")
        return cur.fetchall()


def test_no_promoted_sentence_without_promotion(env):
    _admin_recipient(env)
    token = _new(env)  # capacity 50, nobody waiting
    assert _cancel(env, token).status_code == 200
    admin = [m for m in env.mail.sent if m.to_email == "admin1@example.com"][0]
    assert "nachgerückt" not in admin.html_content and "Warteliste" not in admin.html_content


@pytest.mark.parametrize("status", ["failed", "canceled"])
def test_refund_with_failed_status_is_502_and_cancels_nothing(env, status):
    token = _new(env)
    env.stripe.refund_status = status
    r = _cancel(env, token)
    assert r.status_code == 502
    assert _row(env, token)["status"] == "registered" and _audit(env) == [] and env.mail.sent == []


@pytest.mark.parametrize("payment_status", ["paid", "partially_refunded", "refunded"])
def test_waitlist_self_removal_only_without_payment(env, payment_status):
    token = _new(env, paid_online=False, status="waitlist", payment_status=payment_status)
    sc = _sc(env, token)
    assert (sc["possible"], sc["reason"]) == (False, "not_paid_online")
    r = _cancel(env, token)
    assert r.status_code == 409 and _row(env, token)["status"] == "waitlist"


@pytest.mark.parametrize("payment_status", ["open", "waived", "cancelled"])
def test_waitlist_self_removal_allowed_when_nothing_paid(env, payment_status):
    token = _new(env, paid_online=False, status="waitlist", payment_status=payment_status)
    assert _sc(env, token)["reason"] == "waitlist"


def test_payment_pending_reason_for_unfinished_online_payment(env):
    token = _new(env, paid_online=False, payment_status="open", online_method=True)
    sc = _sc(env, token)
    assert (sc["possible"], sc["reason"]) == (False, "payment_pending")
    r = _cancel(env, token)
    assert r.status_code == 409 and "Zahlung" in r.json()["detail"]
    assert env.stripe.calls == []
    # open without online payment stays the transfer/cash case
    other = _new(env, paid_online=False, payment_status="open", child="Zed")
    assert _sc(env, other)["reason"] == "not_paid_online"


class _Boom(Exception):
    pass


def _break_cancel(monkeypatch):
    from app.repositories import registrations as repo

    original = repo.cancel_registration_and_promote_next

    def boom(*a, **k):
        raise _Boom("db down")

    monkeypatch.setattr(repo, "cancel_registration_and_promote_next", boom)
    return lambda: monkeypatch.setattr(repo, "cancel_registration_and_promote_next", original)


def test_refunded_but_cancel_failed_is_flagged_and_club_informed(env, monkeypatch):
    _admin_recipient(env)
    token = _new(env)
    _break_cancel(monkeypatch)
    r = _cancel(env, token)
    assert r.status_code == 502
    assert "Erstattung läuft" in r.json()["detail"] and "Verein" in r.json()["detail"]
    assert len(env.stripe.calls) == 1
    row = _row(env, token)
    assert row["status"] == "registered" and row["parent_cancel_started_at"] is not None
    assert row["parent_cancelled_at"] is None
    (flag,) = _needs_review(env)
    assert flag["metadata"]["reason"] == "parent_cancel_incomplete" and flag["target_id"] == str(row["id"])
    club = [m for m in env.mail.sent if m.to_email == "admin1@example.com"]
    assert len(club) == 1 and "storniere" in club[0].html_content and "Sommercamp" in club[0].html_content
    assert "kim" not in (club[0].subject + club[0].html_content).lower()


def test_retry_after_incomplete_cancels_without_second_refund_when_webhook_booked_it(env, monkeypatch):
    token = _new(env)
    restore = _break_cancel(monkeypatch)
    assert _cancel(env, token).status_code == 502
    restore()
    with env.cursor() as cur:  # the refund webhook arrived meanwhile
        cur.execute("update camp_registrations set payment_status='refunded', refunded_cents=1000 where registration_token=%s", (token,))
    r = _cancel(env, token)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert len(env.stripe.calls) == 1  # no new refund
    row = _row(env, token)
    assert row["parent_cancelled_at"] is not None
    (audit,) = _audit(env)
    assert audit["metadata"]["refund_cents"] == 1000


def test_retry_after_incomplete_finds_existing_refund_at_stripe(env, monkeypatch):
    token = _new(env)
    restore = _break_cancel(monkeypatch)
    assert _cancel(env, token).status_code == 502
    restore()
    env.stripe.listed = [{"id": "re_test_1", "status": "succeeded", "amount": 1000}]
    assert _row(env, token)["payment_status"] == "paid"  # webhook still missing
    assert _cancel(env, token).status_code == 200
    assert len(env.stripe.calls) == 1 and len(env.stripe.lists) == 1
    assert _row(env, token)["status"] == "cancelled"


def test_retry_without_any_refund_creates_it_again_idempotently(env, monkeypatch):
    token = _new(env)
    env.stripe.refund_error = stripe.error.APIConnectionError("down")
    assert _cancel(env, token).status_code == 502  # started_at set, nothing refunded
    env.stripe.refund_error = None
    assert _cancel(env, token).status_code == 200
    first, second = env.stripe.calls
    assert first["idempotency_key"] == second["idempotency_key"]


def test_audit_failure_does_not_undo_a_committed_cancel(env, monkeypatch):
    token = _new(env)
    from app.repositories import platform_roles

    def boom(**kw):
        raise _Boom("audit down")

    monkeypatch.setattr(platform_roles, "write_audit_log", boom)
    r = _cancel(env, token)
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert [m.to_email for m in env.mail.sent if m.to_email == "p@example.com"]  # side effects still scheduled


def test_cancel_marker_is_set_in_the_same_transaction_as_the_cancel(env, monkeypatch):
    from app.repositories import registrations as repo
    from app.registration_lifecycle import InvalidStatusTransitionError  # noqa: F401

    token = _new(env)
    tenant = SimpleNamespace(organization_id=env.org, slug=env.slug)
    result = repo.cancel_registration_and_promote_next(tenant, env.camp, token, mark_parent_cancelled=True)
    assert result["cancelled"] is not None
    row = _row(env, token)
    assert row["status"] == "cancelled" and row["parent_cancelled_at"] is not None
    other = _new(env, child="Zed")
    repo.cancel_registration_and_promote_next(tenant, env.camp, other)
    assert _row(env, other)["parent_cancelled_at"] is None  # club cancel does not mark


def test_migration_is_additive_idempotent_and_revokes_select(env):
    from pathlib import Path

    sql = (Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261110120000_parent_self_cancel.sql").read_text(encoding="utf-8")
    assert "revoke select" in sql
    with env.cursor() as cur:
        cur.execute(sql)
        cur.execute(sql)
