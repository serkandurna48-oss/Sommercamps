"""
Registration notification orchestration.

send_registration_notification — called from the registration router
  immediately after a registration is created. Best-effort: never raises,
  because the registration is already committed and must not be rolled back
  due to a mail error. Records email_sent_at on success, email_error on failure.

send_status_change_notification — best-effort parent mail after the club
  cancels a registration or a waitlisted child moves up. Records
  email_sent_at / email_error like the confirmation mail.

resend_registration_mail — explicit admin action: sends the mail that fits
  the registration's CURRENT status again. Raises on failure (the admin sees it).

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
from ..config import get_settings
from ..registration_lifecycle import CAPACITY_COUNTING_STATUSES
from ..payment_reference import payment_reference as build_payment_reference
from .mail import get_provider
from .templates import (
    build_cancellation_mail,
    build_parent_cancelled_mail,
    build_provider_mail,
    build_registration_mail,
)

logger = logging.getLogger(__name__)

_CAPACITY_COUNTING_STATUSES_LIST = list(CAPACITY_COUNTING_STATUSES)

_FETCH_CONTEXT = """
    SELECT
        o.slug                            AS org_slug,
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
        r.email_error,
        r.camp_id,
        r.applied_price_cents,
        r.payment_method,
        c.start_date,
        c.end_date,
        c.starts_at
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


def _error_code(exc: Exception) -> str:
    """Short, PII-free reason stored in email_error (shown to club admins via the API)."""
    text = str(exc)
    if "NOTIFICATION_ALLOWED_RECIPIENTS" in text:
        return "blocked_outside_production"
    if "NOTIFICATION_PROVIDER" in text:
        return "mail_provider_not_configured"
    response = getattr(exc, "response", None)
    status_code = getattr(response, "status_code", None)
    if isinstance(status_code, int):
        return f"provider_http_{status_code}"
    return type(exc).__name__


def _mark_error(registration_token: UUID, error: str, organization_id: UUID) -> None:
    with db.get_cursor() as cur:
        cur.execute(_MARK_ERROR, (error[:500], registration_token, organization_id))


def _effective_price(ctx: dict, applied_price_cents: Optional[int]) -> Optional[int]:
    """The price actually agreed for this registration; legacy rows (and
    classic camps) have no applied price and keep the camp price."""
    return applied_price_cents if applied_price_cents is not None else ctx.get("price_cents")


def _booking_url(ctx: dict, registration_token: UUID) -> Optional[str]:
    """Link "Meine Buchung" for parent mails; None (mail without link) when the
    frontend origin is not configured for this environment."""
    try:
        return get_settings().booking_url(ctx.get("org_slug") or "", registration_token)
    except ValueError:
        return None


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
    applied_price_cents: Optional[int] = None,
    starts_at: Optional[datetime] = None,
    payment_method: Optional[str] = None,
) -> None:
    ctx = _fetch_mail_context(organization_id, camp_id)
    if ctx is None:
        raise RuntimeError(f"org/camp context not found (org={organization_id}, camp={camp_id})")

    payment_reference = build_payment_reference(ctx["camp_title"], registration_token)

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
        price_cents=_effective_price(ctx, applied_price_cents),
        currency=ctx.get("currency"),
        starts_at=starts_at,
        payment_method=payment_method,
        booking_url=_booking_url(ctx, registration_token),
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
    starts_at: Optional[datetime] = None,
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
        payment_reference = build_payment_reference(ctx["camp_title"], registration_token)
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
            starts_at=starts_at,
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
    applied_price_cents: Optional[int] = None,
    starts_at: Optional[datetime] = None,
    payment_method: Optional[str] = None,
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
            applied_price_cents=applied_price_cents,
            starts_at=starts_at,
            payment_method=payment_method,
        )
    except Exception as exc:
        logger.warning(
            "send_registration_notification failed (token=%s): %s",
            registration_token,
            exc,
        )
        try:
            _mark_error(registration_token, _error_code(exc), organization_id)
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
        starts_at=starts_at,
    )


