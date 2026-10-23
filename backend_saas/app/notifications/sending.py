"""
Registration notification orchestration.

send_registration_notification — called from the registration router
  immediately after a registration is created. Best-effort: never raises,
  because the registration is already committed and must not be rolled back
  due to a mail error. Records email_sent_at on success, email_error on failure.

retry_registration_notification — idempotent re-send for a registration
  that hasn't received a mail yet (email_sent_at IS NULL). Safe to call
  multiple times; second call is a no-op if the first succeeded.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from datetime import date
from typing import Optional
from uuid import UUID

from .. import db
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES
from .mail import get_provider
from .templates import build_provider_mail, build_registration_mail

logger = logging.getLogger(__name__)

_CAPACITY_COUNTING_STATUSES_LIST = list(CAPACITY_COUNTING_STATUSES)

_FETCH_CONTEXT = """
    SELECT
        o.name                            AS org_name,
        COALESCE(o.legal_name, o.name)    AS payee_name,
        o.contact_email                   AS org_email,
        o.contact_phone                   AS org_phone,
        o.iban,
        c.title                           AS camp_title,
        c.price_cents,
        c.currency
    FROM organizations o
    JOIN camps c ON c.id = %s AND c.organization_id = o.id
    WHERE o.id = %s
"""

_FETCH_REGISTRATION = """
    SELECT
        r.registration_token,
        r.status,
        r.parent_first_name,
        r.parent_last_name,
        r.parent_email,
        r.child_first_name,
        r.child_last_name,
        r.email_sent_at,
        r.camp_id,
        c.start_date,
        c.end_date
    FROM camp_registrations r
    JOIN camps c ON c.id = r.camp_id
    WHERE r.registration_token = %s
      AND r.organization_id = %s
"""

_MARK_SENT = (
    "UPDATE camp_registrations SET email_sent_at = %s, email_error = NULL"
    " WHERE registration_token = %s AND organization_id = %s"
)
_MARK_ERROR = (
    "UPDATE camp_registrations SET email_error = %s"
    " WHERE registration_token = %s AND organization_id = %s"
)

# Same subquery logic as _OCCUPANCY_SUBQUERIES in repositories/camps.py —
# single source of truth for what counts against capacity (CAPACITY_COUNTING_STATUSES).
_FETCH_OCCUPANCY = """
    SELECT
        (SELECT COUNT(*) FROM camp_registrations r2
           WHERE r2.camp_id = c.id AND r2.organization_id = c.organization_id
             AND r2.status = ANY(%s)) AS registered_count,
        (SELECT COUNT(*) FROM camp_registrations r2
           WHERE r2.camp_id = c.id AND r2.organization_id = c.organization_id
             AND r2.status = 'waitlist') AS waitlist_count,
        c.capacity
    FROM camps c
    WHERE c.id = %s AND c.organization_id = %s
