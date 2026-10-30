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
        stripe_checkout_enabled=True, stripe_secret_key="sk_live_fake", app_env="staging"
    ))
    with pytest.raises(HTTPException) as err:
        payments._stripe_client()
    assert err.value.status_code == 503


def test_wrong_mode_refused_in_production(monkeypatch):
    monkeypatch.setattr(payments, "get_settings", lambda: MagicMock(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_fake", app_env="production"
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


@pytest.mark.asyncio
async def test_unsigned_webhook_rejected_before_database_access(monkeypatch):
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
        await payments.stripe_connect_webhook(FakeRequest(), "invalid")
    assert exc.value.status_code == 400
    assert not called