def send_review_decision_email(
    *,
    to_email: str,
    org_name: str,
    decision: str,
    note: Optional[str],
    org_slug: str | None = None,
) -> None:
    """Sends a review decision (approve/reject) notification to the
    organization's contact email. Best-effort: never raises — a mail failure
    must not roll back the already-committed review decision. Uses the same
    provider as registration notifications (FakeProvider in tests)."""
    from html import escape

    try:
        login_link = escape(get_settings().login_url(org_slug))
    except ValueError as exc:
        # FRONTEND_BASE_URL missing in a deployed env: never mail a localhost link.
        logger.error("send_review_decision_email skipped (error_type=%s)", type(exc).__name__)
        return
    login_html = '<p>Dein dauerhafter Login: <a href="' + login_link + '">' + login_link + '</a></p>'
    if decision == "approve":
        subject = "Dein Verein wurde freigeschaltet - CampsPilot"
        body = (
            "<p>Hallo,</p>"
            "<p>Dein Antrag auf Freischaltung des Vereins <strong>"
            + escape(org_name)
            + "</strong> wurde genehmigt. Dein Verein ist freigeschaltet.</p>"
            "<p>Dein nächster Schritt: Camp prüfen und veröffentlichen, "
            "dann den Anmeldelink an Eltern teilen.</p>"
            + login_html
            + "<p>Viele Grüße<br>Dein CampsPilot-Team</p>"
        )
    else:
        note_html = "<p><strong>Begründung:</strong> " + escape(note or "") + "</p>" if note else ""
        subject = "Dein Antrag wurde abgelehnt - CampsPilot"
        body = (
            "<p>Hallo,</p>"
            "<p>Dein Antrag auf Freischaltung des Vereins <strong>"
            + escape(org_name)
            + "</strong> wurde leider abgelehnt.</p>"
            + note_html
            + "<p>Bitte korrigier die genannten Punkte und reich den Antrag erneut zur Prüfung ein.</p>"
            + login_html
            + "<p>Viele Grüße<br>Dein CampsPilot-Team</p>"
        )

    from .mail import MailMessage

    msg = MailMessage(to_email=to_email, subject=subject, html_content=body)
    try:
        provider = get_provider()
        provider.send(msg)
    except Exception as exc:
        logger.warning(
            "send_review_decision_email failed (error_type=%s)",
            type(exc).__name__,
        )


def send_signup_confirmation_email(
    *,
    to_email: str,
    org_name: str,
    confirmation_link: str,
    org_slug: str | None = None,
) -> bool:
    """Sends the signup confirmation email after self-registration.

    Subject: "Bitte bestätige deine Registrierung"
    Language: German, informal (geduzt). Includes confirmation, next steps,
    and a permanent login link.

    Returns True if the provider accepted the message without raising,
    False otherwise. Never raises — best-effort send."""
    from html import escape

    from .mail import MailMessage

    e_org_name = escape(org_name)
    e_link = escape(confirmation_link)
    try:
        login_link = escape(get_settings().login_url(org_slug))
    except ValueError as exc:
        logger.error("send_signup_confirmation_email skipped (error_type=%s)", type(exc).__name__)
        return False
    subject = "Bitte bestätige deine Registrierung"
    body = (
        "<p>Hallo,</p>"
        "<p>Du hast deinen Verein <strong>"
        + e_org_name
        + "</strong> bei CampsPilot registriert. So geht es weiter:</p>"
        "<ol>"
        '<li><a href="' + e_link + '">E-Mail bestätigen</a></li>'
        "<li>Verein einrichten und erstes Camp anlegen.</li>"
        "<li>Zur Prüfung einreichen – wir prüfen deine Angaben und schalten deinen Verein frei.</li>"
        "</ol>"
        "<p>Dieser Link ist 24 Stunden gültig.</p>"
        '<p>Dein dauerhafter Login: <a href="' + login_link + '">' + login_link + '</a></p>'
        "<p>Viele Grüße<br>Dein CampsPilot-Team</p>"
    )
    msg = MailMessage(to_email=to_email, subject=subject, html_content=body)
    try:
        provider = get_provider()
        provider.send(msg)
        return True
    except Exception as exc:
        # No address, org name or provider response in the log (PII).
        logger.warning(
            "send_signup_confirmation_email failed (error_type=%s)",
            type(exc).__name__,
        )
        return False


