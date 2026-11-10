"""
Email content for registration notifications.

Two status values → two distinct messages:
  "registered" — confirms the spot, includes payment reference and IBAN if set
  "waitlist"   — confirms the place on the waitlist, no payment details, no deadline
"""

from __future__ import annotations

from datetime import date, datetime
from html import escape
from typing import Optional

from zoneinfo import ZoneInfo

from .mail import MailMessage

_BERLIN = ZoneInfo("Europe/Berlin")


def _date_range(start: date, end: date) -> str:
    months = ("Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez.")
    end_text = f"{end.day}. {months[end.month - 1]} {end.year}"
    if start == end:
        return end_text
    if (start.year, start.month) == (end.year, end.month):
        return f"{start.day}.–{end_text}"
    start_year = f" {start.year}" if start.year != end.year else ""
    return f"{start.day}. {months[start.month - 1]}{start_year}–{end_text}"


def _when(start: date, end: date, starts_at: Optional[datetime]) -> str:
    """Training sessions (starts_at set) show date and Berlin local time;
    classic camps keep the date range."""
    if starts_at is None:
        return _date_range(start, end)
    local = starts_at.astimezone(_BERLIN)
    return f"{_date_range(local.date(), local.date())}, {local:%H:%M} Uhr"


def _booking_link_block(booking_url: Optional[str]) -> str:
    if not booking_url:
        return ""
    return f'<p><a href="{escape(booking_url)}">Ihre Anmeldung ansehen</a></p>\n'


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
    promoted: bool = False,
    starts_at: Optional[datetime] = None,
    payment_method: Optional[str] = None,
    booking_url: Optional[str] = None,
) -> MailMessage:
    """payment_method is only set for training bookings ('bar' | 'ueberweisung').
    Classic camps leave it None and keep the unchanged camp mail.

    promoted=True: the registration moved up from the waitlist; same payment
    details as a direct confirmation, but the parent is told a spot opened up."""
    # Escape all user-supplied strings before interpolating into HTML.
    e_org_name = escape(org_name)
    e_payee = escape(payee_name) if payee_name else e_org_name
    e_org_email = escape(org_email)
    e_camp_title = escape(camp_title)
    e_payment_ref = escape(payment_reference)
    e_iban = escape(iban) if iban else None
    e_phone = escape(org_phone) if org_phone else None

    dates = _when(camp_start, camp_end, starts_at)
    phone_line = f"<br>Telefon: {e_phone}" if e_phone else ""

    amount_line = ""
    if price_cents is not None and currency:
        e_cur = escape(currency)
        formatted = f"{price_cents // 100},{price_cents % 100:02d}"
        amount_line = f"<p>Betrag: <strong>{formatted}&nbsp;{e_cur}</strong></p>\n"

    is_training = starts_at is not None
    if status in ("registered", "confirmed"):
        if promoted:
            subject = f"Platz frei – Ihre Anmeldung ist bestätigt – {camp_title}"
        elif is_training:
            subject = f"Buchungsbestätigung: {camp_title} am {dates}"
        else:
            subject = f"Anmeldebestätigung – {camp_title}"
        if is_training and payment_method == "bar":
            payment_block = (
                f"{amount_line}"
                "<p>Bitte bar beim Training bezahlen.</p>"
            )
        elif is_training and payment_method == "online":
            if e_iban:
                fallback = (
                    "<p>Falls die Online-Zahlung nicht geklappt hat:</p>"
                    f"<p>Empfänger: <strong>{e_payee}</strong>"
                    f"<br>IBAN: <strong>{e_iban}</strong>"
                    f"<br>Verwendungszweck: <strong>{e_payment_ref}</strong></p>"
                )
            else:
                fallback = (
                    "<p>Falls die Online-Zahlung nicht geklappt hat, "
                    f"wenden Sie sich bitte an {e_org_email}.</p>"
                )
            payment_block = (
                f"{amount_line}"
                "<p>Sie zahlen online. Die Zahlung schließen Sie direkt nach der Buchung auf der Zahlungsseite ab.</p>\n"
                f"{fallback}"
            )
        elif e_iban:
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
                f"<p>Der Verein meldet sich zur Zahlung. {e_payee} sendet Ihnen die Zahlungsdetails direkt.<br>"
                f"E-Mail: {e_org_email}{phone_line}</p>"
            )
        intro = (
            f"<p>Für <strong>{e_camp_title}</strong> ({dates}) ist ein Platz frei geworden. "
            "Ihre Anmeldung von der Warteliste ist jetzt bestätigt.</p>"
            if promoted
            else f"<p>Ihre Anmeldung für <strong>{e_camp_title}</strong>\n({dates}) ist bei uns eingegangen.</p>"
        )
        cancel_note = (
            "<p>Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.</p>\n"
            if is_training
            else ""
        )
        html = f"""\
<p>Guten Tag,</p>
{intro}
{payment_block}
{cancel_note}{_booking_link_block(booking_url)}<p>Bei Fragen wenden Sie sich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""
    else:
        subject = f"Wartelistenbestätigung – {camp_title}"
        html = f"""\
