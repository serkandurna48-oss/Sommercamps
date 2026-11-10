"""Ahmads Preismodell: die Paketgebühr enthält die Zahlungsgebühren. Bei Direct
Charges (Managed Risk) zieht Stripe seine Gebühr beim Verein ab; die
Plattformgebühr wird deshalb um die geschätzte Stripe-Gebühr gekürzt."""

from decimal import Decimal

import pytest

from app import fees
from app.config import Settings

STARTER = fees.FeeRule(None, "starter", Decimal("6.90"), None, None, None)
VEREIN = fees.FeeRule(None, "verein", Decimal("4.90"), None, None, None)


@pytest.mark.parametrize("amount,expected", [(15000, 250), (1000, 40), (0, 0), (50, 26)])
def test_payment_fee_estimate_default_is_eea_card_price(amount, expected):
    assert fees.payment_fee_estimate_cents(amount, Decimal("1.5"), 25) == expected


@pytest.mark.parametrize("rule,amount,platform,payment", [
    (STARTER, 15000, 785, 250),  # 6,9 % = 1035 ct gesamt, davon 250 Stripe
    (VEREIN, 15000, 485, 250),   # 4,9 % = 735 ct gesamt
    (STARTER, 300, 0, 30),       # 21 ct Gebühr < 30 ct Stripe: nichts für die Plattform
])
def test_net_quote_keeps_club_total_at_plan_percent(rule, amount, platform, payment):
    quote = fees.net_of_payment_fee(fees.fee_quote(rule, amount), amount, Decimal("1.5"), 25)
    assert quote["fee_cents"] == platform
    assert quote["payment_fee_cents"] == payment
    assert quote["gross_fee_cents"] == fees.compute_fee_cents(rule, amount)
    # EWR-Standardkarte: Plattformgebühr + Stripe-Gebühr = Paketgebühr, solange sie die Stripe-Gebühr deckt.
    if quote["gross_fee_cents"] >= payment:
        assert quote["fee_cents"] + quote["payment_fee_cents"] == quote["gross_fee_cents"]


def test_zero_quote_stays_zero():
    rule = fees.FeeRule(None, "individuell", Decimal("0"), None, None, None)
    quote = fees.net_of_payment_fee(fees.fee_quote(rule, 15000), 15000, Decimal("1.5"), 25)
    assert quote["fee_cents"] == 0


def test_settings_defaults_and_overrides(monkeypatch):
    s = Settings()
    assert (s.stripe_fee_percent, s.stripe_fee_fixed_cents) == (Decimal("1.5"), 25)
    monkeypatch.setenv("STRIPE_FEE_PERCENT", "1.9")
    monkeypatch.setenv("STRIPE_FEE_FIXED_CENTS", "30")
    s = Settings()
    assert (s.stripe_fee_percent, s.stripe_fee_fixed_cents) == (Decimal("1.9"), 30)


@pytest.mark.parametrize("bad", ["-1", "101"])
def test_settings_reject_invalid_percent(monkeypatch, bad):
    monkeypatch.setenv("STRIPE_FEE_PERCENT", bad)
    with pytest.raises(Exception):
        Settings()
