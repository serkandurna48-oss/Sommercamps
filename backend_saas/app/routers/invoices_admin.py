"""
Admin access to parent invoices (billing B3): list, PDF download, resend,
create a pending invoice, per-booking view incl. refund options.
Org admin of the club or platform owner. Every query is tenant-scoped.
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
    """What "Rechnungen erzeugen" would do: bookings without invoice (of
    which missing master data / failed runs), open stornos, unsent mails."""

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


class RefundOptions(BaseModel):
    possible: bool
    remaining_cents: int


class RegistrationInvoicesOut(BaseModel):
    invoices: list[InvoiceOut]
    pending_reason: Optional[str] = None
    can_create: bool
    refund: RefundOptions


class GenerateResult(BaseModel):
    created: int
    stornos: int
    blocked: int
    failed: int
    # Still open after this batch (call again).
    remaining: int


def _out(row: dict) -> InvoiceOut:
    data = row["data"]
    return InvoiceOut(
        id=row["id"], number=row["number"], kind=row["kind"], issue_date=row["issue_date"],
        gross_cents=row["gross_cents"], net_cents=row["net_cents"], vat_cents=row["vat_cents"],
        recipient_name=data["recipient"]["name"], description=data["item"]["description"],
        cancels_number=(data.get("cancels") or {}).get("number"),
        registration_token=row.get("registration_token"),
        sent_at=row["sent_at"], send_error=row["send_error"],
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
        # Pending by query (paid, no invoice) - the marker only says why.
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
    return InvoiceListOut(billing_profile_complete=complete, invoices=[_out(r) for r in rows],
                          pending=[PendingInvoiceOut.model_validate(p) for p in pending], open=OpenWork(**work))


def _invoice(organization_id, invoice_id: UUID, with_pdf: bool = False) -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            f"select id, number, kind, organization_id{', pdf' if with_pdf else ''} from invoices "
            "where id = %s and organization_id = %s",
            (invoice_id, organization_id),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "Rechnung nicht gefunden")
    return row


@router.get("/invoices/{invoice_id}/pdf")
def download_invoice(organization_slug: str, invoice_id: UUID, auth: AuthContext = Depends(require_org_access)):
    del auth
    organization = require_organization(organization_slug)
    row = _invoice(organization["id"], invoice_id, with_pdf=True)
    return Response(
        content=bytes(row["pdf"]), media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{row["number"]}.pdf"',
                 "Cache-Control": "no-store"},
    )


@router.post("/invoices/{invoice_id}/resend", response_model=InvoiceOut)
def resend_invoice(organization_slug: str, invoice_id: UUID, auth: AuthContext = Depends(require_org_access)) -> InvoiceOut:
    organization = require_organization(organization_slug)
    _invoice(organization["id"], invoice_id)
    try:
        invoices.send_invoice(invoice_id, organization["id"], force=True)
    except Exception:  # noqa: BLE001 - recorded on the invoice
        raise HTTPException(502, "Die E-Mail konnte nicht versendet werden. Bitte versuch es später noch einmal.") from None
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="invoice.resent",
        organization_id=str(organization["id"]), target_type="invoice", target_id=str(invoice_id),
    )
    with db.get_cursor() as cur:
        cur.execute(_LIST + " and i.id = %s", (organization["id"], invoice_id))
        return _out(cur.fetchone())


def _registration(organization_id, registration_token: UUID) -> dict:
    with db.get_cursor() as cur:
        cur.execute(
            """select id, payment_status, invoice_pending_reason, fee_snapshot_at, stripe_charge_type,
                      stripe_payment_intent_id, stripe_checkout_amount_cents, refunded_cents
               from camp_registrations where organization_id = %s and registration_token = %s""",
            (organization_id, registration_token),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "Registration not found")
    return row


@router.get("/registrations/{registration_token}/invoices", response_model=RegistrationInvoicesOut)
def registration_invoices(
    organization_slug: str, registration_token: UUID, auth: AuthContext = Depends(require_org_access),
) -> RegistrationInvoicesOut:
    del auth
    organization = require_organization(organization_slug)
    reg = _registration(organization["id"], registration_token)
    with db.get_cursor() as cur:
        cur.execute(_LIST + " and i.registration_id = %s order by i.year, i.sequence", (organization["id"], reg["id"]))
        rows = cur.fetchall()
    has_invoice = any(r["kind"] == "invoice" for r in rows)
    paid_without_invoice = (not has_invoice and reg["fee_snapshot_at"] is not None
                            and reg["payment_status"] in invoices.PAID_STATES)
    remaining = (reg["stripe_checkout_amount_cents"] or 0) - (reg["refunded_cents"] or 0)
    refundable = (
        reg["stripe_charge_type"] == "destination" and reg["stripe_payment_intent_id"] is not None
        and reg["payment_status"] in ("paid", "partially_refunded") and remaining > 0
    )
    return RegistrationInvoicesOut(
        invoices=[_out(r) for r in rows],
        pending_reason=(reg["invoice_pending_reason"] or "not_created") if paid_without_invoice else None,
        can_create=paid_without_invoice,
        refund=RefundOptions(possible=refundable, remaining_cents=max(remaining, 0) if refundable else 0),
    )


@router.post("/registrations/{registration_token}/invoice", response_model=InvoiceOut, status_code=201)
def create_registration_invoice(
    organization_slug: str, registration_token: UUID, auth: AuthContext = Depends(require_org_access),
) -> InvoiceOut:
    """Create a pending invoice (e.g. after the billing master data was
    completed) and mail it. Returns the existing invoice if there is one."""
    organization = require_organization(organization_slug)
    reg = _registration(organization["id"], registration_token)
    try:
        invoice = invoices.create_invoice(reg["id"], organization["id"], created_by=auth.user_id)
    except invoices.InvoiceBlocked as blocked:
        raise HTTPException(409, {"code": blocked.code}) from None
    if invoice["sent_at"] is None and invoice["send_attempts"] == 0:
        invoices.send_invoice(invoice["id"], organization["id"])
    for storno in invoices.create_stornos(reg["id"], organization["id"], created_by=auth.user_id):
        invoices.send_invoice(storno["id"], organization["id"])
    platform_roles.write_audit_log(
        actor_user_id=auth.user_id, actor_email=auth.email, action="invoice.created_by_admin",
        organization_id=str(organization["id"]), target_type="invoice", target_id=str(invoice["id"]),
    )
    with db.get_cursor() as cur:
        cur.execute(_LIST + " and i.id = %s", (organization["id"], invoice["id"]))
        return _out(cur.fetchone())


GENERATE_BATCH = 50


@router.post("/invoices/generate-pending", response_model=GenerateResult)
def generate_pending_invoices(organization_slug: str, auth: AuthContext = Depends(require_org_access)) -> GenerateResult:
    """"Rechnungen erzeugen": up to 50 bookings per call - missing invoices
    (also after failed runs), open stornos and unsent mails. Idempotent;
    `remaining` > 0 means call again."""
    organization = require_organization(organization_slug)
    org_id = organization["id"]
    with db.get_cursor() as cur:
        cur.execute(
            f"""select id from (
                    select r.id, r.created_at from camp_registrations r where {invoices.PENDING_WHERE}
                    union
                    select r.id, r.created_at from camp_registrations r where {invoices.STORNO_PENDING_WHERE}
                    union
                    select r.id, r.created_at from camp_registrations r
                    where r.organization_id = %s and exists (
                        select 1 from invoices i where i.registration_id = r.id and i.organization_id = %s
                          and i.sent_at is null and i.send_attempts < 5)
                ) work order by created_at, id limit %s""",
            (org_id, org_id, org_id, org_id, GENERATE_BATCH),
        )
        ids = [r["id"] for r in cur.fetchall()]
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
    # Blocked by missing master data does not count as work the button can do.
    left = remaining["total"] - remaining["missing_profile"]
    if ids:
        platform_roles.write_audit_log(
            actor_user_id=auth.user_id, actor_email=auth.email, action="invoice.pending_generated",
            organization_id=str(org_id), target_type="organization", target_id=organization_slug,
            metadata={"created": created, "stornos": stornos, "blocked": blocked, "failed": failed},
        )
    return GenerateResult(created=created, stornos=stornos, blocked=blocked, failed=failed, remaining=max(left, 0))
