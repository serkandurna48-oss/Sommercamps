"""Stripe Connect v1.1: payment safety and signature handling (no external calls)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from app.routers import payments
from app.config import get_settings
import stripe


def test_off_by_default(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: MagicMock(
        stripe_checkout_enabled=False, stripe_secret_key=None
    ))
    with pytest.raises(HTTPException) as err:
        payments._stripe_client()
    assert err.value.status_code == 503


def test_wrong_mode_refused_in_staging(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: MagicMock(
        stripe_checkout_enabled=True, stripe_secret_key="sk_live_fake", stripe_webhook_secret="whsec_test", app_env="staging"
    ))
    with pytest.raises(HTTPException) as err:
        payments._stripe_client()
    assert err.value.status_code == 503


def test_wrong_mode_refused_in_production(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: MagicMock(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_fake", stripe_webhook_secret="whsec_test", app_env="production"
    ))
    with pytest.raises(HTTPException) as err:
        payments._stripe_client()
    assert err.value.status_code == 503


def test_stripe_account_id_validator():
    assert payments.ACCOUNT_ID.fullmatch("acct_123456789abcdefgh")
    assert not payments.ACCOUNT_ID.fullmatch("acct_other/../../")


from contextlib import contextmanager
from types import SimpleNamespace


class _CheckoutSession:
    @staticmethod
    def create(**kwargs):
        _CheckoutSession.args = kwargs
        return {"id": "cs_test_1234567890", "url": "https://checkout.stripe.com/test"}

    @staticmethod
    def retrieve(_session_id, **kwargs):
        return {"status": "open", "url": "https://checkout.stripe.com/existing"}


class _Cursor:
    def __init__(self, row):
        self.row = row
        self.executed = []

    def execute(self, query, args):
        self.executed.append((query, args))

    def fetchone(self):
        return self.row


def test_direct_charge_checkout_uses_club_account_and_database_amount(monkeypatch):
    from uuid import uuid4
    token = uuid4()
    org = uuid4()
    booking = {
        "id": uuid4(), "status": "registered", "payment_status": "open",
        "stripe_checkout_session_id": None,
        "stripe_account_id": "acct_1234567890123456",
        "stripe_charges_enabled": True, "online_payment_enabled": True,
        "title": "Feriencamp", "price_cents": 14900, "currency": "EUR",
        "camp_status": "published",
    }
    cursor = _Cursor(booking)

    @contextmanager
    def fake_cursor():
        yield cursor

    client = MagicMock()
    client.checkout.Session = _CheckoutSession
    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        frontend_base_url="https://example.com"
    ))
    result = payments.create_checkout("winter", token, SimpleNamespace(
        organization_id=org, slug="club-one"
    ))
    assert result.url == "https://checkout.stripe.com/test"
    args = _CheckoutSession.args
    assert args["stripe_account"] == booking["stripe_account_id"]
    assert args["line_items"][0]["price_data"]["unit_amount"] == 14900
    assert "application_fee_amount" not in args
    assert "child" not in str(args).lower()
    assert "parent" not in str(args).lower()
    assert cursor.executed[0][1] == (token, org, "winter")


def test_waitlisted_registration_cannot_checkout(monkeypatch):
    from uuid import uuid4
    booking = {
        "id": uuid4(), "status": "waitlist", "payment_status": "open",
        "stripe_checkout_session_id": None,
        "stripe_account_id": "acct_1234567890123456",
        "stripe_charges_enabled": True, "online_payment_enabled": True,
        "title": "Feriencamp", "price_cents": 14900, "currency": "EUR",
        "camp_status": "published",
    }
    cursor = _Cursor(booking)

    @contextmanager
    def fake_cursor():
        yield cursor

    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    monkeypatch.setattr(payments, "_stripe_client", lambda: MagicMock())
    with pytest.raises(HTTPException) as exc:
        payments.create_checkout("winter", uuid4(), SimpleNamespace(
            organization_id=uuid4(), slug="club-one"
        ))
    assert exc.value.status_code == 409
    assert len(cursor.executed) == 1


def test_unsigned_webhook_rejected_before_database_access(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=True, stripe_webhook_secret="whsec_test"
    ))
    client = MagicMock()
    client.Webhook.construct_event.side_effect = stripe.error.SignatureVerificationError("bad", "sig")
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    called = []
    monkeypatch.setattr(payments.db, "get_cursor", lambda: called.append(True))
    class FakeRequest:
        async def body(self):
            return b'{"type":"checkout.session.completed"}'
    with pytest.raises(HTTPException) as exc:
        import asyncio
        asyncio.run(payments.stripe_connect_webhook(FakeRequest(), "invalid"))
    assert exc.value.status_code == 400
    assert not called


def test_signed_webhook_credits_only_verified_amount_and_account(monkeypatch):
    """Real Stripe signature verification, mocked DB; no external payment."""
    import asyncio
    import hashlib
    import hmac
    import json
    import time
    from uuid import uuid4

    secret = "whsec_test_signing_secret"
    account_id = "acct_1234567890123456"
    payment_intent = "pi_12345678901234567890"
    session_id = "cs_test_12345678901234567890"

    event = {
        "id": "evt_1234567890",
        "type": "checkout.session.completed",
        "livemode": False,
        "account": account_id,
        "data": {"object": {
            "id": session_id, "object": "checkout.session",
            "payment_status": "paid", "amount_total": 14900,
            "currency": "eur", "payment_intent": payment_intent,
            "metadata": {"campspilot": "1"},
        }},
    }
    body = json.dumps(event, separators=(",", ":")).encode()
    timestamp = int(time.time())
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    header = f"t={timestamp},v1={digest}"

    class FakeRequest:
        async def body(self):
            return body

    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        app_env="staging", stripe_checkout_enabled=True, stripe_webhook_secret=secret,
    ))
    monkeypatch.setattr(payments, "_stripe_client", lambda: stripe)
    monkeypatch.setattr(payments, "_fully_refunded", lambda *_: False)
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, token, reason: flagged.append(reason))
    cursor = _Cursor({
        "id": uuid4(), "organization_id": uuid4(), "registration_token": uuid4(),
        "status": "registered", "payment_status": "open",
        "stripe_checkout_amount_cents": 14900, "stripe_checkout_currency": "eur",
    })
    @contextmanager
    def fake_cursor():
        yield cursor

    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    assert asyncio.run(payments.stripe_connect_webhook(FakeRequest(), header)) == {
        "received": True, "settled": True,
    }
    assert cursor.executed[0][1] == (session_id, account_id, account_id)
    assert cursor.executed[1][1][:2] == ("paid", payment_intent)

    # Replaying an already-settled event must not update the registration.
    cursor.executed.clear()
    cursor.row["payment_status"] = "paid"
    cursor.row["stripe_payment_intent_id"] = payment_intent
    assert asyncio.run(payments.stripe_connect_webhook(FakeRequest(), header))["settled"]
    assert len(cursor.executed) == 1

    # A signed but mismatched amount is never accepted. 200 (a retry cannot
    # fix it), flagged for a human instead of an endless Stripe retry loop.
    cursor.executed.clear()
    cursor.row["payment_status"] = "open"
    cursor.row["stripe_checkout_amount_cents"] = 15000
    assert asyncio.run(payments.stripe_connect_webhook(FakeRequest(), header)) == {
        "received": True, "settled": False,
    }
    assert len(cursor.executed) == 1
    assert flagged == ["amount_mismatch"]


def test_checkout_disabled_without_signed_webhook_configuration(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_example",
        stripe_webhook_secret=None, app_env="staging",
    ))
    with pytest.raises(HTTPException) as error:
        payments._stripe_client()
    assert error.value.status_code == 503


def test_completed_session_without_confirmed_payment_cannot_be_replaced(monkeypatch):
    from uuid import uuid4
    booking = {
        "id": uuid4(), "status": "registered", "payment_status": "open",
        "stripe_checkout_session_id": "cs_test_1234567890",
        "stripe_account_id": "acct_1234567890123456",
        "stripe_charges_enabled": True, "online_payment_enabled": True,
        "title": "Feriencamp", "price_cents": 14900, "currency": "EUR",
        "camp_status": "published",
    }
    cursor = _Cursor(booking)

    @contextmanager
    def fake_cursor():
        yield cursor

    client = MagicMock()
    client.checkout.Session.retrieve.return_value = {
        "status": "complete", "payment_status": "unpaid",
    }
    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    with pytest.raises(HTTPException) as error:
        payments.create_checkout("winter", uuid4(), SimpleNamespace(
            organization_id=uuid4(), slug="club-one",
        ))
    assert error.value.status_code == 409
    client.checkout.Session.create.assert_not_called()


# ---------------------------------------------------------------------------
# Review 30.10.2026 (B1, S1-S5)
# ---------------------------------------------------------------------------
import asyncio
import hashlib
import hmac
import json
import time
from uuid import uuid4

SECRET = "whsec_test_signing_secret"
ACCOUNT = "acct_1234567890123456"


def _signed(event):
    body = json.dumps(event, separators=(",", ":")).encode()
    ts = int(time.time())
    digest = hmac.new(SECRET.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()

    class FakeRequest:
        async def body(self):
            return body
    return FakeRequest(), f"t={ts},v1={digest}"


def _completed(metadata=None, intent="pi_12345678901234567890"):
    obj = {"id": "cs_test_12345678901234567890", "object": "checkout.session",
           "payment_status": "paid", "amount_total": 14900, "currency": "eur",
           "payment_intent": intent}
    if metadata is not None:
        obj["metadata"] = metadata
    return {"id": "evt_1", "type": "checkout.session.completed", "livemode": False,
            "account": ACCOUNT, "data": {"object": obj}}


@pytest.fixture
def webhook_env(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        app_env="staging", stripe_checkout_enabled=True, stripe_webhook_secret=SECRET,
    ))
    monkeypatch.setattr(payments, "_stripe_client", lambda: stripe)
    flagged = []
    monkeypatch.setattr(payments, "_flag_for_review", lambda org, token, reason: flagged.append(reason))
    cursor = _Cursor({
        "id": uuid4(), "organization_id": uuid4(), "registration_token": uuid4(),
        "status": "registered", "payment_status": "open", "stripe_payment_intent_id": None,
        "stripe_checkout_amount_cents": 14900, "stripe_checkout_currency": "eur",
    })

    @contextmanager
    def fake_cursor():
        yield cursor
    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    return SimpleNamespace(cursor=cursor, flagged=flagged, monkeypatch=monkeypatch)


def test_b1_foreign_checkout_on_club_account_is_ignored_without_retry(webhook_env):
    """The club's own shop/fee payments on the connected account: 200, no DB."""
    for metadata in (None, {}, {"campspilot": "0"}, {"shop": "1"}):
        request, header = _signed(_completed(metadata))
        assert asyncio.run(payments.stripe_connect_webhook(request, header)) == {"received": True, "ignored": True}
    assert webhook_env.cursor.executed == []


