"""
Club invoice master data (org admin + platform owner) and the platform fee
model (platform owner only). No personal data of parents or children here;
audit entries name changed fields, never their values.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from .. import db
from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_org_access, require_platform_owner
from ..billing_schemas import (
    BillingProfileIn, BillingProfileOut, FeeBookingOut, FeeMonthOut, FeeRuleIn, FeeRuleOut, FeeRulesOut, FeeTotals,
)
from .. import fees
from ..repositories import platform_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["Billing"])

_PROFILE_FIELDS = (
    "legal_name", "street", "postal_code", "city", "tax_number", "vat_id", "tax_status",
    "default_vat_rate", "tax_exemption_text", "invoice_number_prefix", "invoice_email",
)


def get_billing_profile(organization_id) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(
            f"select {', '.join(_PROFILE_FIELDS)}, updated_at from organization_billing_profiles "
            "where organization_id = %s",
            (organization_id,),
        )
        return cur.fetchone()


@router.get("/organizations/{organization_slug}/billing-profile", response_model=Optional[BillingProfileOut])
def read_billing_profile(
    organization_slug: str, auth: AuthContext = Depends(require_org_access)
) -> Optional[BillingProfileOut]:
    del auth
    organization = require_organization(organization_slug)
    row = get_billing_profile(organization["id"])
    return BillingProfileOut.model_validate(row) if row else None


@router.put("/organizations/{organization_slug}/billing-profile", response_model=BillingProfileOut)
def save_billing_profile(
    organization_slug: str, data: BillingProfileIn, auth: AuthContext = Depends(require_org_access)
) -> BillingProfileOut:
    organization = require_organization(organization_slug)
    values = [getattr(data, field) for field in _PROFILE_FIELDS]
    values[_PROFILE_FIELDS.index("invoice_email")] = str(data.invoice_email)
    before = get_billing_profile(organization["id"])
    with db.get_cursor() as cur:
        cur.execute(
            f"""insert into organization_billing_profiles
                    (organization_id, {', '.join(_PROFILE_FIELDS)}, updated_by)
                values (%s, {', '.join(['%s'] * len(_PROFILE_FIELDS))}, %s)
                on conflict (organization_id) do update set
                    {', '.join(f'{f} = excluded.{f}' for f in _PROFILE_FIELDS)},
                    updated_by = excluded.updated_by, updated_at = now()
                returning {', '.join(_PROFILE_FIELDS)}, updated_at""",
            (organization["id"], *values, auth.user_id),
        )
        row = cur.fetchone()
    changed = [f for f in _PROFILE_FIELDS if not before or before.get(f) != row.get(f)]
    logger.info("Billing profile saved (organization_slug=%s)", organization_slug)
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email,
        action="organization.billing_profile_saved",
        organization_id=str(organization["id"]), target_type="organization", target_id=organization_slug,
        metadata={"changed_fields": changed, "created": before is None},
    )
    return BillingProfileOut.model_validate(row)


def _rule_out(rule: fees.FeeRule) -> FeeRuleOut:
    return FeeRuleOut(
        id=rule.id, plan=rule.plan, percent=rule.percent, fixed_cents=rule.fixed_cents,
        min_fee_cents=rule.min_fee_cents, valid_from=rule.valid_from,
    )


def _fee_rules(organization_id) -> FeeRulesOut:
    with db.get_cursor() as cur:
        cur.execute(
            """select id, plan, percent, fixed_cents, min_fee_cents, valid_from, note,
                      created_at, created_by_email
               from organization_fee_rules where organization_id = %s
               order by valid_from desc, created_at desc, id desc limit 200""",
            (organization_id,),
        )
        history = [FeeRuleOut.model_validate(row) for row in cur.fetchall()]
        current = fees.effective_fee(organization_id, datetime.now(timezone.utc), cur=cur)
    current_out = next((h for h in history if h.id == current.id), None) or _rule_out(current)
    return FeeRulesOut(current=current_out, history=history)


@router.get("/platform/organizations/{organization_slug}/fee-rules", response_model=FeeRulesOut)
def list_fee_rules(
    organization_slug: str, auth: AuthContext = Depends(require_platform_owner)
) -> FeeRulesOut:
    del auth
    organization = require_organization(organization_slug)
    return _fee_rules(organization["id"])


@router.post("/platform/organizations/{organization_slug}/fee-rules", response_model=FeeRulesOut, status_code=201)
def add_fee_rule(
    organization_slug: str, data: FeeRuleIn, auth: AuthContext = Depends(require_platform_owner)
) -> FeeRulesOut:
    """Append a rule. Past bookings keep their snapshot; a rule with a past
    valid_from only affects bookings that are paid from now on."""
    organization = require_organization(organization_slug)
    percent = fees.plan_percent(data.plan, data.percent)
    with db.get_cursor() as cur:
        cur.execute(
            """insert into organization_fee_rules
                   (organization_id, plan, percent, fixed_cents, min_fee_cents, valid_from, note,
                    created_by, created_by_email)
               values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               returning id""",
            (organization["id"], data.plan, percent, data.fixed_cents, data.min_fee_cents,
             data.valid_from, data.note, auth.user_id, auth.email),
        )
        rule_id = cur.fetchone()["id"]
    logger.info("Fee rule added (organization_slug=%s, plan=%s)", organization_slug, data.plan)
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email,
        action="organization.fee_rule_added",
        organization_id=str(organization["id"]), target_type="fee_rule", target_id=str(rule_id),
        metadata={
            "plan": data.plan, "percent": str(percent), "fixed_cents": data.fixed_cents,
            "min_fee_cents": data.min_fee_cents, "valid_from": data.valid_from.isoformat(),
        },
    )
    return _fee_rules(organization["id"])



@router.get("/platform/organizations/{organization_slug}/fees", response_model=FeeMonthOut)
def fee_month(
    organization_slug: str,
    month: str = Query(pattern=r"^20[0-9]{2}-(0[1-9]|1[0-2])$"),
    auth: AuthContext = Depends(require_platform_owner),
) -> FeeMonthOut:
    """Per-booking platform fees of one month, net of refunds."""
    del auth
    organization = require_organization(organization_slug)
    with db.get_cursor() as cur:
        cur.execute(
            """select r.id as registration_id, c.title as camp_title, r.fee_snapshot_at as paid_at,
                      r.payment_status, r.fee_collection, r.fee_base_cents, r.fee_cents,
                      coalesce(r.refunded_cents, 0) as refunded_cents,
                      coalesce(r.fee_refunded_cents, 0) as fee_refunded_cents,
                      r.fee_cents - coalesce(r.fee_refunded_cents, 0) as fee_net_cents
               from camp_registrations r
               join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
               where r.organization_id = %s and r.fee_snapshot_at is not null
                 and to_char(r.fee_snapshot_at at time zone 'Europe/Berlin', 'YYYY-MM') = %s
               order by r.fee_snapshot_at, r.id""",
            (organization["id"], month),
        )
        rows = [FeeBookingOut.model_validate(row) for row in cur.fetchall()]
    totals = {"application_fee": FeeTotals(), "not_collected": FeeTotals()}
    for row in rows:
        t = totals[row.fee_collection]
        t.bookings += 1
        t.fee_cents += row.fee_cents
        t.fee_refunded_cents += row.fee_refunded_cents
        t.fee_net_cents += row.fee_net_cents
    return FeeMonthOut(month=month, collected=totals["application_fee"],
                       not_collected=totals["not_collected"], bookings=rows)
