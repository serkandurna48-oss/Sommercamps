"""Public "Meine Buchung" (self service by registration token).

GET  /api/v1/organizations/{slug}/registrations/{token}
POST /api/v1/organizations/{slug}/registrations/{token}/cancel

The registration token is the only credential, like the checkout endpoint. The status
response therefore contains booking facts only: camp or training name, period, the child's
first name, status, payment status, amount, whether parents may cancel themselves and whether
an invoice exists. Never health data, parent contact data or addresses. An unknown token, a
token of another organization and an anonymized booking are all the same 404.

Parents cancel themselves only when the booking was paid online through CampsPilot's Stripe
checkout and the camp starts at least SELF_CANCEL_DAYS days later (Europe/Berlin date). The
whole remaining amount is refunded (platform fee too, like the admin refund) FIRST; only when
Stripe accepted it, the registration is cancelled through the same code path as the club's
cancel (waitlist promotion, status mails, storno invoice). A failed refund cancels nothing.
Waitlist entries (nothing paid) can leave the waitlist without a refund. Everything else is
the club's job. No names, e-mail addresses or tokens are logged.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Literal, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from pydantic import BaseModel

from .. import db, invoices
from ..deps import get_tenant_context
from ..notifications import sending as notifications_sending
from ..ratelimit import SlidingWindowLimiter, trusted_client_ip
from ..registration_lifecycle import InvalidStatusTransitionError
from ..repositories import platform_roles
from ..repositories import registrations as registrations_repo
from ..repositories.registrations import RegistrationNotFoundError
from ..tenancy import TenantContext
from . import payments

logger = logging.getLogger(__name__)

# Parents may cancel themselves up to this many days before the camp starts (the one place for the rule).
SELF_CANCEL_DAYS = 14
_BERLIN = ZoneInfo("Europe/Berlin")
_NOTHING_PAID = ("open", "cancelled", "waived")

# Per IP and per token, like the checkout limiter. Reading is cheap, so the limit is higher.
booking_limiter = SlidingWindowLimiter(60, 3600.0)
cancellation_limiter = SlidingWindowLimiter(20, 3600.0)

_NOT_FOUND = "Anmeldung nicht gefunden"
_NOT_PAID_ONLINE = (
    "Bei Überweisung oder Barzahlung storniert der Verein Ihre Anmeldung. Bitte wenden Sie sich an den Verein."
)
_PAYMENT_PENDING = (
    "Die Zahlung ist noch nicht abgeschlossen. Zum Stornieren wenden Sie sich bitte an den Verein."
)
_REFUND_FAILED = (
    "Die Erstattung hat gerade nicht geklappt. Ihre Anmeldung wurde nicht storniert. "
    "Bitte versuchen Sie es später erneut oder wenden Sie sich an den Verein."
)
_CANCEL_INCOMPLETE = (
    "Ihre Erstattung läuft, die Stornierung konnte aber nicht abgeschlossen werden. "
    "Der Verein wurde informiert und meldet sich bei Ihnen."
)

router = APIRouter(prefix="/api/v1/organizations/{organization_slug}/registrations", tags=["Meine Buchung"])


def berlin_today(now: Optional[datetime] = None) -> date:
    """Today's date in Europe/Berlin (the club's calendar), not UTC."""
    return (now or datetime.now(_BERLIN)).astimezone(_BERLIN).date()


class SelfCancel(BaseModel):
    possible: bool
    reason: Literal["ok", "not_paid_online", "payment_pending", "deadline_passed", "already_cancelled", "waitlist"]
    deadline: Optional[date] = None
    refund_cents: Optional[int] = None
    days: int = SELF_CANCEL_DAYS


class BookingStatus(BaseModel):
    camp_title: str
    start_date: date
    end_date: date
    starts_at: Optional[datetime] = None
    child_first_name: str
    status: Literal["registered", "waitlist", "cancelled"]
    payment_status: str
    amount_cents: int
    currency: str
    cancellation_requested_at: Optional[datetime] = None
    invoice_available: bool
    self_cancel: SelfCancel


def _limit(limiter: SlidingWindowLimiter, token: UUID, request: Request) -> None:
    client_ip = trusted_client_ip(request)
    keys = [f"token:{token}"] + ([f"ip:{client_ip}"] if client_ip else [])
    if not all(limiter.allow(key) for key in keys):
        raise HTTPException(429, "Zu viele Anfragen. Bitte versuchen Sie es später erneut.")


_STATUS_SQL = """
    select r.id, r.camp_id, c.title as camp_title, c.start_date, c.end_date, c.starts_at,
           r.child_first_name, r.status, r.payment_status, r.cancellation_requested_at, c.currency,
           coalesce(r.applied_price_cents, r.booked_price_cents, c.price_cents) as amount_cents,
           r.stripe_charge_type, r.stripe_payment_intent_id, r.stripe_checkout_account_id,
           r.stripe_checkout_amount_cents, r.refunded_cents, r.payment_method, r.stripe_checkout_session_id,
           r.parent_cancel_started_at,
           exists (select 1 from invoices i
                   where i.organization_id = r.organization_id and i.registration_id = r.id
                         and i.kind = 'invoice') as invoice_available
    from camp_registrations r
    join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    where r.registration_token = %s and r.organization_id = %s and r.anonymized_at is null
