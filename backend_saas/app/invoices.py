"""
Parent invoices in the club's name.

Ported from demo/jan (billing B3, DIN 5008 PDF) onto main's manual payment
bookkeeping. Differences from that branch:

- A booking is invoiced only when payment_status is 'paid' and
  booked_price_cents is greater than zero. There is no fee snapshot and no
  Stripe charge on this codebase.
- Storno is the full amount, when the booking is cancelled or
  payment_status is 'refunded'. Partial refunds do not exist here.
- The PDF is stored. Mail delivery is a later step, so this module never
  sends mail and never imports a mail provider.

Invoices are immutable (DB trigger). The snapshot in invoices.data is the
record; the PDF is only a rendering of it. No birth date, no health data,
no allergy text.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg2 import errors
from psycopg2.extras import Json

from . import db

logger = logging.getLogger(__name__)
# fpdf2 subsets the embedded font with fontTools, which logs every step at INFO.
logging.getLogger("fontTools").setLevel(logging.WARNING)
BERLIN = ZoneInfo("Europe/Berlin")
MISSING_PROFILE = "missing_billing_profile"


class InvoiceBlocked(Exception):
    """Invoice cannot be created now (code: missing_billing_profile, not_paid, free, not_found)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def split_tax(gross_cents: int, tax_status: str, vat_rate: Optional[int]) -> tuple[int, int]:
    """(net, vat) of a gross amount. Prices are gross; VAT is extracted and
    rounded half-up to whole cents on the net. Negative amounts (storno) are
    split like their absolute value, so storno + original add up to zero."""
    if tax_status != "ust_pflichtig" or not vat_rate:
        return gross_cents, 0
    sign = -1 if gross_cents < 0 else 1
    gross = abs(gross_cents)
    net = int((Decimal(gross) * 100 / Decimal(100 + vat_rate)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    return sign * net, sign * (gross - net)


def storno_split(original: dict, target: int, done_net: int, done_vat: int) -> tuple[int, int]:
    """Net/VAT of the next storno, computed cumulatively: the stornos up to
    `target` together carry split_tax(target); the storno that reaches the
    full amount takes exactly the remainder of the original, so original +
    all stornos sum to zero in gross, net and VAT."""
    if target >= original["gross_cents"]:
        target_net, target_vat = original["net_cents"], original["vat_cents"]
    else:
        target_net, target_vat = split_tax(target, original["tax_status"], original["vat_rate"])
    return -(target_net - done_net), -(target_vat - done_vat)


def euro(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    value = f"{abs(cents) / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{sign}{value} EUR"


def _de_date(value: date) -> str:
    return value.strftime("%d.%m.%Y")


def format_number(prefix: str, year: int, sequence: int) -> str:
    prefix = prefix if prefix.endswith("-") else f"{prefix}-"
    return f"{prefix}{year}-{sequence:04d}"


def allocate_number(cur, organization_id, year: int) -> int:
    """Next sequence for (club, year). Must run in the transaction that
    inserts the invoice: the row lock serializes concurrent invoices and a
    rollback releases the number again (no gaps)."""
    cur.execute(
        """insert into organization_invoice_counters (organization_id, year, last_number)
           values (%s, %s, 1)
           on conflict (organization_id, year)
           do update set last_number = organization_invoice_counters.last_number + 1
           returning last_number""",
        (organization_id, year),
    )
    return cur.fetchone()["last_number"]


def _as_dict(value: Any) -> dict:
    """jsonb comes back as a dict or, without a json loader, as text."""
    if isinstance(value, str):
        return json.loads(value)
    return value


# ---------------------------------------------------------------------------
# Data snapshot and PDF
# ---------------------------------------------------------------------------

_TAX_NOTE = {
    "kleinunternehmer": "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).",
}
FONT_DIR = Path(__file__).resolve().parent / "fonts"

LOGO_TIMEOUT_SECONDS = 3.0
LOGO_MAX_BYTES = 1_000_000
_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _strip_period(description: str, period: str) -> str:
    suffix = f" ({period})"
    return description[: -len(suffix)] if period and description.endswith(suffix) else description


def _position(data: dict) -> tuple[str, str, str]:
    """(title line, participant line, period line) of the single invoice position."""
    item, period = data["item"], data["service_period"]
    title = item.get("title") or _strip_period(item["description"], period)
    first = item.get("participant_first") or str(item["participant"]).split()[0]
    return title, f"Teilnehmer/in: {first}", f"Zeitraum: {period}"


def _payment_line(data: dict) -> str:
    pay, issuer = data.get("payment") or {}, data["issuer"]
    if data["kind"] != "storno" and pay.get("status") == "open":
        iban = issuer.get("iban") or ""
        return (
            f"Bitte überweisen Sie {euro(data['gross_cents'])} auf IBAN {iban} mit dem Verwendungszweck "
            f"{data['number']}."
            if iban
            else f"Bitte überweisen Sie {euro(data['gross_cents'])} mit dem Verwendungszweck {data['number']}."
        )
    if data["kind"] != "storno" and pay.get("status") == "paid" and pay.get("paid_at"):
        paid = _de_date(date.fromisoformat(pay["paid_at"]))
        return f"Bezahlt am {paid} per Online-Zahlung." if pay.get("method") == "online" else f"Bezahlt am {paid}."
    return data["payment_note"]


def _tax_note(data: dict) -> str:
    tax = data["tax"]
    if tax["status"] == "ust_pflichtig":
        return ""
    return _TAX_NOTE.get(tax["status"]) or tax.get("exemption_text") or ""


def _title(data: dict) -> str:
    if data["kind"] != "storno":
        return "Rechnung"
    cancels = data["cancels"]
    return f"Stornorechnung zu Rechnung {cancels['number']} vom {_de_date(date.fromisoformat(cancels['issue_date']))}"


def _info_rows(data: dict) -> list[tuple[str, str]]:
    rows = [
        ("Rechnungsnummer", data["number"]),
        ("Rechnungsdatum", _de_date(date.fromisoformat(data["issue_date"]))),
        ("Leistungszeitraum", data["service_period"]),
    ]
    if data.get("booking_ref"):
        rows.append(("Buchungsreferenz", data["booking_ref"]))
    return rows


def _address_lines(data: dict) -> list[str]:
    recipient = data["recipient"]
    lines = [recipient["name"]]
    if recipient.get("address"):
        lines += [part for part in str(recipient["address"]).split("\n") if part.strip()]
    lines.append(recipient["email"])
    return lines


def _footer_columns(data: dict) -> list[list[str]]:
    issuer = data["issuer"]
    ids = [f"Steuernummer: {issuer['tax_number']}"] if issuer.get("tax_number") else []
    ids += [f"USt-IdNr.: {issuer['vat_id']}"] if issuer.get("vat_id") else []
    contact = [f"E-Mail: {issuer['invoice_email']}"] + ([f"IBAN: {issuer['iban']}"] if issuer.get("iban") else [])
    return [[issuer["legal_name"], issuer["street"], f"{issuer['postal_code']} {issuer['city']}"], ids, contact]


def invoice_lines(data: dict) -> list[tuple[str, str]]:
    """All text of the PDF as (style, text) lines, in reading order. Used by
    tests to check content without PDF text extraction (e.g. that no fee or
    health data appears)."""
    issuer = data["issuer"]
    lines: list[tuple[str, str]] = [("issuer_name", issuer["legal_name"])]
    lines += [("text", text) for text in _address_lines(data)]
    lines += [("text", f"{label}: {value}") for label, value in _info_rows(data)]
    lines.append(("title", _title(data)))
    lines += [("text", text) for text in _position(data)]
    lines.append(("text", f"Betrag: {euro(data['gross_cents'])}"))
    if data["tax"]["status"] == "ust_pflichtig":
        lines += [
            ("text", f"Nettobetrag: {euro(data['net_cents'])}"),
            ("text", f"Umsatzsteuer {data['tax']['vat_rate']} %: {euro(data['vat_cents'])}"),
        ]
    lines.append(("total", f"Gesamtbetrag: {euro(data['gross_cents'])}"))
    if _tax_note(data):
        lines.append(("small", _tax_note(data)))
    lines.append(("small", _payment_line(data)))
    lines += [("small", text) for col in _footer_columns(data) for text in col]
    lines.append(("small", "Erstellt mit CampsPilot"))
    return lines


def _fetch_logo(url: Optional[str]) -> Optional[bytes]:
    """PNG/JPEG bytes of the club logo, or None. Never raises and never
    blocks for long: https only, no private/loopback targets, no redirects,
    short timeout, size limit, content sniffed (not the Content-Type)."""
    if not url:
        return None
    try:
        import ipaddress
        import socket
        from urllib.parse import urlparse

        import httpx

        parts = urlparse(url)
        if parts.scheme != "https" or not parts.hostname:
            return None
        for info in socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return None
        body = bytearray()
        with httpx.stream("GET", url, timeout=LOGO_TIMEOUT_SECONDS, follow_redirects=False) as resp:
            if resp.status_code != 200:
                return None
            for chunk in resp.iter_bytes():
                body += chunk
                if len(body) > LOGO_MAX_BYTES:
                    return None
        raw = bytes(body)
        return raw if raw.startswith((b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff")) else None
    except Exception:  # noqa: BLE001 - the logo is decoration; the invoice must still render
        logger.info("Invoice logo skipped")
        return None


def _accent(data: dict) -> tuple[int, int, int]:
    color = (data.get("branding") or {}).get("color")
    if isinstance(color, str) and _HEX_COLOR.match(color):
        return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
    return 90, 98, 110


def render_pdf(data: dict, compress: bool = True) -> bytes:
    """A4 business letter in DIN 5008 (form B) style: logo top right, sender
    line above the address window, info block right, position table, totals,
    payment line, footer with issuer details on every page."""
    from fpdf import FPDF, FontFace

    issuer = data["issuer"]
    accent = _accent(data)
    grey = (95, 99, 104)

    class InvoicePDF(FPDF):
        def header(self):
            if self.page_no() > 1:
                self.set_font("DejaVu", "", 8)
                self.set_text_color(*grey)
                self.set_xy(25, 12)
                self.cell(
                    0,
                    4,
                    f"{'Stornorechnung' if data['kind'] == 'storno' else 'Rechnung'} {data['number']}",
                    new_x="LMARGIN",
                    new_y="NEXT",
                )
                self.set_draw_color(*accent)
                self.set_line_width(0.3)
                self.line(25, 18, 190, 18)
                self.set_text_color(0, 0, 0)
                self.set_y(24)

        def footer(self):
            self.set_draw_color(200, 200, 200)
            self.set_line_width(0.2)
            self.line(25, 267, 190, 267)
            self.set_text_color(*grey)
            self.set_font("DejaVu", "", 7)
            for index, col in enumerate(_footer_columns(data)):
                self.set_xy(25 + index * 55, 269)
                self.multi_cell(53, 3.4, "\n".join(col), new_x="LEFT", new_y="NEXT")
            self.set_xy(25, 283)
            self.cell(125, 3.4, "Erstellt mit CampsPilot")
            self.cell(40, 3.4, f"Seite {self.page_no()}/{{nb}}", align="R")
            self.set_text_color(0, 0, 0)

    pdf = InvoicePDF(format="A4")
    pdf.set_compression(compress)
    pdf.add_font("DejaVu", "", str(FONT_DIR / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONT_DIR / "DejaVuSans-Bold.ttf"))
    pdf.alias_nb_pages()
    pdf.set_title(f"{'Stornorechnung' if data['kind'] == 'storno' else 'Rechnung'} {data['number']}")
    pdf.set_author(issuer["legal_name"])
    pdf.set_margins(25, 20, 20)
    pdf.set_auto_page_break(auto=True, margin=36)
    pdf.add_page()

    pdf.set_xy(25, 14)
    pdf.set_font("DejaVu", "B", 12)
    pdf.cell(100, 6, issuer["legal_name"], new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("DejaVu", "", 8.5)
    pdf.set_text_color(*grey)
    pdf.cell(100, 4.5, f"{issuer['street']}, {issuer['postal_code']} {issuer['city']}")
    pdf.set_text_color(0, 0, 0)
    logo = _fetch_logo((data.get("branding") or {}).get("logo_url"))
    if logo:
        try:
            pdf.image(logo, x=140, y=10, w=50, h=20, keep_aspect_ratio=True)
        except Exception:  # noqa: BLE001 - corrupt image: skip
            logger.info("Invoice logo skipped")
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.5)
    pdf.line(25, 34, 190, 34)

    pdf.set_xy(25, 45)
    pdf.set_font("DejaVu", "", 6.5)
    pdf.set_text_color(*grey)
    pdf.set_draw_color(190, 190, 190)
    pdf.set_line_width(0.2)
    pdf.cell(
        85,
        3.5,
        f"{issuer['legal_name']} · {issuer['street']} · {issuer['postal_code']} {issuer['city']}",
        border="B",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.set_text_color(0, 0, 0)
    pdf.set_xy(25, 51)
    pdf.set_font("DejaVu", "", 10)
    for text in _address_lines(data):
        pdf.cell(85, 5, text, new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(125, 47)
    for label, value in _info_rows(data):
        pdf.set_x(125)
        pdf.set_font("DejaVu", "", 8)
        pdf.set_text_color(*grey)
        pdf.cell(30, 5, label)
        pdf.set_text_color(0, 0, 0)
        pdf.set_font("DejaVu", "B" if label == "Rechnungsnummer" else "", 8.5)
        pdf.cell(35, 5, value, new_x="LMARGIN", new_y="NEXT")

    pdf.set_xy(25, 98)
    pdf.set_font("DejaVu", "B", 12.5)
    pdf.multi_cell(165, 7, _title(data), align="L", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1)
    pdf.set_font("DejaVu", "", 9)
    intro = (
        "Hiermit stornieren wir die folgende Leistung:"
        if data["kind"] == "storno"
        else "Wir stellen Ihnen folgende Leistung in Rechnung:"
    )
    pdf.cell(0, 5, intro, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    ust = data["tax"]["status"] == "ust_pflichtig"
    unit = data["net_cents"] if ust else data["gross_cents"]
    title, participant, period = _position(data)
    pdf.set_font("DejaVu", "", 9)
    pdf.set_draw_color(190, 190, 190)
    pdf.set_line_width(0.2)
    with pdf.table(
        col_widths=(11, 64, 16, 37, 37),
        text_align=("CENTER", "LEFT", "CENTER", "RIGHT", "RIGHT"),
        borders_layout="HORIZONTAL_LINES",
        line_height=5,
        padding=(1.5, 1.5),
        headings_style=FontFace(emphasis="BOLD", fill_color=(242, 243, 245)),
    ) as table:
        head = table.row()
        for text in (
            "Pos.",
            "Beschreibung",
            "Menge",
            "Einzelpreis" + (" netto" if ust else ""),
            "Betrag" + (" netto" if ust else ""),
        ):
            head.cell(text)
        row = table.row()
        row.cell("1")
        row.cell(f"{title}\n{participant}\n{period}")
        row.cell("1")
        row.cell(euro(unit))
        row.cell(euro(unit))
    pdf.ln(4)

    totals = (
        [("Nettobetrag", euro(data["net_cents"])), (f"Umsatzsteuer {data['tax']['vat_rate']} %", euro(data["vat_cents"]))]
        if ust
        else []
    )
    needed = 8 * (len(totals) + 1) + 40
    if pdf.will_page_break(needed):
        pdf.add_page()
    for label, value in totals:
        pdf.set_x(115)
        pdf.set_font("DejaVu", "", 9)
        pdf.cell(40, 5.5, label)
        pdf.cell(35, 5.5, value, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(115)
    pdf.set_draw_color(*accent)
    pdf.set_line_width(0.3)
    pdf.line(115, pdf.get_y() + 0.5, 190, pdf.get_y() + 0.5)
    pdf.ln(1.5)
    pdf.set_x(115)
    pdf.set_font("DejaVu", "B", 10.5)
    pdf.cell(40, 7, "Gesamtbetrag")
    pdf.cell(35, 7, euro(data["gross_cents"]), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    pdf.set_font("DejaVu", "", 9)
    note = _tax_note(data)
    if note:
        pdf.multi_cell(165, 4.8, note, align="L", new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
    pdf.multi_cell(165, 4.8, _payment_line(data), align="L", new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def recipient_address(booking: dict) -> Optional[str]:
    """Two-line address block, or None when the booking has no complete address.
    main does not collect a parent billing address yet; the keys are read
    defensively so a later column does not require a renderer change."""
    street, postal_code, city = (booking.get(key) for key in ("parent_street", "parent_postal_code", "parent_city"))
    if not (street and postal_code and city):
        return None
    return f"{street}\n{postal_code} {city}"


def _service_period(start: date, end: date) -> str:
    return _de_date(start) if start == end else f"{_de_date(start)} - {_de_date(end)}"


_BOOKING = """
    select r.id, r.organization_id, r.registration_token, r.status, r.payment_status,
           r.booked_price_cents, r.paid_at,
           r.parent_first_name, r.parent_last_name, r.parent_email,
           r.child_first_name, r.child_last_name,
           c.title as camp_title, c.start_date, c.end_date, c.price_cents
    from camp_registrations r
    join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    where r.id = %s and r.organization_id = %s
    for update of r
"""

_INVOICE_COLUMNS = """id, organization_id, registration_id, kind, number, year, sequence, cancels_invoice_id,
    issue_date, net_cents, vat_cents, gross_cents, tax_status, vat_rate, recipient_email, data,
    created_at, sent_at, send_error, send_attempts"""


def _paid_amount(booking: dict) -> int:
    if booking.get("booked_price_cents") is not None:
        return int(booking["booked_price_cents"])
    if booking.get("price_cents") is not None:
        return int(booking["price_cents"])
    return 0


def _insert(cur, organization_id, registration_id, data: dict, created_by: Optional[str]) -> dict:
    cur.execute(
        f"""insert into invoices (organization_id, registration_id, kind, number, year, sequence,
                cancels_invoice_id, storno_key, issue_date, net_cents, vat_cents, gross_cents, tax_status,
                vat_rate, recipient_email, data, pdf, created_by)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning {_INVOICE_COLUMNS}""",
        (
            organization_id,
            registration_id,
            data["kind"],
            data["number"],
            data["year"],
            data["sequence"],
            data.get("cancels", {}).get("id"),
            data.get("storno_key"),
            data["issue_date"],
            data["net_cents"],
            data["vat_cents"],
            data["gross_cents"],
            data["tax"]["status"],
            data["tax"].get("vat_rate"),
            data["recipient"]["email"],
            Json(data),
            render_pdf(data),
            created_by,
        ),
    )
    row = cur.fetchone()
    row["data"] = _as_dict(row["data"])
    return row


def _today() -> date:
    return datetime.now(timezone.utc).astimezone(BERLIN).date()


def _paid_on(booking: dict) -> Optional[str]:
    paid_at = booking.get("paid_at")
    if paid_at is None:
        return None
    if isinstance(paid_at, datetime):
        return paid_at.astimezone(BERLIN).date().isoformat()
    if isinstance(paid_at, date):
        return paid_at.isoformat()
    return None


def create_invoice(registration_id, organization_id, created_by: Optional[str] = None) -> dict:
    """The booking's invoice; creates it once. Raises InvoiceBlocked."""
    with db.get_cursor() as cur:
        cur.execute(_BOOKING, (registration_id, organization_id))
        booking = cur.fetchone()
        if booking is None:
            raise InvoiceBlocked("not_found")
        cur.execute(
            f"select {_INVOICE_COLUMNS} from invoices where organization_id = %s and registration_id = %s "
            "and kind = 'invoice'",
            (organization_id, registration_id),
        )
        existing = cur.fetchone()
        if existing:
            existing["data"] = _as_dict(existing["data"])
            return {**existing, "_new": False}
        if booking["payment_status"] != "paid":
            raise InvoiceBlocked("not_paid")
        amount = _paid_amount(booking)
        if amount <= 0:
            raise InvoiceBlocked("free")
        cur.execute(
            """select legal_name, street, postal_code, city, tax_number, vat_id, tax_status, default_vat_rate,
                      tax_exemption_text, invoice_number_prefix, invoice_email
               from organization_billing_profiles where organization_id = %s""",
            (organization_id,),
        )
        profile = cur.fetchone()
        if profile is not None:
            cur.execute("select logo_url, primary_color, iban from organizations where id = %s", (organization_id,))
            profile = {**profile, **(cur.fetchone() or {})}
        if profile is None:
            cur.execute(
                "update camp_registrations set invoice_pending_reason = %s where id = %s and organization_id = %s",
                (MISSING_PROFILE, registration_id, organization_id),
            )
        else:
            return {**_issue(cur, booking, profile, amount, organization_id, registration_id, created_by), "_new": True}
    raise InvoiceBlocked(MISSING_PROFILE)


def _issue(cur, booking: dict, profile: dict, amount: int, organization_id, registration_id, created_by: Optional[str]) -> dict:
    """Number, freeze the issuer data, render and store (caller holds the booking lock)."""
    issue = _today()
    sequence = allocate_number(cur, organization_id, issue.year)
    rate = profile["default_vat_rate"] if profile["tax_status"] == "ust_pflichtig" else None
    net, vat = split_tax(amount, profile["tax_status"], rate)
    period = _service_period(booking["start_date"], booking["end_date"])
    token = booking.get("registration_token")
    data: dict[str, Any] = {
        "kind": "invoice",
        "number": format_number(profile["invoice_number_prefix"], issue.year, sequence),
        "year": issue.year,
        "sequence": sequence,
        "issue_date": issue.isoformat(),
        "service_period": period,
        "issuer": {
            **{
                key: profile[key]
                for key in ("legal_name", "street", "postal_code", "city", "tax_number", "vat_id", "invoice_email")
            },
            "iban": profile.get("iban"),
        },
        "branding": {"logo_url": profile.get("logo_url"), "color": profile.get("primary_color")},
        "booking_ref": str(token).split("-")[0].upper() if token else None,
        "payment": {"status": "paid", "method": "manual", "paid_at": _paid_on(booking)},
        "recipient": {
            "name": f"{booking['parent_first_name']} {booking['parent_last_name']}",
            "email": booking["parent_email"],
            "address": recipient_address(booking),
        },
        "item": {
            "description": f"Camp: {booking['camp_title']} ({period})",
            "participant": f"{booking['child_first_name']} {booking['child_last_name']}",
            "title": f"Camp: {booking['camp_title']}",
            "participant_first": booking["child_first_name"],
        },
        "tax": {
            "status": profile["tax_status"],
            "vat_rate": rate,
            "exemption_text": profile["tax_exemption_text"],
        },
        "net_cents": net,
        "vat_cents": vat,
        "gross_cents": amount,
        "payment_note": "Betrag erhalten. Vielen Dank!",
    }
    invoice = _insert(cur, organization_id, registration_id, data, created_by)
    cur.execute(
        "update camp_registrations set invoice_pending_reason = null, invoice_error = null "
        "where id = %s and organization_id = %s",
        (registration_id, organization_id),
    )
    logger.info("Invoice created (organization_id=%s, number=%s)", organization_id, data["number"])
    return invoice


def create_stornos(registration_id, organization_id, created_by: Optional[str] = None) -> list[dict]:
    """Full storno when the booking is cancelled or refunded and not yet
    stornoed. Idempotent (storno_key = original id + target amount)."""
    try:
        with db.get_cursor() as cur:
            cur.execute(_BOOKING, (registration_id, organization_id))
            booking = cur.fetchone()
            if booking is None:
                return []
            cur.execute(
                f"select {_INVOICE_COLUMNS} from invoices where organization_id = %s and registration_id = %s "
                "and kind = 'invoice'",
                (organization_id, registration_id),
            )
            original = cur.fetchone()
            if original is None:
                return []
            original["data"] = _as_dict(original["data"])
            gross = original["gross_cents"]
            if booking["status"] == "cancelled" or booking["payment_status"] == "refunded":
                target = gross
            else:
                target = 0
            cur.execute(
                """select coalesce(-sum(gross_cents), 0) as gross, coalesce(-sum(net_cents), 0) as net,
                          coalesce(-sum(vat_cents), 0) as vat
                   from invoices where cancels_invoice_id = %s and organization_id = %s""",
                (original["id"], organization_id),
            )
            done = cur.fetchone()
            delta = target - int(done["gross"])
            if delta <= 0:
                return []
            source = original["data"]
            issue = _today()
            sequence = allocate_number(cur, organization_id, issue.year)
            prefix = source["number"].rsplit("-", 2)[0]
            net, vat = storno_split(original, target, int(done["net"]), int(done["vat"]))
            issue_date = original["issue_date"]
            issue_iso = issue_date.isoformat() if isinstance(issue_date, date) else str(issue_date)
            data = {
                **{
                    key: source[key]
                    for key in ("service_period", "issuer", "recipient", "item", "tax", "branding", "booking_ref")
                    if key in source
                },
                "kind": "storno",
                "number": format_number(prefix, issue.year, sequence),
                "year": issue.year,
                "sequence": sequence,
                "issue_date": issue.isoformat(),
                "cancels": {"id": str(original["id"]), "number": original["number"], "issue_date": issue_iso},
                "storno_key": f"{original['id']}:{target}",
                "net_cents": net,
                "vat_cents": vat,
                "gross_cents": -delta,
                "payment_note": (
                    "Der Betrag wird erstattet."
                    if booking["payment_status"] == "refunded"
                    else "Die Buchung wurde storniert."
                ),
            }
            storno = _insert(cur, organization_id, registration_id, data, created_by)
            logger.info("Storno invoice created (organization_id=%s, number=%s)", organization_id, data["number"])
            return [storno]
    except errors.UniqueViolation:
        return []


def _mark_failed(registration_id, organization_id, exc: Exception) -> None:
    """Remember a failed invoice run on the booking: exception class name only."""
    try:
        with db.get_cursor() as cur:
            cur.execute(
                """update camp_registrations set invoice_pending_reason = 'error', invoice_error = %s
                   where id = %s and organization_id = %s""",
                (type(exc).__name__[:100], registration_id, organization_id),
            )
    except Exception:  # noqa: BLE001
        logger.exception("Could not record invoice failure (organization_id=%s)", organization_id)


def sync_registration(registration_id, organization_id, created_by: Optional[str] = None) -> dict:
    """Bring invoices of one booking up to date: invoice when paid, storno for
    cancellation or a full refund. Safe to call repeatedly. Never raises.
    Does not send mail."""
    outcome = {"invoice": None, "created": False, "stornos": 0, "blocked": None, "failed": False}
    try:
        try:
            outcome["invoice"] = create_invoice(registration_id, organization_id, created_by)
            outcome["created"] = outcome["invoice"]["_new"]
        except InvoiceBlocked as blocked:
            if blocked.code not in ("not_paid", "free", MISSING_PROFILE, "not_found"):
                raise
            outcome["blocked"] = blocked.code
        outcome["stornos"] = len(create_stornos(registration_id, organization_id, created_by))
        with db.get_cursor() as cur:
            cur.execute(
                """update camp_registrations set invoice_error = null,
                       invoice_pending_reason = case when invoice_pending_reason = 'error' then null
                                                     else invoice_pending_reason end
                   where id = %s and organization_id = %s and invoice_error is not null""",
                (registration_id, organization_id),
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Invoice sync failed (organization_id=%s)", organization_id)
        _mark_failed(registration_id, organization_id, exc)
        outcome["failed"] = True
    return outcome


PENDING_WHERE = """
    r.organization_id = %s
    and r.payment_status = 'paid'
    and coalesce(r.booked_price_cents, 0) > 0
    and not exists (select 1 from invoices i where i.organization_id = r.organization_id
                    and i.registration_id = r.id and i.kind = 'invoice')
"""

STORNO_PENDING_WHERE = """
    r.organization_id = %s
    and (r.status = 'cancelled' or r.payment_status = 'refunded')
    and exists (
        select 1 from invoices i
        where i.organization_id = r.organization_id and i.registration_id = r.id and i.kind = 'invoice'
          and i.gross_cents
              > coalesce((select -sum(s.gross_cents) from invoices s
                          where s.cancels_invoice_id = i.id and s.organization_id = i.organization_id), 0)
    )
"""


def open_work(cur, organization_id) -> dict:
    """Counts for the admin hint. Unsent mail is always 0 until a mail
    provider exists; it must not keep `remaining` above zero forever."""
    cur.execute(
        f"""select count(*) filter (where r.invoice_pending_reason = 'missing_billing_profile') as missing_profile,
                   count(*) filter (where r.invoice_pending_reason = 'error') as failed,
                   count(*) as invoices
            from camp_registrations r where {PENDING_WHERE}""",
        (organization_id,),
    )
    counts = dict(cur.fetchone())
    cur.execute("select 1 from organization_billing_profiles where organization_id = %s", (organization_id,))
    if cur.fetchone() is not None:
        counts["missing_profile"] = 0
    cur.execute(f"select count(*) as n from camp_registrations r where {STORNO_PENDING_WHERE}", (organization_id,))
    counts["stornos"] = cur.fetchone()["n"]
    counts["unsent_mails"] = 0
    counts["total"] = counts["invoices"] + counts["stornos"]
    return counts


def sync_by_token(registration_token: UUID, organization_id, created_by: Optional[str] = None) -> None:
    """After an admin payment or cancellation. Never raises into that request."""
    try:
        with db.get_cursor() as cur:
            cur.execute(
                "select id from camp_registrations where registration_token = %s and organization_id = %s",
                (registration_token, organization_id),
            )
            row = cur.fetchone()
    except Exception:  # noqa: BLE001
        logger.exception("Invoice sync lookup failed (organization_id=%s)", organization_id)
        return
    if row is None:
        return
    sync_registration(row["id"], organization_id, created_by)
