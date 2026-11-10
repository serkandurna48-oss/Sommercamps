"""
Platform fee model (migration 20261106140000_billing_profile_fee_rules.sql).

Plans: starter 6.9 % (0 EUR/month, 1 active camp), verein 4.9 % (24.90 EUR/month),
individuell (percent and base fee set per club). Every
rule may add a fixed amount per booking and a minimum fee per booking. Rules
are append-only rows with `valid_from`; the active rule for a booking is the
one with the latest `valid_from` on or before the booking date (Europe/Berlin),
ties broken by the newest row. No row at all means the default starter plan.

The fee is computed on the amount the parent pays (applied_price_cents, or the
camp price for classic camp bookings) and never exceeds it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from . import db

Plan = Literal["starter", "verein", "individuell"]
PLAN_PERCENT: dict[str, Decimal] = {"starter": Decimal("6.90"), "verein": Decimal("4.90")}
# Monthly base fee in cents (excl. VAT); a rule's NULL monthly_fee_cents means this default.
PLAN_MONTHLY_CENTS: dict[str, int] = {"starter": 0, "verein": 2490, "individuell": 0}
DEFAULT_PLAN: Plan = "starter"
BERLIN = ZoneInfo("Europe/Berlin")


@dataclass(frozen=True)
class FeeRule:
    id: Optional[UUID]
    plan: str
    percent: Decimal
    fixed_cents: Optional[int]
    min_fee_cents: Optional[int]
    valid_from: Optional[date]
    monthly_fee_cents: Optional[int] = None  # None = plan default


def monthly_fee_for(rule: FeeRule) -> int:
    """Monthly base fee in cents: the rule's own value, else the plan default."""
    if rule.monthly_fee_cents is not None:
        return rule.monthly_fee_cents
    return PLAN_MONTHLY_CENTS.get(rule.plan, 0)


DEFAULT_RULE = FeeRule(None, DEFAULT_PLAN, PLAN_PERCENT[DEFAULT_PLAN], None, None, None)


def booking_date(at: date | datetime) -> date:
    """Calendar day of a booking in Germany (a booking at 00:30 local time on
    the 1st belongs to the 1st, even though it is still the 31st in UTC)."""
    if isinstance(at, datetime):
        if at.tzinfo is None:
            raise ValueError("naive datetime")
        return at.astimezone(BERLIN).date()
    return at


def _rule_from_row(row: dict) -> FeeRule:
    return FeeRule(
        id=row["id"], plan=row["plan"], percent=Decimal(row["percent"]),
        fixed_cents=row.get("fixed_cents"), min_fee_cents=row.get("min_fee_cents"),
        valid_from=row.get("valid_from"), monthly_fee_cents=row.get("monthly_fee_cents"),
    )


_EFFECTIVE_RULE = """
    select id, plan, percent, fixed_cents, min_fee_cents, valid_from, monthly_fee_cents
    from organization_fee_rules
    where organization_id = %s and valid_from <= %s
    order by valid_from desc, created_at desc, id desc
    limit 1
"""


def effective_fee(organization_id, at: date | datetime, cur=None) -> FeeRule:
    """The fee rule active for `organization_id` on the booking date of `at`."""
    day = booking_date(at)
    if cur is not None:
        cur.execute(_EFFECTIVE_RULE, (organization_id, day))
        row = cur.fetchone()
    else:
        with db.get_cursor() as own:
            own.execute(_EFFECTIVE_RULE, (organization_id, day))
            row = own.fetchone()
    return _rule_from_row(row) if row else DEFAULT_RULE


def compute_fee_cents(rule: FeeRule, base_cents: int) -> int:
    """percent of base (half-up to whole cents) + fixed, at least the minimum,
    never more than the base itself (Stripe rejects a larger application fee)."""
    if base_cents <= 0:
        return 0
    fee = (Decimal(base_cents) * rule.percent / Decimal(100)).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    fee = int(fee) + (rule.fixed_cents or 0)
    if rule.min_fee_cents is not None:
        fee = max(fee, rule.min_fee_cents)
    return max(0, min(fee, base_cents))


