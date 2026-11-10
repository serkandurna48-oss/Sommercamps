"""
Admin access to parent invoices: list, PDF download, create a pending
invoice, generate a batch of pending invoices and stornos.

Org admin of the club or platform owner. Every query is tenant-scoped.
The public identifier in URLs is registration_token. Mail resend is not
part of this slice: the PDF is stored and downloaded.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from .. import db, invoices
from ..admin_resolve import require_organization
from ..auth_deps import AuthContext, require_org_access
from ..repositories import platform_roles

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/organizations/{organization_slug}", tags=["Invoices"])


class InvoiceOut(BaseModel):
    id: UUID
    number: str
    kind: Literal["invoice", "storno"]
    issue_date: date
    gross_cents: int
    net_cents: int
    vat_cents: int
    recipient_name: str
    description: str
    cancels_number: Optional[str] = None
    registration_token: Optional[UUID] = None
    sent_at: Optional[datetime] = None
    send_error: Optional[str] = None


class PendingInvoiceOut(BaseModel):
    registration_token: UUID
    camp_title: str
    reason: str


class OpenWork(BaseModel):
    invoices: int = 0
    missing_profile: int = 0
    failed: int = 0
    stornos: int = 0
    unsent_mails: int = 0
    total: int = 0


class InvoiceListOut(BaseModel):
    billing_profile_complete: bool
    invoices: list[InvoiceOut]
    pending: list[PendingInvoiceOut]
    open: OpenWork


class RegistrationInvoicesOut(BaseModel):
    invoices: list[InvoiceOut]
    pending_reason: Optional[str] = None
    can_create: bool


class GenerateResult(BaseModel):
    created: int
    stornos: int
    blocked: int
    failed: int
    remaining: int


def _out(row: dict) -> InvoiceOut:
    data = invoices._as_dict(row["data"])
    return InvoiceOut(
        id=row["id"],
        number=row["number"],
        kind=row["kind"],
        issue_date=row["issue_date"],
        gross_cents=row["gross_cents"],
        net_cents=row["net_cents"],
        vat_cents=row["vat_cents"],
        recipient_name=data["recipient"]["name"],
        description=data["item"]["description"],
        cancels_number=(data.get("cancels") or {}).get("number"),
        registration_token=row.get("registration_token"),
        sent_at=row["sent_at"],
        send_error=row["send_error"],
    )


_LIST = """select i.id, i.number, i.kind, i.issue_date, i.gross_cents, i.net_cents, i.vat_cents, i.data,
                  i.sent_at, i.send_error, r.registration_token
           from invoices i
           left join camp_registrations r on r.id = i.registration_id and r.organization_id = i.organization_id
           where i.organization_id = %s"""


def _profile_complete(cur, organization_id) -> bool:
    cur.execute("select 1 from organization_billing_profiles where organization_id = %s", (organization_id,))
    return cur.fetchone() is not None


@router.get("/invoices", response_model=InvoiceListOut)
def list_invoices(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> InvoiceListOut:
    del auth
    organization = require_organization(organization_slug)
    with db.get_cursor() as cur:
        cur.execute(_LIST + " order by i.year desc, i.sequence desc limit 1000", (organization["id"],))
        rows = cur.fetchall()
        cur.execute(
            f"""select r.registration_token, c.title as camp_title,
                       coalesce(r.invoice_pending_reason, 'not_created') as reason
                from camp_registrations r join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
                where {invoices.PENDING_WHERE}
                order by r.created_at limit 500""",
            (organization["id"],),
        )
        pending = cur.fetchall()
        complete = _profile_complete(cur, organization["id"])
        work = invoices.open_work(cur, organization["id"])
    return InvoiceListOut(
        billing_profile_complete=complete,
        invoices=[_out(row) for row in rows],
        pending=[PendingInvoiceOut.model_validate(row) for row in pending],
        open=OpenWork(**work),
    )


def _invoice(organization_id, invoice_id: UUID) -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            "select id, number, kind, organization_id, pdf from invoices where id = %s and organization_id = %s",
            (invoice_id, organization_id),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    return row


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice(organization_slug: str, invoice_id: UUID, auth: AuthContext = Depends(require_org_access)):
    del auth
    organization = require_organization(organization_slug)
    row = _invoice(organization["id"], invoice_id)
    return Response(
        content=bytes(row["pdf"]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{row["number"]}.pdf"',
            "Cache-Control": "no-store",
        },
    )


def _registration(organization_id, registration_token: UUID) -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            """select id, payment_status, invoice_pending_reason, booked_price_cents, status
               from camp_registrations where organization_id = %s and registration_token = %s""",
            (organization_id, registration_token),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Registration not found")
    return row


@router.get("/registrations/{registration_token}/invoices", response_model=RegistrationInvoicesOut)
def registration_invoices(
    organization_slug: str, registration_token: UUID, auth: AuthContext = Depends(require_org_access)
) -> RegistrationInvoicesOut:
    del auth
    organization = require_organization(organization_slug)
    registration = _registration(organization["id"], registration_token)
    with db.get_cursor() as cur:
        cur.execute(
            _LIST + " and i.registration_id = %s order by i.year, i.sequence",
            (organization["id"], registration["id"]),
        )
        rows = cur.fetchall()
    has_invoice = any(row["kind"] == "invoice" for row in rows)
    paid_without_invoice = (
        not has_invoice
        and registration["payment_status"] == "paid"
        and (registration["booked_price_cents"] or 0) > 0
    )
    return RegistrationInvoicesOut(
        invoices=[_out(row) for row in rows],
        pending_reason=(registration["invoice_pending_reason"] or "not_created") if paid_without_invoice else None,
        can_create=paid_without_invoice,
    )


@router.post("/registrations/{registration_token}/invoice", response_model=InvoiceOut, status_code=201)
def create_registration_invoice(
    organization_slug: str, registration_token: UUID, auth: AuthContext = Depends(require_org_access)
) -> InvoiceOut:
    """Create the booking's invoice (for example after the billing master
    data was completed). Returns the existing invoice if there is one."""
    organization = require_organization(organization_slug)
    registration = _registration(organization["id"], registration_token)
    try:
        invoice = invoices.create_invoice(registration["id"], organization["id"], created_by=auth.user_id)
    except invoices.InvoiceBlocked as blocked:
        if blocked.code == "not_found":
            raise HTTPException(status_code=404, detail="Registration not found") from None
        raise HTTPException(status_code=409, detail={"code": blocked.code}) from None
    invoices.create_stornos(registration["id"], organization["id"], created_by=auth.user_id)
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id,
        actor_email=auth.email,
        action="invoice.created_by_admin",
        organization_id=str(organization["id"]),
        target_type="invoice",
        target_id=str(invoice["id"]),
    )
    with db.get_cursor() as cur:
        cur.execute(_LIST + " and i.id = %s", (organization["id"], invoice["id"]))
        return _out(cur.fetchone())


GENERATE_BATCH = 50


@router.post("/invoices/generate-pending", response_model=GenerateResult)
def generate_pending_invoices(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> GenerateResult:
    """Up to 50 bookings per call: missing invoices and open stornos.
    Idempotent; remaining > 0 means call again."""
    organization = require_organization(organization_slug)
    org_id = organization["id"]
    with db.get_cursor() as cur:
        cur.execute(
            f"""select id from (
                    select r.id, r.created_at from camp_registrations r where {invoices.PENDING_WHERE}
                    union
                    select r.id, r.created_at from camp_registrations r where {invoices.STORNO_PENDING_WHERE}
                ) work order by created_at, id limit %s""",
            (org_id, org_id, GENERATE_BATCH),
        )
        ids = [row["id"] for row in cur.fetchall()]
    created = stornos = blocked = failed = 0
    for registration_id in ids:
        outcome = invoices.sync_registration(registration_id, org_id, created_by=auth.user_id)
        if outcome["failed"]:
            failed += 1
        elif outcome["blocked"]:
            blocked += 1
        elif outcome["created"]:
            created += 1
        stornos += outcome["stornos"]
    with db.get_cursor() as cur:
        remaining = invoices.open_work(cur, org_id)
    left = remaining["total"] - remaining["missing_profile"]
    if ids:
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id,
            actor_email=auth.email,
            action="invoice.pending_generated",
            organization_id=str(org_id),
            target_type="organization",
            target_id=organization_slug,
            metadata={"created": created, "stornos": stornos, "blocked": blocked, "failed": failed},
        )
    return GenerateResult(created=created, stornos=stornos, blocked=blocked, failed=failed, remaining=max(left, 0))
