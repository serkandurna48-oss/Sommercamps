"""
Email content for registration notifications.

Two status values → two distinct messages:
  "registered" — confirms the spot, includes payment reference and IBAN if set
  "waitlist"   — confirms the place on the waitlist, no payment details, no deadline
"""

from __future__ import annotations

from datetime import date
from html import escape
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
    price_cents: Optional[int] = None,
    currency: Optional[str] = None,
) -> MailMessage:
    # Escape all user-supplied strings before interpolating into HTML.
    e_org_name = escape(org_name)
    e_org_email = escape(org_email)
    e_camp_title = escape(camp_title)
    e_parent_name = escape(parent_name)
    e_child_name = escape(child_name)
    e_payment_ref = escape(payment_reference)
    e_iban = escape(iban) if iban else None
    e_phone = escape(org_phone) if org_phone else None

    dates = _date_range(camp_start, camp_end)
    phone_line = f"<br>Telefon: {e_phone}" if e_phone else ""

    if status == "registered":
        subject = f"Anmeldebestätigung – {camp_title}"
        if e_iban:
            amount_line = ""
            if price_cents is not None and currency:
                e_cur = escape(currency)
                formatted = f"{price_cents // 100},{price_cents % 100:02d}"
                amount_line = f"<p>Betrag: <strong>{formatted}&nbsp;{e_cur}</strong></p>\n"
            payment_block = (
                f"{amount_line}"
                f"<p>Empfänger: <strong>{e_org_name}</strong>"
                f"<br>IBAN: <strong>{e_iban}</strong>"
                f"<br>Verwendungszweck: <strong>{e_payment_ref}</strong></p>"
            )
        else:
            payment_block = (
                f"<p>Die Zahlungsdetails erhältst du direkt von {e_org_name}.<br>"
                f"E-Mail: {e_org_email}{phone_line}</p>"
            )
        html = f"""\
<p>Hallo {e_parent_name},</p>
<p>die Anmeldung von <strong>{e_child_name}</strong> für <strong>{e_camp_title}</strong>
({dates}) ist bei uns eingegangen.</p>
{payment_block}
<p>Bei Fragen wende dich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""
    else:
        subject = f"Wartelistenbestätigung – {camp_title}"
        html = f"""\
<p>Hallo {e_parent_name},</p>
<p>die Anmeldung von <strong>{e_child_name}</strong> für <strong>{e_camp_title}</strong>
({dates}) ist bei uns eingegangen. Das Camp ist aktuell ausgebucht –
{e_child_name} steht auf der Warteliste. Es sind noch keine Kosten fällig.</p>
<p>Sollte ein Platz frei werden, meldet sich {e_org_name} direkt bei dir.</p>
<p>Bei Fragen wende dich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""

    return MailMessage(
        to_email=parent_email,
        to_name=parent_name,
        subject=subject,
        html_content=html,
        reply_to=org_email,
    )
