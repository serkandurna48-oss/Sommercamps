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
    payee_name: Optional[str] = None,
    org_email: str,
    org_phone: Optional[str],
    camp_title: str,
    camp_start: date,
    camp_end: date,
    parent_email: str,
    payment_reference: str,
    iban: Optional[str],
    price_cents: Optional[int] = None,
    currency: Optional[str] = None,
) -> MailMessage:
    # Escape all user-supplied strings before interpolating into HTML.
    e_org_name = escape(org_name)
    e_payee = escape(payee_name) if payee_name else e_org_name
    e_org_email = escape(org_email)
    e_camp_title = escape(camp_title)
    e_payment_ref = escape(payment_reference)
    e_iban = escape(iban) if iban else None
    e_phone = escape(org_phone) if org_phone else None

    dates = _date_range(camp_start, camp_end)
    phone_line = f"<br>Telefon: {e_phone}" if e_phone else ""

    amount_line = ""
    if price_cents is not None and currency:
        e_cur = escape(currency)
        formatted = f"{price_cents // 100},{price_cents % 100:02d}"
        amount_line = f"<p>Betrag: <strong>{formatted}&nbsp;{e_cur}</strong></p>\n"

    if status == "registered":
        subject = f"Anmeldebestätigung – {camp_title}"
        if e_iban:
            payment_block = (
                f"{amount_line}"
                f"<p>Empfänger: <strong>{e_payee}</strong>"
                f"<br>IBAN: <strong>{e_iban}</strong>"
                f"<br>Verwendungszweck: <strong>{e_payment_ref}</strong></p>"
            )
        else:
            payment_block = (
                f"{amount_line}"
                f"<p>Verwendungszweck: <strong>{e_payment_ref}</strong></p>\n"
                f"<p>{e_payee} sendet dir die Zahlungsdetails direkt.<br>"
                f"E-Mail: {e_org_email}{phone_line}</p>"
            )
        html = f"""\
<p>Hallo,</p>
<p>deine Anmeldung für <strong>{e_camp_title}</strong>
({dates}) ist bei uns eingegangen.</p>
{payment_block}
<p>Bei Fragen wende dich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""
    else:
        subject = f"Wartelistenbestätigung – {camp_title}"
        html = f"""\
<p>Hallo,</p>
<p>deine Anmeldung für <strong>{e_camp_title}</strong>
({dates}) ist bei uns eingegangen. Das Camp ist aktuell ausgebucht –
die Anmeldung steht auf der Warteliste. Es sind noch keine Kosten fällig.</p>
<p>Sollte ein Platz frei werden, meldet sich {e_org_name} direkt bei dir.</p>
<p>Bei Fragen wende dich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""

    return MailMessage(
        to_email=parent_email,
        subject=subject,
        html_content=html,
        reply_to=org_email,
    )


def build_provider_mail(
    *,
    status: str,
    camp_title: str,
    camp_start: date,
    camp_end: date,
    payment_reference: str,
    registered_count: int,
    capacity: int,
    waitlist_count: int,
    contact_email: str,
    org_name: str,
) -> MailMessage:
    e_camp_title = escape(camp_title)
    e_payment_ref = escape(payment_reference)
    e_org_name = escape(org_name)
    dates = _date_range(camp_start, camp_end)

    if status == "registered":
        subject = f"Neue Anmeldung – {camp_title}"
        status_label = "Angemeldet"
    else:
        subject = f"Neue Wartelisten-Anmeldung – {camp_title}"
        status_label = "Warteliste"

    html = (
        f"<p>Es ist eine neue Anmeldung eingegangen.</p>\n"
        f"<p>Camp: <strong>{e_camp_title}</strong><br>\n"
        f"Termin: {dates}<br>\n"
        f"Status: <strong>{status_label}</strong></p>\n"
        f"<p>Belegung: <strong>{registered_count} von {capacity} Plätzen belegt, "
        f"{waitlist_count} auf der Warteliste</strong></p>\n"
        f"<p>Verwendungszweck: <strong>{e_payment_ref}</strong></p>\n"
        f"<p>Details finden Sie im Admin-Bereich.</p>\n"
        f"<p>Mit freundlichen Grüßen,<br>{e_org_name} über CampsPilot</p>"
    )

    return MailMessage(
        to_email=contact_email,
        subject=subject,
        html_content=html,
    )