def send_member_invite_email(
    *,
    to_email: str,
    org_name: str,
    link: str,
    new_account: bool,
) -> bool:
    """Tells a new org_admin about their access. New accounts get a
    set-password link (valid 24h), existing accounts their login link.
    Returns True if the provider accepted the message. Never raises."""
    from html import escape

    from .mail import MailMessage

    e_org = escape(org_name)
    e_link = escape(link)
    if new_account:
        subject = f"Einladung: {org_name} auf CampsPilot verwalten"
        body = (
            "<p>Hallo,</p>"
            "<p>Du wurdest eingeladen, den Verein <strong>" + e_org + "</strong> auf CampsPilot mitzuverwalten.</p>"
            '<p><a href="' + e_link + '">Passwort festlegen und loslegen</a></p>'
            "<p>Der Link ist 24 Stunden gültig. Danach kannst du auf der Anmeldeseite "
            "über „Passwort vergessen?“ jederzeit einen neuen Link anfordern.</p>"
            "<p>Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail ignorieren.</p>"
            "<p>Viele Grüße<br>Dein CampsPilot-Team</p>"
        )
    else:
        subject = f"Du verwaltest jetzt {org_name} auf CampsPilot"
        body = (
            "<p>Hallo,</p>"
            "<p>Dein bestehendes CampsPilot-Konto hat jetzt Zugriff auf den Verein <strong>" + e_org + "</strong>.</p>"
            '<p>Login: <a href="' + e_link + '">' + e_link + "</a></p>"
            "<p>Viele Grüße<br>Dein CampsPilot-Team</p>"
        )
    msg = MailMessage(to_email=to_email, subject=subject, html_content=body)
    msg.sender_name = f"{org_name} über CampsPilot"
    try:
        get_provider().send(msg)
        return True
    except Exception as exc:
        logger.warning("send_member_invite_email failed (error_type=%s)", type(exc).__name__)
        return False


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
        applied_price_cents=reg.get("applied_price_cents"),
        starts_at=reg.get("starts_at"),
        payment_method=reg.get("payment_method"),
    )


STATUS_CHANGE_KINDS = ("promoted", "cancelled")


def _send_for_status(registration_token: UUID, organization_id: UUID, kind: str) -> None:
    """kind: 'promoted' | 'cancelled' | 'current'. Raises on any failure."""
    reg = _fetch_registration(registration_token, organization_id)
    if reg is None:
        raise RuntimeError("registration not found")
    ctx = _fetch_mail_context(organization_id, reg["camp_id"])
    if ctx is None:
        raise RuntimeError("org/camp context not found")
    status = reg["status"]
    if kind == "cancelled" or (kind == "current" and status == "cancelled"):
        msg = build_cancellation_mail(
            org_name=ctx["org_name"],
            org_email=ctx["org_email"],
            org_phone=ctx.get("org_phone"),
            camp_title=ctx["camp_title"],
            camp_start=reg["start_date"],
            camp_end=reg["end_date"],
            parent_email=reg["parent_email"],
            starts_at=reg.get("starts_at"),
        )
    else:
        msg = build_registration_mail(
            status=status,
            org_name=ctx["org_name"],
            payee_name=ctx["payee_name"],
            org_email=ctx["org_email"],
            org_phone=ctx.get("org_phone"),
            camp_title=ctx["camp_title"],
            camp_start=reg["start_date"],
            camp_end=reg["end_date"],
            parent_email=reg["parent_email"],
            payment_reference=build_payment_reference(ctx["camp_title"], registration_token),
            iban=ctx.get("iban"),
            price_cents=_effective_price(ctx, reg.get("applied_price_cents")),
            currency=ctx.get("currency"),
            promoted=kind == "promoted",
            starts_at=reg.get("starts_at"),
            payment_method=reg.get("payment_method"),
            booking_url=_booking_url(ctx, registration_token),
        )
    msg.sender_name = f"{ctx['org_name']} über CampsPilot"
    provider = get_provider()
    provider.send(msg)
    if getattr(provider, "delivers", True):
        _mark_sent(registration_token, organization_id)


