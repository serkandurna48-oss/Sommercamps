"""Stripe Connect v1.1: payment safety and signature handling (no external calls)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from unittest.mock import MagicMock
from app.routers import payments
from app.config import get_settings


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