<p>Guten Tag,</p>
<p>Ihre Anmeldung für <strong>{e_camp_title}</strong>
({dates}) ist bei uns eingegangen. Das Camp ist aktuell ausgebucht –
die Anmeldung steht auf der Warteliste. Es sind noch keine Kosten fällig.</p>
<p>Sollte ein Platz frei werden, meldet sich {e_org_name} direkt bei Ihnen.</p>
{_booking_link_block(booking_url)}<p>Bei Fragen wenden Sie sich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""

    return MailMessage(
        to_email=parent_email,
        subject=subject,
        html_content=html,
        reply_to=org_email,
    )


def build_cancellation_mail(
    *,
    org_name: str,
    org_email: str,
    org_phone: Optional[str],
    camp_title: str,
    camp_start: date,
    camp_end: date,
    parent_email: str,
    starts_at: Optional[datetime] = None,
) -> MailMessage:
    """Sent to the parent when the club cancels a registration."""
    e_org_name = escape(org_name)
    e_org_email = escape(org_email)
    e_camp_title = escape(camp_title)
    e_phone = escape(org_phone) if org_phone else None
    phone_line = f"<br>Telefon: {e_phone}" if e_phone else ""
    dates = _when(camp_start, camp_end, starts_at)
    html = f"""\
<p>Guten Tag,</p>
<p>Ihre Anmeldung für <strong>{e_camp_title}</strong> ({dates}) wurde storniert.</p>
<p>Falls Sie bereits bezahlt haben oder Fragen zur Stornierung haben, wenden Sie sich bitte direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""
    return MailMessage(
        to_email=parent_email,
        subject=f"Anmeldung storniert – {camp_title}",
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
    starts_at: Optional[datetime] = None,
) -> MailMessage:
    e_camp_title = escape(camp_title)
    e_payment_ref = escape(payment_reference)
    e_org_name = escape(org_name)
    dates = _when(camp_start, camp_end, starts_at)

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
        f"<p>Details findest du im Admin-Bereich.</p>\n"
        f"<p>Viele Grüße,<br>{e_org_name} über CampsPilot</p>"
    )

    return MailMessage(
        to_email=contact_email,
        subject=subject,
        html_content=html,
    )


def build_reminder_mail(
    *,
    org_name: str,
    org_email: str,
    org_phone: Optional[str],
    camp_title: str,
    camp_start: date,
    camp_end: date,
    location: Optional[str],
    care_info: Optional[str],
    parent_email: str,
    booking_url: Optional[str],
) -> MailMessage:
    """Reminder to the parent three days before camp start. No child name in
    subject or body; the link leads to "Meine Buchung"."""
    e_org_name = escape(org_name)
    e_org_email = escape(org_email)
    e_camp_title = escape(camp_title)
    e_phone = escape(org_phone) if org_phone else None
    phone_line = f"<br>Telefon: {e_phone}" if e_phone else ""
    dates = _date_range(camp_start, camp_end)
    details = [f"Zeitraum: <strong>{dates}</strong>"]
    if location:
        details.append(f"Ort: <strong>{escape(location)}</strong>")
    if care_info:
        details.append(f"Zeit: <strong>{escape(care_info)}</strong>")
    html = f"""\
<p>Guten Tag,</p>
<p>in drei Tagen beginnt <strong>{e_camp_title}</strong>. Hier die wichtigsten Angaben:</p>
<p>{"<br>".join(details)}</p>
{_booking_link_block(booking_url)}<p>Bei Fragen wenden Sie sich direkt an {e_org_name}:<br>
E-Mail: {e_org_email}{phone_line}</p>
<p>Wir freuen uns auf Sie und Ihr Kind.</p>
<p>Viele Grüße,<br>{e_org_name}</p>"""
    return MailMessage(
        to_email=parent_email,
        subject=f"Erinnerung: {camp_title} beginnt am {camp_start.day}.{camp_start.month}.",
        html_content=html,
        reply_to=org_email,
    )


def build_cancellation_request_mail(
    *,
    org_name: str,
    camp_title: str,
    admin_url: Optional[str],
    to_email: str,
) -> MailMessage:
    """To club admins (du-Form) when parents ask for a cancellation. No names, no health data."""
    e_org_name = escape(org_name)
    link = f'<p><a href="{escape(admin_url)}">Anmeldungen im Adminbereich öffnen</a></p>\n' if admin_url else ""
    html = f"""\
<p>Hallo,</p>
<p>für <strong>{escape(camp_title)}</strong> wurde eine Stornierung angefragt. Die Anmeldung ist noch nicht storniert.</p>
{link}<p>In der Anmeldungsliste ist sie mit „Storno angefragt“ markiert. Bitte melde dich bei den Eltern und storniere die Anmeldung, wenn es passt.</p>
<p>Viele Grüße<br>{e_org_name} über CampsPilot</p>"""
    return MailMessage(
        to_email=to_email,
        subject=f"Stornierung angefragt – {camp_title}",
        html_content=html,
    )