def test_b1_marked_but_unknown_session_is_retried(webhook_env):
    webhook_env.monkeypatch.setattr(payments, "_fully_refunded", lambda *_: False)
    webhook_env.cursor.row = None
    request, header = _signed(_completed({"campspilot": "1"}))
    with pytest.raises(HTTPException) as error:
        asyncio.run(payments.stripe_connect_webhook(request, header))
    assert error.value.status_code == 503


def test_s1_refund_before_settlement_ends_refunded_not_paid(webhook_env):
    """charge.refunded arrives first (no row yet) and is acknowledged; the late
    completed event reads the refund from Stripe and books 'refunded'."""
    refund = {"id": "evt_2", "type": "charge.refunded", "livemode": False, "account": ACCOUNT,
              "data": {"object": {"payment_intent": "pi_12345678901234567890", "refunded": True,
                                  "amount_refunded": 14900, "amount": 14900}}}
    request, header = _signed(refund)
    assert asyncio.run(payments.stripe_connect_webhook(request, header)) == {"received": True}
    webhook_env.cursor.executed.clear()
    webhook_env.monkeypatch.setattr(payments, "_fully_refunded", lambda *_: True)
    request, header = _signed(_completed({"campspilot": "1"}))
    assert asyncio.run(payments.stripe_connect_webhook(request, header))["settled"] is True
    update = webhook_env.cursor.executed[1]
    assert update[1][0] == "refunded"


