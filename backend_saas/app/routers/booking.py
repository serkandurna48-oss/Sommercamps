"""Public "Meine Buchung" (self service by registration token).

GET  /api/v1/organizations/{slug}/registrations/{token}
POST /api/v1/organizations/{slug}/registrations/{token}/cancellation-request

The registration token is the only credential, like the checkout endpoint. The status
response therefore contains booking facts only: camp or training name, period, the child's
first name, status, payment status, amount, the cancellation request and whether an invoice
exists. Never health data, parent contact data or addresses. An unknown token, a token of
another organization and an anonymized booking are all the same 404.

A cancellation request only records the wish (cancellation_requested_at) and tells the
club; the club cancels itself. No names, e-mail addresses or tokens are logged.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from pydantic import BaseModel

from .. import db
from ..deps import get_tenant_context
from ..notifications.sending import send_cancellation_request_notification
from ..ratelimit import SlidingWindowLimiter, trusted_client_ip
from ..repositories import platform_roles
from ..tenancy import TenantContext

logger = logging.getLogger(__name__)

# Per IP and per token, like the checkout limiter. Reading is cheap, so the limit is higher.
booking_limiter = SlidingWindowLimiter(60, 3600.0)
cancellation_limiter = SlidingWindowLimiter(20, 3600.0)

_NOT_FOUND = "Anmeldung nicht gefunden"
_CANCELLED = "Diese Anmeldung ist bereits storniert."

router = APIRouter(prefix="/api/v1/organizations/{organization_slug}/registrations", tags=["Meine Buchung"])


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


class CancellationRequestResult(BaseModel):
    cancellation_requested_at: datetime


def _limit(limiter: SlidingWindowLimiter, token: UUID, request: Request) -> None:
    client_ip = trusted_client_ip(request)
    keys = [f"token:{token}"] + ([f"ip:{client_ip}"] if client_ip else [])
    if not all(limiter.allow(key) for key in keys):
        raise HTTPException(429, "Zu viele Anfragen. Bitte versuchen Sie es später erneut.")


_STATUS_SQL = """
    select c.title as camp_title, c.start_date, c.end_date, c.starts_at, r.child_first_name,
           r.status, r.payment_status, r.cancellation_requested_at, c.currency,
           coalesce(r.applied_price_cents, r.booked_price_cents, c.price_cents) as amount_cents,
           exists (select 1 from invoices i
                   where i.organization_id = r.organization_id and i.registration_id = r.id
                         and i.kind = 'invoice') as invoice_available
    from camp_registrations r
    join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    where r.registration_token = %s and r.organization_id = %s and r.anonymized_at is null
"""


@router.get("/{registration_token}", response_model=BookingStatus)
def get_booking(
    registration_token: UUID,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
) -> BookingStatus:
    _limit(booking_limiter, registration_token, request)
    with db.get_read_cursor() as cur:
        cur.execute(_STATUS_SQL, (registration_token, tenant.organization_id))
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, _NOT_FOUND)
    # 'confirmed' is a booked place like 'registered' for parents.
    row["status"] = "registered" if row["status"] == "confirmed" else row["status"]
    return BookingStatus.model_validate(row)


@router.post("/{registration_token}/cancellation-request", response_model=CancellationRequestResult)
def request_cancellation(
    registration_token: UUID,
    background_tasks: BackgroundTasks,
    request: Request,
    tenant: TenantContext = Depends(get_tenant_context),
) -> CancellationRequestResult:
    _limit(cancellation_limiter, registration_token, request)
    first_time = False
    with db.get_cursor() as cur:
        cur.execute(
            """select id, status, cancellation_requested_at from camp_registrations
               where registration_token = %s and organization_id = %s and anonymized_at is null
               for update""",
            (registration_token, tenant.organization_id),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(404, _NOT_FOUND)
        if row["status"] == "cancelled":
            raise HTTPException(409, _CANCELLED)
        requested_at = row["cancellation_requested_at"]
        if requested_at is None:
            cur.execute(
                "update camp_registrations set cancellation_requested_at = now() where id = %s "
                "returning cancellation_requested_at",
                (row["id"],),
            )
            requested_at = cur.fetchone()["cancellation_requested_at"]
            first_time = True
    if first_time:
        platform_roles.write_audit_log(
            actor_user_id=None,
            actor_email=None,
            action="registration.cancellation_requested",
            organization_id=str(tenant.organization_id),
            target_type="registration",
            target_id=str(row["id"]),
        )
        logger.info("Cancellation requested (organization_slug=%s)", tenant.slug)
        background_tasks.add_task(send_cancellation_request_notification, registration_token, tenant.organization_id)
    return CancellationRequestResult(cancellation_requested_at=requested_at)