def fee_quote(rule: FeeRule, base_cents: int) -> dict[str, Any]:
    """JSON-safe snapshot of a rule applied to an amount (stored with the
    checkout session and copied to the registration when it is paid)."""
    return {
        "rule_id": str(rule.id) if rule.id else None,
        "plan": rule.plan,
        "percent": str(rule.percent),
        "fixed_cents": rule.fixed_cents,
        "min_fee_cents": rule.min_fee_cents,
        "base_cents": base_cents,
        "fee_cents": compute_fee_cents(rule, base_cents),
    }


_WRITE_SNAPSHOT = """
    update camp_registrations
    set fee_rule_id = %s, fee_plan = %s, fee_percent = %s, fee_fixed_cents = %s,
        fee_min_cents = %s, fee_base_cents = %s, fee_cents = %s, fee_collection = %s,
        fee_snapshot_at = now()
    where id = %s and organization_id = %s and fee_snapshot_at is null
"""


def write_snapshot(cur, registration_id, organization_id, quote: dict, collection: str) -> None:
    """Freeze the fee on a paid registration. First snapshot wins: a booking
    that is set to paid again keeps the fee it was first paid with."""
    if collection not in ("application_fee", "not_collected", "platform_collected"):
        raise ValueError("collection")
    cur.execute(_WRITE_SNAPSHOT, (
        quote["rule_id"], quote["plan"], Decimal(quote["percent"]), quote["fixed_cents"],
        quote["min_fee_cents"], quote["base_cents"], quote["fee_cents"], collection,
        registration_id, organization_id,
    ))


def snapshot_paid_registration(cur, registration_id, organization_id) -> None:
    """Snapshot for a registration paid without an application fee (transfer,
    cash, legacy direct charge): rule at booking time, amount actually owed
    (training price, else the camp price at booking time)."""
    cur.execute(
        """select r.created_at,
                  coalesce(r.applied_price_cents, r.booked_price_cents, c.price_cents) as base_cents,
                  r.fee_snapshot_at
           from camp_registrations r
           join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
           where r.id = %s and r.organization_id = %s""",
        (registration_id, organization_id),
    )
    row = cur.fetchone()
    if not row or row["fee_snapshot_at"] is not None:
        return
    rule = effective_fee(organization_id, row["created_at"], cur=cur)
    write_snapshot(cur, registration_id, organization_id, fee_quote(rule, int(row["base_cents"] or 0)), "not_collected")


def payment_fee_estimate_cents(amount_cents: int, percent: Decimal, fixed_cents: int) -> int:
    """Estimated Stripe processing fee for one card payment (percent half-up to
    whole cents + fixed). Default 1.5 % + 25 ct = standard EEA card price."""
    if amount_cents <= 0:
        return 0
    variable = (Decimal(amount_cents) * Decimal(percent) / Decimal(100)).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(variable) + int(fixed_cents)


def net_of_payment_fee(quote: dict[str, Any], amount_cents: int, percent: Decimal, fixed_cents: int) -> dict[str, Any]:
    """Ahmad's pricing: the plan percent INCLUDES the payment fees. With direct
    charges (Managed Risk) Stripe takes its fee from the club's account, so the
    platform withholds only plan fee minus the estimated Stripe fee (never < 0).
    For standard EEA cards the club then pays the plan percent in total. Stripe's
    real fee can be higher (premium/non-EEA cards) and is kept by Stripe on
    refunds; that difference is borne by the club (the application fee is fixed
    at checkout). A minimum fee (min_fee_cents) is reduced as well."""
    gross = int(quote["fee_cents"])
    payment = payment_fee_estimate_cents(amount_cents, percent, fixed_cents)
    return {**quote, "gross_fee_cents": gross, "payment_fee_cents": payment, "fee_cents": max(0, gross - payment)}


def plan_percent(plan: str, percent: Optional[Decimal]) -> Decimal:
    """Resolve the stored percent: starter/verein default unless overridden;
    individuell always needs an explicit percent."""
    if percent is not None:
        return percent
    if plan in PLAN_PERCENT:
        return PLAN_PERCENT[plan]
    raise ValueError("percent required for individuell")
