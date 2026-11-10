"""Reminder mail three days before camp start (part of the daily job).

Which bookings: classic camps with start_date = today + 3 days (Europe/Berlin), status
registered/confirmed (no waitlist, no cancelled), not anonymized, reminder_sent_at is null.

Exactly once: each row is claimed with a conditional UPDATE (reminder_sent_at = now()
where it is still null) before the mail goes out, so two parallel runs cannot both send.
If the mail fails (or the provider does not really deliver, e.g. the fake provider), the
claim is released and only that row counts as failed; the other mails are unaffected.
There is no automatic retry on later days: the window is exactly three days before start.

Mails go through the normal mail path, including the non-production recipient guard.
No names, addresses or mail texts are logged.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from . import db
from .config import get_settings
from .notifications.mail import get_provider
from .notifications.templates import build_reminder_mail

logger = logging.getLogger(__name__)

REMINDER_DAYS_BEFORE = 3

_DUE = """
    select r.registration_token, r.organization_id, r.parent_email,
           c.title as camp_title, c.start_date, c.end_date, c.location, c.care_info,
           o.slug as org_slug, o.name as org_name, o.contact_email as org_email, o.contact_phone as org_phone
    from camp_registrations r
    join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    join organizations o on o.id = r.organization_id
    where c.start_date = %s
      and c.offer_id is null
      and c.status in ('published', 'closed')
      and o.plan_status not in ('suspended', 'cancelled')
      and r.status in ('registered', 'confirmed')
      and r.anonymized_at is null
      and r.reminder_sent_at is null
      and r.cancellation_requested_at is null
    order by r.created_at, r.id
"""
_CLAIM = """
    update camp_registrations set reminder_sent_at = now()
    where registration_token = %s and organization_id = %s
      and reminder_sent_at is null and anonymized_at is null and cancellation_requested_at is null
      and status in ('registered', 'confirmed')
"""
_RELEASE = "update camp_registrations set reminder_sent_at = null where registration_token = %s and organization_id = %s"


def _booking_url(org_slug: str, token) -> str | None:
    try:
        return get_settings().booking_url(org_slug, token)
    except ValueError:
        return None  # FRONTEND_BASE_URL not set for this environment: mail without link


def _send_one(row: dict) -> bool:
    """True if the reminder was sent and recorded. Never leaves a claim behind on failure."""
    token, org = row["registration_token"], row["organization_id"]
    with db.get_cursor() as cur:
        cur.execute(_CLAIM, (token, org))
        if cur.rowcount != 1:
            return False  # someone else got it first, or the booking changed meanwhile
    try:
        msg = build_reminder_mail(
            org_name=row["org_name"], org_email=row["org_email"], org_phone=row.get("org_phone"),
            camp_title=row["camp_title"], camp_start=row["start_date"], camp_end=row["end_date"],
            location=row.get("location"), care_info=row.get("care_info"),
            parent_email=row["parent_email"], booking_url=_booking_url(row["org_slug"], token),
        )
        msg.sender_name = f"{row['org_name']} über CampsPilot"
        provider = get_provider()
        provider.send(msg)
        delivered = getattr(provider, "delivers", True)
    except Exception as exc:  # noqa: BLE001 - one bad mail must not stop the others
        logger.warning("Reminder mail failed (error_type=%s)", type(exc).__name__)
        delivered = False
        sent = False
    else:
        sent = delivered
    if not delivered:
        try:
            with db.get_cursor() as cur:
                cur.execute(_RELEASE, (token, org))
        except Exception as exc:  # noqa: BLE001
            logger.error("Reminder claim could not be released (error_type=%s)", type(exc).__name__)
    return sent


def send_due_reminders(today: date) -> dict:
    """Returns {"due": n, "sent": n, "failed": n} (counts only)."""
    with db.get_cursor() as cur:
        cur.execute(_DUE, (today + timedelta(days=REMINDER_DAYS_BEFORE),))
        rows = cur.fetchall()
    sent = failed = 0
    for row in rows:
        try:
            ok = _send_one(row)
        except Exception as exc:  # noqa: BLE001 - e.g. database error while claiming
            logger.warning("Reminder skipped (error_type=%s)", type(exc).__name__)
            ok = False
        if ok:
            sent += 1
        else:
            failed += 1
    logger.info("Reminders finished (due=%d, sent=%d, failed=%d)", len(rows), sent, failed)
    return {"due": len(rows), "sent": sent, "failed": failed}