def send_status_change_notification(registration_token: UUID, organization_id: UUID, kind: str) -> None:
    """Best-effort, never raises. Failure is stored in email_error so the club
    sees it in its participant list and can resend."""
    if kind not in STATUS_CHANGE_KINDS:
        raise ValueError(kind)
    try:
        _send_for_status(registration_token, organization_id, kind)
    except Exception as exc:
        logger.warning(
            "send_status_change_notification failed (kind=%s, token=%s, error_type=%s)",
            kind,
            registration_token,
            type(exc).__name__,
        )
        try:
            _mark_error(registration_token, f"{kind}: {_error_code(exc)}", organization_id)
        except Exception:
            pass


def resend_registration_mail(registration_token: UUID, organization_id: UUID) -> None:
    """Admin-triggered. Sends the mail matching the current status again,
    regardless of email_sent_at. Records the outcome and re-raises on failure."""
    reg = _fetch_registration(registration_token, organization_id)
    previous_error = (reg or {}).get("email_error") or ""
    # A failed "Platz frei" mail is resent as such, not as a plain confirmation.
    kind_hint = (
        "promoted"
        if previous_error.startswith("promoted:") and (reg or {}).get("status") in ("registered", "confirmed")
        else "current"
    )
    try:
        _send_for_status(registration_token, organization_id, kind_hint)
    except Exception as exc:
        try:
            _mark_error(registration_token, f"{kind_hint}: {_error_code(exc)}", organization_id)
        except Exception:
            pass
        raise


_PARENT_CANCELLED_RECIPIENTS = """
    SELECT DISTINCT notification_email
    FROM organization_members
    WHERE organization_id = %s
      AND role = 'org_admin'
      AND notification_channel = 'email'
      AND notification_email IS NOT NULL
      AND notification_events && ARRAY['cancellation', 'new_registration']::text[]
"""


def _money(cents: int, currency: Optional[str]) -> str:
    value = f"{cents / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{value} €" if (currency or "EUR") == "EUR" else f"{value} {currency}"


def send_parent_cancelled_notification(
    registration_token: UUID, organization_id: UUID, refund_cents: int = 0
) -> None:
    """Best-effort mail to the club admins that parents cancelled themselves (with the
    refunded amount, or a waitlist removal when refund_cents is 0).

    Recipients: org admins with e-mail notifications on (channel 'email', an address, and the
    event 'cancellation' or 'new_registration'); without any, the organization's contact
    address. The mail names the camp and links to the admin list, nothing about the child
    or the parents. Never raises."""
    try:
        reg = _fetch_registration(registration_token, organization_id)
        if reg is None:
            return
        ctx = _fetch_mail_context(organization_id, reg["camp_id"])
        if ctx is None:
            return
        with db.get_cursor() as cur:
            cur.execute(_PARENT_CANCELLED_RECIPIENTS, (organization_id,))
            recipients = [row["notification_email"] for row in cur.fetchall()]
        if not recipients and ctx.get("org_email"):
            recipients = [ctx["org_email"]]
        try:
            admin_url: Optional[str] = get_settings().admin_registrations_url(ctx.get("org_slug") or "")
        except ValueError:
            admin_url = None
        refund_text = _money(refund_cents, ctx.get("currency")) if refund_cents > 0 else None
        provider = get_provider()
        for address in recipients:
            msg = build_parent_cancelled_mail(
                org_name=ctx["org_name"], camp_title=ctx["camp_title"], refund_text=refund_text,
                admin_url=admin_url, to_email=address,
            )
            msg.sender_name = f"{ctx['org_name']} über CampsPilot"
            try:
                provider.send(msg)
            except Exception as exc:  # noqa: BLE001 - one recipient must not block the others
                logger.warning("send_parent_cancelled_notification failed (error_type=%s)", type(exc).__name__)
    except Exception as exc:  # noqa: BLE001
        logger.warning("send_parent_cancelled_notification failed (error_type=%s)", type(exc).__name__)