def test_s1_refund_state_read_from_stripe(monkeypatch):
    client = MagicMock()
    client.PaymentIntent.retrieve.return_value = {"latest_charge": {"refunded": True, "amount_refunded": 100, "amount": 100}}
    assert payments._fully_refunded(client, "pi_1", ACCOUNT) is True
    client.PaymentIntent.retrieve.return_value = {"latest_charge": {"refunded": False, "amount_refunded": 50, "amount": 100}}
    assert payments._fully_refunded(client, "pi_1", ACCOUNT) is False
    client.PaymentIntent.retrieve.side_effect = stripe.error.APIConnectionError("down")
    with pytest.raises(HTTPException) as error:
        payments._fully_refunded(client, "pi_1", ACCOUNT)
    assert error.value.status_code == 503


@pytest.mark.parametrize("change,reason", [
    ({"status": "cancelled"}, "payment_for_closed_registration"),
    ({"payment_status": "waived"}, "payment_for_closed_registration"),
    ({"payment_status": "paid", "stripe_payment_intent_id": "pi_other"}, "duplicate_payment"),
])
def test_s3_money_for_settled_registration_is_flagged_not_booked(webhook_env, change, reason):
    webhook_env.monkeypatch.setattr(payments, "_fully_refunded", lambda *_: False)
    webhook_env.cursor.row.update(change)
    request, header = _signed(_completed({"campspilot": "1"}))
    assert asyncio.run(payments.stripe_connect_webhook(request, header)) == {"received": True, "settled": False}
    assert len(webhook_env.cursor.executed) == 1
    assert webhook_env.flagged == [reason]