"""


def _self_cancel(row: dict, today: date) -> SelfCancel:
    """Whether parents may cancel themselves, and why not. Paid online = fully paid through
    CampsPilot's Stripe checkout (a partly refunded booking is the club's to handle)."""
    if row["status"] == "cancelled":
        return SelfCancel(possible=False, reason="already_cancelled")
    if row["status"] == "waitlist":
        # Leaving the waitlist is only free of money questions when nothing was paid.
        if row["payment_status"] in _NOTHING_PAID:
            return SelfCancel(possible=True, reason="waitlist")
        return SelfCancel(possible=False, reason="not_paid_online")
    if row["payment_status"] == "open" and (row.get("payment_method") == "online" or row.get("stripe_checkout_session_id")):
        return SelfCancel(possible=False, reason="payment_pending")
    if row["payment_status"] != "paid" or not payments.is_fee_mode_payment(row):
        return SelfCancel(possible=False, reason="not_paid_online")
    deadline = row["start_date"] - timedelta(days=SELF_CANCEL_DAYS)
    if today > deadline:
        return SelfCancel(possible=False, reason="deadline_passed", deadline=deadline)
    refund = (row["stripe_checkout_amount_cents"] or 0) - (row["refunded_cents"] or 0)
    if refund <= 0:
        return SelfCancel(possible=False, reason="not_paid_online")
    return SelfCancel(possible=True, reason="ok", deadline=deadline, refund_cents=refund)


def _load(registration_token: UUID, tenant: TenantContext) -> dict:
    with db.get_read_cursor() as cur:
        cur.execute(_STATUS_SQL, (registration_token, tenant.organization_id))
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, _NOT_FOUND)
    return row


def _to_status(row: dict) -> BookingStatus:
    # 'confirmed' is a booked place like 'registered' for parents.
    status = "registered" if row["status"] == "confirmed" else row["status"]
    return BookingStatus.model_validate({**row, "status": status, "self_cancel": _self_cancel(row, berlin_today())})


@router.get("/{registration_token}", response_model=BookingStatus)
def get_booking(
    registration_token: UUID,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
) -> BookingStatus:
    _limit(booking_limiter, registration_token, request)
    return _to_status(_load(registration_token, tenant))


def _refund_already_made(row: dict, amount: int) -> Optional[int]:
    """Resume of an interrupted self-cancel (parent_cancel_started_at set, still booked):
    cents already refunded, or None when no refund exists yet. The webhook-booked payment
    status is the first witness, Stripe itself the second (the webhook can be late)."""
    if row["payment_status"] in ("refunded", "partially_refunded"):
        return row["refunded_cents"] or amount
    if row["payment_status"] == "paid":
        try:
            found = payments.existing_refund_cents(row)
        except Exception:  # noqa: BLE001 - fall back to the idempotent create
            return None
        return found if found >= amount else None
    return None


@router.post("/{registration_token}/cancel", response_model=BookingStatus)
def cancel_booking(
    registration_token: UUID,
    background_tasks: BackgroundTasks,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
) -> BookingStatus:
    _limit(cancellation_limiter, registration_token, request)
    row = _load(registration_token, tenant)
    if row["status"] == "cancelled":
        return _to_status(row)  # idempotent: no second refund, no second mail
    started = row["parent_cancel_started_at"] is not None
    resumed_refund: Optional[int] = None
    if started and row["payment_status"] in ("refunded", "partially_refunded") and payments.is_fee_mode_payment(row):
        # The refund of an interrupted attempt is booked: only the cancel is missing.
        resumed_refund = row["refunded_cents"] or 0
    else:
        check = _self_cancel(row, berlin_today())
        if not check.possible:
            if check.reason == "deadline_passed":
                raise HTTPException(409, (
                    f"Eine Stornierung ist bis {SELF_CANCEL_DAYS} Tage vor Campbeginn "
                    f"(bis zum {check.deadline.strftime('%d.%m.%Y')}) möglich. Bitte wenden Sie sich an den Verein."))
            raise HTTPException(409, _PAYMENT_PENDING if check.reason == "payment_pending" else _NOT_PAID_ONLINE)
        refund_cents = check.refund_cents or 0
        if refund_cents > 0:
            if not started:
                # Intent first, in our own database: if anything breaks after the refund, a retry
                # knows that the money may already be on its way back.
                with db.get_cursor() as cur:
                    cur.execute(
                        "update camp_registrations set parent_cancel_started_at = now() "
                        "where id = %s and organization_id = %s and parent_cancel_started_at is null",
                        (row["id"], tenant.organization_id),
                    )
            else:
                resumed_refund = _refund_already_made(row, refund_cents)
            if resumed_refund is None:
                try:
                    # Same refund code as the club's refund; the key makes a retry the same refund.
                    payments.create_online_refund(tenant.organization_id, tenant.slug, row, refund_cents, "parent-cancel")
                except Exception as exc:  # noqa: BLE001 - nothing is cancelled unless Stripe accepted the refund
                    logger.warning("Parent self-cancel refund failed (organization_slug=%s, error_type=%s)",
                                   tenant.slug, type(exc).__name__)
                    raise HTTPException(502, _REFUND_FAILED) from None
                resumed_refund = refund_cents
    refund_cents = resumed_refund or 0

    # From here on money may have moved: whatever goes wrong must not look like "nothing happened".
    try:
        result = registrations_repo.cancel_registration_and_promote_next(
            tenant, row["camp_id"], registration_token, mark_parent_cancelled=True)
    except InvalidStatusTransitionError:
        return _to_status(_load(registration_token, tenant))  # cancelled meanwhile (double click)
    except Exception as exc:  # noqa: BLE001
        logger.error("Parent self-cancel incomplete after refund (organization_slug=%s, error_type=%s)",
                     tenant.slug, type(exc).__name__)
        if refund_cents > 0:
            _report_incomplete(tenant, row, registration_token)
            raise HTTPException(502, _CANCEL_INCOMPLETE) from None
        if isinstance(exc, RegistrationNotFoundError):
            raise HTTPException(404, _NOT_FOUND) from None
        raise

    promoted = result["promoted"]
    # The cancel is committed: side effects are always scheduled, a failing audit entry cannot stop them.
    try:
        platform_roles.write_audit_log(
            actor_user_id=None,
            actor_email=None,
            action="registration.cancelled_by_parent",
            organization_id=str(tenant.organization_id),
            target_type="registration",
            target_id=str(row["id"]),
            metadata={"refund_cents": refund_cents, "promoted": promoted is not None},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Audit entry for parent cancel failed (error_type=%s)", type(exc).__name__)
    logger.info("Registration cancelled by parent (organization_slug=%s, refund=%s, promoted=%s)",
                tenant.slug, refund_cents > 0, promoted is not None)
    # Same side effects as the club's cancel (storno invoice, next in line), with the parents'
    # own confirmation mail instead of the club-cancel mail.
    background_tasks.add_task(
        notifications_sending.send_parent_self_cancel_confirmation, registration_token, tenant.organization_id, refund_cents)
    background_tasks.add_task(payments.expire_open_checkout, tenant.organization_id, registration_token)
    background_tasks.add_task(invoices.sync_by_token, registration_token, tenant.organization_id)
    if promoted is not None:
        background_tasks.add_task(
            notifications_sending.send_status_change_notification,
            promoted["registration_token"], tenant.organization_id, "promoted")
    background_tasks.add_task(
        notifications_sending.send_parent_cancelled_notification,
        registration_token, tenant.organization_id, refund_cents, promoted is not None)
    return _to_status(_load(registration_token, tenant))


def _report_incomplete(tenant: TenantContext, row: dict, registration_token: UUID) -> None:
    """Refund done, cancel failed: make it findable and tell the club. Never raises."""
    try:
        payments._flag_for_review(tenant.organization_id, row["id"], "parent_cancel_incomplete")
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not flag incomplete parent cancel (error_type=%s)", type(exc).__name__)
    notifications_sending.send_parent_cancel_incomplete_notification(registration_token, tenant.organization_id)
