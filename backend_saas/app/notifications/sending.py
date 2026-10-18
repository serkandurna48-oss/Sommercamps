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
from .mail import get_provider
from .templates import build_registration_mail

logger = logging.getLogger(__name__)

_FETCH_CONTEXT = """
    SELECT
        o.name          AS org_name,
        o.contact_email AS org_email,
        o.contact_phone AS org_phone,
        o.iban,
        c.title         AS camp_title
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

_MARK_SENT = "UPDATE camp_registrations SET email_sent_at = %s, email_error = NULL WHERE registration_token = %s"
_MARK_ERROR = "UPDATE camp_registrations SET email_error = %s WHERE registration_token = %s"


def _fetch_mail_context(organization_id: UUID, camp_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(_FETCH_CONTEXT, (camp_id, organization_id))
        return cur.fetchone()


def _fetch_registration(registration_token: UUID, organization_id: UUID) -> Optional[dict]:
    with db.get_cursor() as cur:
        cur.execute(_FETCH_REGISTRATION, (registration_token, organization_id))
        return cur.fetchone()


def _mark_sent(registration_token: UUID) -> None:
    with db.get_cursor() as cur:
        cur.execute(_MARK_SENT, (datetime.now(timezone.utc), registration_token))


def _mark_error(registration_token: UUID, error: str) -> None:
    with db.get_cursor() as cur:
        cur.execute(_MARK_ERROR, (error[:500], registration_token))


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
    parent_name = f"{parent_first_name} {parent_last_name}"
    child_name = f"{child_first_name} {child_last_name}"

    msg = build_registration_mail(
        status=status,
        org_name=ctx["org_name"],
        org_email=ctx["org_email"],
        org_phone=ctx.get("org_phone"),
        camp_title=ctx["camp_title"],
        camp_start=start_date,
        camp_end=end_date,
        parent_name=parent_name,
        parent_email=parent_email,
        child_name=child_name,
        payment_reference=payment_reference,
        iban=ctx.get("iban"),
    )
    get_provider().send(msg)
    _mark_sent(registration_token)


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
) -> None:
    """Best-effort notification after registration creation. Never raises."""
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
            _mark_error(registration_token, str(exc))
        except Exception:
            pass


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
    )