"""


def _fetch_occupancy(organization_id: UUID, camp_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(_FETCH_OCCUPANCY, (_CAPACITY_COUNTING_STATUSES_LIST, camp_id, organization_id))
        return cur.fetchone()


def _fetch_mail_context(organization_id: UUID, camp_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(_FETCH_CONTEXT, (camp_id, organization_id))
        return cur.fetchone()


def _fetch_registration(registration_token: UUID, organization_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(_FETCH_REGISTRATION, (registration_token, organization_id))
        return cur.fetchone()


def _mark_sent(registration_token: UUID, organization_id: UUID) -> None:
    with db.get_cursor() as cur:
        cur.execute(_MARK_SENT, (datetime.now(timezone.utc), registration_token, organization_id))


def _mark_error(registration_token: UUID, error: str, organization_id: UUID) -> None:
    with db.get_cursor() as cur:
        cur.execute(_MARK_ERROR, (error[:500], registration_token, organization_id))


def _do_send(
    *,
    registration_token: UUID,
    status: str,
    organization_id: UUID,
    camp_id: UUID,
    start_date: date,
    end_date: date,
    parent_email: str,
    parent_first_name: str,
    parent_last_name: str,
    child_first_name: str,
    child_last_name: str,
) -> None:
    ctx = _fetch_mail_context(organization_id, camp_id)
    if ctx is None:
        raise RuntimeError(f"org/camp context not found (org={organization_id}, camp={camp_id})")

    payment_reference = f"CP-{str(registration_token)[:8].upper()}"

    msg = build_registration_mail(
        status=status,
        org_name=ctx["org_name"],
        payee_name=ctx["payee_name"],
        org_email=ctx["org_email"],
        org_phone=ctx.get("org_phone"),
        camp_title=ctx["camp_title"],
        camp_start=start_date,
        camp_end=end_date,
        parent_email=parent_email,
        payment_reference=payment_reference,
        iban=ctx.get("iban"),
        price_cents=ctx.get("price_cents"),
        currency=ctx.get("currency"),
    )
    msg.sender_name = f"{ctx['org_name']} über CampsPilot"
    provider = get_provider()
    provider.send(msg)
    if getattr(provider, "delivers", True):
        _mark_sent(registration_token, organization_id)


def _send_provider_notification(
    *,
    registration_token: UUID,
    status: str,
    organization_id: UUID,
    camp_id: UUID,
    start_date: date,
    end_date: date,
) -> None:
    """Best-effort provider notification. Never raises, never modifies email_sent_at/email_error."""
    try:
        ctx = _fetch_mail_context(organization_id, camp_id)
        if ctx is None:
            raise RuntimeError(
                f"org/camp context not found for provider mail "
                f"(org={organization_id}, camp={camp_id})"
            )
        contact_email = ctx.get("org_email")
        if not contact_email:
            logger.info(
                "send_provider_notification skipped: no contact_email (org=%s)",
                organization_id,
            )
            return
        occupancy = _fetch_occupancy(organization_id, camp_id)
        if occupancy is None:
            raise RuntimeError(
                f"occupancy data not found for provider mail "
                f"(org={organization_id}, camp={camp_id})"
            )
        payment_reference = f"CP-{str(registration_token)[:8].upper()}"
        msg = build_provider_mail(
            status=status,
            camp_title=ctx["camp_title"],
            camp_start=start_date,
            camp_end=end_date,
            payment_reference=payment_reference,
            registered_count=int(occupancy["registered_count"]),
            capacity=int(occupancy["capacity"]),
            waitlist_count=int(occupancy["waitlist_count"]),
            contact_email=contact_email,
            org_name=ctx["org_name"],
        )
        msg.sender_name = f"{ctx['org_name']} über CampsPilot"
        provider = get_provider()
        provider.send(msg)
    except Exception as exc:
        logger.warning(
            "send_provider_notification failed (token=%s): %s",
            registration_token,
            exc,
        )


def send_registration_notification(
    *,
    registration_token: UUID,
    status: str,
    organization_id: UUID,
    camp_id: UUID,
    start_date: date,
    end_date: date,
    parent_email: str,
    parent_first_name: str,
    parent_last_name: str,
    child_first_name: str,
    child_last_name: str,
    notify_provider: bool = True,
) -> None:
    """Best-effort notification after registration creation. Never raises.

    notify_provider=False is used by the parent-mail retry, so the provider
    is informed exactly once per registration."""
    try:
        _do_send(
            registration_token=registration_token,
            status=status,
            organization_id=organization_id,
            camp_id=camp_id,
            start_date=start_date,
            end_date=end_date,
            parent_email=parent_email,
            parent_first_name=parent_first_name,
            parent_last_name=parent_last_name,
            child_first_name=child_first_name,
            child_last_name=child_last_name,
        )
    except Exception as exc:
        logger.warning(
            "send_registration_notification failed (token=%s): %s",
            registration_token,
            exc,
        )
        try:
            _mark_error(registration_token, str(exc), organization_id)
        except Exception:
            pass

    if not notify_provider:
        return
    _send_provider_notification(
        registration_token=registration_token,
        status=status,
        organization_id=organization_id,
        camp_id=camp_id,
        start_date=start_date,
        end_date=end_date,
    )


def send_review_decision_email(
    *,
    to_email: str,
    org_name: str,
    decision: str,
    note: Optional[str],
) -> None:
    """Sends a review decision (approve/reject) notification to the
    organization's contact email. Best-effort: never raises — a mail failure
    must not roll back the already-committed review decision. Uses the same
    provider as registration notifications (FakeProvider in tests)."""
    from html import escape

    if decision == "approve":
        subject = "Ihr Verein wurde freigeschaltet - CampsPilot"
        body = (
            "<p>Sehr geehrte Damen und Herren,</p>"
            "<p>Ihr Antrag auf Freischaltung des Vereins <strong>"
            + escape(org_name)
            + "</strong> wurde genehmigt. Ihr Verein ist nun fuer Eltern erreichbar.</p>"
            "<p>Bitte melden Sie sich an, um Ihre Camps einzurichten und zu veroeffentlichen.</p>"
            "<p>Mit freundlichen Gruessen,<br>das CampsPilot-Team</p>"
        )
    else:
        note_html = "<p><strong>Begruendung:</strong> " + escape(note or "") + "</p>" if note else ""
        subject = "Ihr Antrag wurde abgelehnt - CampsPilot"
        body = (
            "<p>Sehr geehrte Damen und Herren,</p>"
            "<p>Ihr Antrag auf Freischaltung des Vereins <strong>"
            + escape(org_name)
            + "</strong> wurde leider abgelehnt.</p>"
            + note_html
            + "<p>Bitte korrigieren Sie die angegebenen Maengel und reichen Sie den Antrag erneut ein.</p>"
            "<p>Mit freundlichen Gruessen,<br>das CampsPilot-Team</p>"
        )

    from .mail import MailMessage

    msg = MailMessage(to_email=to_email, subject=subject, html_content=body)
    try:
        provider = get_provider()
        provider.send(msg)
    except Exception as exc:
        logger.warning(
            "send_review_decision_email failed (org=%s, decision=%s): %s",
            org_name,
            decision,
            exc,
        )


def retry_registration_notification(
    registration_token: UUID,
    organization_id: UUID,
) -> None:
    """Re-send if not already sent. Idempotent: no-op when email_sent_at is set."""
    reg = _fetch_registration(registration_token, organization_id)
    if reg is None:
        logger.warning(
            "retry_registration_notification: registration not found (token=%s)", registration_token
        )
        return
    if reg["email_sent_at"] is not None:
        return
    send_registration_notification(
        registration_token=registration_token,
        status=reg["status"],
        organization_id=organization_id,
        camp_id=reg["camp_id"],
        start_date=reg["start_date"],
        end_date=reg["end_date"],
        parent_email=reg["parent_email"],
        parent_first_name=reg["parent_first_name"],
        parent_last_name=reg["parent_last_name"],
        child_first_name=reg["child_first_name"],
        child_last_name=reg["child_last_name"],
        notify_provider=False,
    )