def test_s3_expire_open_checkout_after_manual_settlement(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x", stripe_webhook_secret=SECRET,
    ))
    cursor = _Cursor({"stripe_checkout_session_id": "cs_test_1", "stripe_checkout_account_id": ACCOUNT,
                      "payment_status": "paid", "status": "confirmed"})

    @contextmanager
    def fake_cursor():
        yield cursor
    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    client = MagicMock()
    client.checkout.Session.retrieve.return_value = {"status": "open"}
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    payments.expire_open_checkout(uuid4(), uuid4())
    client.checkout.Session.expire.assert_called_once_with("cs_test_1", stripe_account=ACCOUNT)

    # Still payable: keep the session.
    client.reset_mock()
    cursor.row.update(payment_status="open", status="registered")
    payments.expire_open_checkout(uuid4(), uuid4())
    client.checkout.Session.expire.assert_not_called()

    # Stripe down: never raises into the admin request.
    cursor.row.update(payment_status="waived")
    client.checkout.Session.retrieve.side_effect = stripe.error.APIConnectionError("down")
    payments.expire_open_checkout(uuid4(), uuid4())


def test_s4_stripe_client_uses_short_timeout(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x", stripe_webhook_secret=SECRET, app_env="staging",
    ))
    client = payments._stripe_client()
    assert client.default_http_client._timeout == payments.STRIPE_TIMEOUT_SECONDS
    assert client.max_network_retries == 1


def test_s5_checkout_rate_limited_per_registration(monkeypatch):
    payments.checkout_limiter.reset()
    monkeypatch.setattr(payments, "_stripe_client", lambda: (_ for _ in ()).throw(HTTPException(503, "off")))
    token = uuid4()
    codes = []
    for _ in range(payments.checkout_limiter.max_hits + 1):
        with pytest.raises(HTTPException) as error:
            payments.create_checkout("winter", token, SimpleNamespace(organization_id=uuid4(), slug="club"))
        codes.append(error.value.status_code)
    assert codes[-1] == 429 and set(codes[:-1]) == {503}
    payments.checkout_limiter.reset()


def test_checkout_marks_session_and_payment_intent_as_campspilot(monkeypatch):
    payments.checkout_limiter.reset()
    booking = {
        "id": uuid4(), "status": "registered", "payment_status": "open",
        "stripe_checkout_session_id": None, "stripe_account_id": ACCOUNT,
        "stripe_charges_enabled": True, "online_payment_enabled": True,
        "title": "Feriencamp", "price_cents": 14900, "currency": "EUR", "camp_status": "published",
    }
    cursor = _Cursor(booking)

    @contextmanager
    def fake_cursor():
        yield cursor
    client = MagicMock()
    client.checkout.Session = _CheckoutSession
    monkeypatch.setattr(payments.db, "get_cursor", fake_cursor)
    monkeypatch.setattr(payments, "_stripe_client", lambda: client)
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(frontend_base_url="https://example.com"))
    payments.create_checkout("winter", uuid4(), SimpleNamespace(organization_id=uuid4(), slug="club"))
    assert _CheckoutSession.args["metadata"]["campspilot"] == "1"
    assert _CheckoutSession.args["payment_intent_data"]["metadata"]["campspilot"] == "1"
