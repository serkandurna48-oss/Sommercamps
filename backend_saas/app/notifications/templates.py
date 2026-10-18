"""
Email content for registration notifications.

Two status values → two distinct messages:
  "registered" — confirms the spot, includes payment reference and IBAN if set
  "waitlist"   — confirms the place on the waitlist, no payment details, no deadline
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from .mail import MailMessage


def _date_range(start: date, end: date) -> str:
    return f"{start.strftime('%d.%m.%Y')} – {end.strftime('%d.%m.%Y')}"


def build_registration_mail(
    *,
    status: str,
    org_name: str,
    org_email: str,
    org_phone: Optional[str],
    camp_title: str,
    camp_start: date,
    camp_end: date,
    parent_name: str,
    parent_email: str,
    child_name: str,
    payment_reference: str,
    iban: Optional[str],
) -> MailMessage:
    dates = _date_range(camp_start, camp_end)
    phone_line = f"<br>Telefon: {org_phone}" if org_phone else ""

    if status == "registered":
        subject = f"Anmeldebestätigung – {camp_title}"
        payment_block = (
            f"<p>Verwendungszweck: <strong>{payment_reference}</strong>"
            f"<br>IBAN: <strong>{iban}</strong></p>"
            if iban
            else ""
        )
        html = f"""\
<p>Hallo {parent_name},</p>
<p>die Anmeldung von <strong>{child_name}</strong> für <strong>{camp_title}</strong>
({dates}) ist bei uns eingegangen.</p>
{payment_block}
<p>Bei Fragen wende dich direkt an {org_name}:<br>
E-Mail: {org_email}{phone_line}</p>
<p>Viele Grüße,<br>{org_name}</p>"""
    else:
        subject = f"Wartelistenbestätigung – {camp_title}"
        html = f"""\
<p>Hallo {parent_name},</p>
<p>die Anmeldung von <strong>{child_name}</strong> für <strong>{camp_title}</strong>
({dates}) ist bei uns eingegangen. Das Camp ist aktuell ausgebucht –
{child_name} steht auf der Warteliste.</p>
<p>Sollte ein Platz frei werden, meldet sich {org_name} direkt bei dir.</p>
<p>Bei Fragen wende dich direkt an {org_name}:<br>
E-Mail: {org_email}{phone_line}</p>
<p>Viele Grüße,<br>{org_name}</p>"""

    return MailMessage(
        to_email=parent_email,
        to_name=parent_name,
        subject=subject,
        html_content=html,
        reply_to=org_email,
    )
