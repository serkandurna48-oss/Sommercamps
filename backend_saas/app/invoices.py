"""
Parent invoices in the club's name (billing B3, migration 20261107100000).

- One invoice per paid booking, created automatically after an online payment
  (webhook, Express and legacy) or when the club marks a booking paid. Free
  bookings get none.
- Issuer = the club's billing master data, frozen into the invoice. Without
  master data no invoice is created; the booking is marked
  invoice_pending_reason='missing_billing_profile' and can be invoiced later.
- Numbers: <prefix><year>-<0001>, per club and calendar year (Europe/Berlin),
  gapless: the counter row is incremented in the same transaction as the
  invoice insert (rollback = no gap, row lock = no duplicate).
- Storno invoices (negative, own number, reference to the original) for every
  refunded amount and for cancelled paid bookings. Idempotent per cumulative
  stornoed amount.
- Invoices are immutable (DB trigger). The platform fee never appears.
- Only data the service description needs: no birth date, no health data.
"""

from __future__ import annotations

import logging
from pathlib import Path
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg2.extras import Json

from . import db

logger = logging.getLogger(__name__)
# fpdf2 subsets the embedded font with fontTools, which logs every step at INFO.
logging.getLogger("fontTools").setLevel(logging.WARNING)
BERLIN = ZoneInfo("Europe/Berlin")
PAID_STATES = ("paid", "partially_refunded", "refunded")
MISSING_PROFILE = "missing_billing_profile"


class InvoiceBlocked(Exception):
    """Invoice cannot be created now (code: missing_billing_profile, not_paid, free)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


# ---------------------------------------------------------------------------
# Amounts
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Data snapshot and PDF
# ---------------------------------------------------------------------------

_TAX_NOTE = {
    "kleinunternehmer": "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).",
}


def invoice_lines(data: dict) -> list[tuple[str, str]]:
    """Text content of the PDF as (style, text) lines. Single source for the
    renderer and for tests (fpdf compresses page streams)."""
    issuer, recipient, item = data["issuer"], data["recipient"], data["item"]
    storno = data["kind"] == "storno"
    lines: list[tuple[str, str]] = [
        ("issuer_name", issuer["legal_name"]),
        ("small", f"{issuer['street']}, {issuer['postal_code']} {issuer['city']}"),
    ]
    if issuer.get("tax_number"):
        lines.append(("small", f"Steuernummer: {issuer['tax_number']}"))
    if issuer.get("vat_id"):
        lines.append(("small", f"USt-IdNr.: {issuer['vat_id']}"))
    lines.append(("small", f"E-Mail: {issuer['invoice_email']}"))
    lines += [
        ("gap", ""),
        ("label", "Rechnungsempfänger"),
        ("text", recipient["name"]),
    ]
    if recipient.get("address"):
        # One line per address line ("street\npostal_code city" since 20261107130000).
        lines += [("text", part) for part in str(recipient["address"]).split("\n") if part.strip()]
    lines.append(("text", recipient["email"]))
    lines += [
        ("gap", ""),
        ("title", "Stornorechnung" if storno else "Rechnung"),
        ("text", f"Rechnungsnummer: {data['number']}"),
        ("text", f"Rechnungsdatum: {_de_date(date.fromisoformat(data['issue_date']))}"),
        ("text", f"Leistungszeitraum: {data['service_period']}"),
    ]
    if storno:
        lines.append(("text", f"Storno zu Rechnung {data['cancels']['number']} vom "
                              f"{_de_date(date.fromisoformat(data['cancels']['issue_date']))}"))
    lines += [
        ("gap", ""),
        ("label", "Leistung"),
        ("text", item["description"]),
        ("text", f"Teilnehmer/in: {item['participant']}"),
        ("text", f"Betrag: {euro(data['gross_cents'])}"),
        ("gap", ""),
    ]
    tax = data["tax"]
    if tax["status"] == "ust_pflichtig":
        lines += [
            ("text", f"Nettobetrag: {euro(data['net_cents'])}"),
            ("text", f"Umsatzsteuer {tax['vat_rate']} %: {euro(data['vat_cents'])}"),
            ("total", f"Gesamtbetrag: {euro(data['gross_cents'])}"),
        ]
    else:
        lines.append(("total", f"Gesamtbetrag: {euro(data['gross_cents'])}"))
        note = _TAX_NOTE.get(tax["status"]) or tax.get("exemption_text") or ""
        if note:
            lines.append(("small", note))
    lines += [
        ("gap", ""),
        ("small", data["payment_note"]),
        ("small", f"Rechnung im Namen und für Rechnung von {issuer['legal_name']}, erstellt mit CampsPilot."),
    ]
    return lines


FONT_DIR = Path(__file__).resolve().parent / "fonts"  # DejaVu Sans, see fonts/LICENSE-DejaVu.txt


def render_pdf(data: dict, compress: bool = True) -> bytes:
    from fpdf import FPDF

    pdf = FPDF(format="A4")
    pdf.set_compression(compress)
    # Unicode TTF (embedded subset): names like Ayşe, Łukasz, Çelik render correctly.
    pdf.add_font("DejaVu", "", str(FONT_DIR / "DejaVuSans.ttf"))
    pdf.add_font("DejaVu", "B", str(FONT_DIR / "DejaVuSans-Bold.ttf"))
    pdf.set_title(f"{'Stornorechnung' if data['kind'] == 'storno' else 'Rechnung'} {data['number']}")
    pdf.set_author(data["issuer"]["legal_name"])
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    styles = {
        "issuer_name": ("B", 13, 7), "small": ("", 9, 5), "label": ("B", 10, 6), "text": ("", 11, 6),
        "title": ("B", 16, 10), "total": ("B", 12, 8),
    }
    for style, text in invoice_lines(data):
        if style == "gap":
            pdf.ln(5)
            continue
        weight, size, height = styles[style]
        pdf.set_font("DejaVu", weight, size)
        pdf.multi_cell(0, height, text, new_x="LMARGIN", new_y="NEXT")
    return bytes(pdf.output())


def recipient_address(booking: dict) -> Optional[str]:
    """Two-line address block, or None when the booking has no complete address."""
    street, postal_code, city = (booking.get(k) for k in ("parent_street", "parent_postal_code", "parent_city"))
    if not (street and postal_code and city):
        return None
    return f"{street}\n{postal_code} {city}"


def _service_period(start: date, end: date) -> str:
    return _de_date(start) if start == end else f"{_de_date(start)} - {_de_date(end)}"


# ---------------------------------------------------------------------------
# Create invoice / storno
# ---------------------------------------------------------------------------

_BOOKING = """
    select r.id, r.organization_id, r.status, r.payment_status, r.fee_snapshot_at, r.fee_base_cents,
           r.applied_price_cents, r.booked_price_cents, r.stripe_payment_intent_id, r.stripe_checkout_amount_cents,
           r.refunded_cents, r.paid_at,
           r.parent_first_name, r.parent_last_name, r.parent_email,
           r.parent_street, r.parent_postal_code, r.parent_city,
           r.child_first_name, r.child_last_name,
           c.title as camp_title, c.start_date, c.end_date, c.price_cents, c.offer_id
    from camp_registrations r
    join camps c on c.id = r.camp_id and c.organization_id = r.organization_id
    where r.id = %s and r.organization_id = %s
    for update of r
"""

_INVOICE_COLUMNS = """id, organization_id, registration_id, kind, number, year, sequence, cancels_invoice_id,
    issue_date, net_cents, vat_cents, gross_cents, tax_status, vat_rate, recipient_email, data,
    created_at, sent_at, send_error, send_attempts"""


def _paid_amount(booking: dict) -> int:
    if booking.get("fee_base_cents") is not None:
        return int(booking["fee_base_cents"])  # exactly what was paid (checkout amount or owed price)
    for key in ("stripe_checkout_amount_cents", "applied_price_cents", "booked_price_cents", "price_cents"):
        if booking.get(key) is not None:
            return int(booking[key])
    return 0


def _insert(cur, organization_id, registration_id, data: dict, created_by: Optional[str]) -> dict:
    cur.execute(
        f"""insert into invoices (organization_id, registration_id, kind, number, year, sequence,
                cancels_invoice_id, storno_key, issue_date, net_cents, vat_cents, gross_cents, tax_status,
                vat_rate, recipient_email, data, pdf, created_by)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            returning {_INVOICE_COLUMNS}""",
        (organization_id, registration_id, data["kind"], data["number"], data["year"], data["sequence"],
         data.get("cancels", {}).get("id"), data.get("storno_key"), data["issue_date"], data["net_cents"],
         data["vat_cents"], data["gross_cents"], data["tax"]["status"], data["tax"].get("vat_rate"),
         data["recipient"]["email"], Json(data), render_pdf(data), created_by),
    )
    return cur.fetchone()


def _today() -> date:
    return datetime.now(timezone.utc).astimezone(BERLIN).date()


def create_invoice(registration_id, organization_id, created_by: Optional[str] = None) -> dict:
    """The booking's invoice; creates it once. Raises InvoiceBlocked."""
    with db.get_cursor() as cur:
        cur.execute(_BOOKING, (registration_id, organization_id))
        booking = cur.fetchone()
        if booking is None:
            raise InvoiceBlocked("not_found")
        cur.execute(f"select {_INVOICE_COLUMNS} from invoices where organization_id = %s and registration_id = %s "
                    "and kind = 'invoice'", (organization_id, registration_id))
        existing = cur.fetchone()
        if existing:
            return {**existing, "_new": False}
        if booking["payment_status"] not in PAID_STATES or booking["fee_snapshot_at"] is None:
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
        if profile is None:
            # Commit the pending mark (raising inside this block would roll it back).
            cur.execute("update camp_registrations set invoice_pending_reason = %s where id = %s",
                        (MISSING_PROFILE, registration_id))
        else:
            return {**_issue(cur, booking, profile, amount, organization_id, registration_id, created_by), "_new": True}
    raise InvoiceBlocked(MISSING_PROFILE)


def _issue(cur, booking: dict, profile: dict, amount: int, organization_id, registration_id,
           created_by: Optional[str]) -> dict:
    """Number, freeze the issuer data, render and store (caller holds the booking lock)."""
    issue = _today()
    sequence = allocate_number(cur, organization_id, issue.year)
    rate = profile["default_vat_rate"] if profile["tax_status"] == "ust_pflichtig" else None
    net, vat = split_tax(amount, profile["tax_status"], rate)
    online = booking["stripe_payment_intent_id"] is not None
    data: dict[str, Any] = {
        "kind": "invoice",
        "number": format_number(profile["invoice_number_prefix"], issue.year, sequence),
        "year": issue.year, "sequence": sequence,
        "issue_date": issue.isoformat(),
        "service_period": _service_period(booking["start_date"], booking["end_date"]),
        "issuer": {k: profile[k] for k in ("legal_name", "street", "postal_code", "city", "tax_number",
                                           "vat_id", "invoice_email")},
        # Billing address collected for paid bookings since 20261107130000; older
        # bookings have none (name + email only, as before).
        "recipient": {"name": f"{booking['parent_first_name']} {booking['parent_last_name']}",
                      "email": booking["parent_email"], "address": recipient_address(booking)},
        "item": {
            "description": f"{'Training' if booking['offer_id'] else 'Camp'}: {booking['camp_title']} "
                           f"({_service_period(booking['start_date'], booking['end_date'])})",
            "participant": f"{booking['child_first_name']} {booking['child_last_name']}",
        },
        "tax": {"status": profile["tax_status"], "vat_rate": rate,
                "exemption_text": profile["tax_exemption_text"]},
        "net_cents": net, "vat_cents": vat, "gross_cents": amount,
        "payment_note": ("Betrag per Online-Zahlung erhalten. Vielen Dank!" if online
                         else "Betrag erhalten. Vielen Dank!"),
    }
    invoice = _insert(cur, organization_id, registration_id, data, created_by)
    cur.execute("update camp_registrations set invoice_pending_reason = null where id = %s", (registration_id,))
    logger.info("Invoice created (organization_id=%s, number=%s)", organization_id, data["number"])
    return invoice


def create_stornos(registration_id, organization_id, created_by: Optional[str] = None) -> list[dict]:
    """Storno for whatever was refunded or cancelled and is not stornoed yet.
    Target = full amount when the booking is cancelled or fully refunded,
    else the refunded amount. Idempotent (storno_key = original + target)."""
    with db.get_cursor() as cur:
        cur.execute(_BOOKING, (registration_id, organization_id))  # same lock order as create_invoice
        booking = cur.fetchone()
        if booking is None:
            return []
        cur.execute(f"select {_INVOICE_COLUMNS} from invoices where organization_id = %s and registration_id = %s "
                    "and kind = 'invoice'", (organization_id, registration_id))
        original = cur.fetchone()
        if original is None:
            return []
        gross = original["gross_cents"]
        if booking["status"] == "cancelled" or booking["payment_status"] == "refunded":
            target = gross
        else:
            target = min(gross, int(booking["refunded_cents"] or 0))
        cur.execute(
            """select coalesce(-sum(gross_cents), 0) as gross, coalesce(-sum(net_cents), 0) as net,
                      coalesce(-sum(vat_cents), 0) as vat
               from invoices where cancels_invoice_id = %s""",
            (original["id"],),
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
        data = {
            **{k: source[k] for k in ("service_period", "issuer", "recipient", "item", "tax")},
            "kind": "storno",
            "number": format_number(prefix, issue.year, sequence),
            "year": issue.year, "sequence": sequence,
            "issue_date": issue.isoformat(),
            "cancels": {"id": str(original["id"]), "number": original["number"],
                        "issue_date": original["issue_date"].isoformat()},
            "storno_key": f"{original['id']}:{target}",
            "net_cents": net, "vat_cents": vat, "gross_cents": -delta,
            "payment_note": ("Der Betrag wird erstattet." if booking["payment_status"] in ("refunded", "partially_refunded")
                             else "Die Buchung wurde storniert."),
        }
        storno = _insert(cur, organization_id, registration_id, data, created_by)
        logger.info("Storno invoice created (organization_id=%s, number=%s)", organization_id, data["number"])
        return [storno]


# ---------------------------------------------------------------------------
# Mail
# ---------------------------------------------------------------------------

def _invoice_mail(invoice: dict, pdf: bytes):
    from html import escape

    from .notifications.mail import MailAttachment, MailMessage

    data = invoice["data"]
    storno = invoice["kind"] == "storno"
    issuer = data["issuer"]["legal_name"]
    title = "Stornorechnung" if storno else "Rechnung"
    body = (
        f"<p>Guten Tag {escape(data['recipient']['name'])},</p>"
        f"<p>anbei erhalten Sie die {title} <strong>{escape(invoice['number'])}</strong> von "
        f"{escape(issuer)} für {escape(data['item']['description'])}.</p>"
        + (f"<p>Sie bezieht sich auf die Rechnung {escape(data['cancels']['number'])}.</p>" if storno else "")
        + f"<p>Bei Fragen zur Rechnung wenden Sie sich bitte an {escape(data['issuer']['invoice_email'])}.</p>"
        f"<p>Viele Grüße<br>{escape(issuer)}</p>"
    )
    return MailMessage(
        to_email=invoice["recipient_email"],
        subject=f"{title} {invoice['number']} – {issuer}",
        html_content=body,
        reply_to=data["issuer"]["invoice_email"],
        sender_name=f"{issuer} über CampsPilot",
        attachments=[MailAttachment(filename=f"{invoice['number']}.pdf", content=pdf)],
    )


def send_invoice(invoice_id, organization_id, force: bool = False) -> bool:
    """Mail the invoice PDF to the parent. The send is claimed atomically
    first (sent_at set in one UPDATE), so two parallel syncs never mail the
    same invoice twice; on failure the claim is released and the error
    code recorded. force=True (admin resend) mails again and raises on
    failure. Returns True when delivered."""
    from .notifications.mail import get_provider
    from .notifications.sending import _error_code

    with db.get_cursor() as cur:
        cur.execute(
            f"""update invoices set sent_at = now(), send_attempts = send_attempts + 1
                where id = %s and organization_id = %s and (sent_at is null or %s)
                returning {_INVOICE_COLUMNS}, pdf""",
            (invoice_id, organization_id, force),
        )
        invoice = cur.fetchone()
    if invoice is None:
        return False  # unknown, or already sent / being sent by another worker
    provider = get_provider()
    try:
        provider.send(_invoice_mail(invoice, bytes(invoice["pdf"])))
    except Exception as exc:  # noqa: BLE001 - recorded, never breaks the booking
        logger.warning("Invoice mail failed (organization_id=%s)", organization_id)
        with db.get_cursor() as cur:
            cur.execute("update invoices set sent_at = null, send_error = %s where id = %s",
                        (_error_code(exc), invoice_id))
        if force:
            raise
        return False
    delivered = bool(getattr(provider, "delivers", True))
    with db.get_cursor() as cur:
        cur.execute(
            """update invoices set send_error = null,
                   sent_at = case when %s then sent_at else null end
               where id = %s""",
            (delivered, invoice_id),
        )
    return delivered


# ---------------------------------------------------------------------------
# Follow-ups (best effort; never raise into payment or admin flows)
# ---------------------------------------------------------------------------

# A paid booking that should have an invoice and has none - whatever the
# marker says (failed background task, restart, missing master data).
PENDING_WHERE = """
    r.organization_id = %s
    and r.fee_snapshot_at is not null
    and r.payment_status in ('paid', 'partially_refunded', 'refunded')
    and coalesce(r.fee_base_cents, 0) > 0
    and not exists (select 1 from invoices i where i.organization_id = r.organization_id
                    and i.registration_id = r.id and i.kind = 'invoice')
"""

# Invoiced booking whose refund or cancellation is not fully stornoed yet.
STORNO_PENDING_WHERE = """
    r.organization_id = %s
    and exists (
        select 1 from invoices i
        where i.organization_id = r.organization_id and i.registration_id = r.id and i.kind = 'invoice'
          and (case when r.status = 'cancelled' or r.payment_status = 'refunded' then i.gross_cents
                    else least(i.gross_cents, coalesce(r.refunded_cents, 0)) end)
              > coalesce((select -sum(s.gross_cents) from invoices s where s.cancels_invoice_id = i.id), 0)
    )
"""

# Mails that never reached the parent (failed or interrupted); retried by generate-pending.
UNSENT_WHERE = "organization_id = %s and sent_at is null and send_attempts < 5"


def _mark_failed(registration_id, organization_id, exc: Exception) -> None:
    """Remember a failed invoice run on the booking: reason code only, no data."""
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
    refunds/cancellation, mail every unsent document. Safe to call
    repeatedly (webhook replays, generate-pending). Never raises."""
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
            cur.execute(f"select id from invoices where registration_id = %s and {UNSENT_WHERE} order by sequence",
                        (registration_id, organization_id))
            unsent = [row["id"] for row in cur.fetchall()]
    except Exception as exc:  # noqa: BLE001
        logger.exception("Invoice sync failed (organization_id=%s)", organization_id)
        _mark_failed(registration_id, organization_id, exc)
        outcome["failed"] = True
        return outcome
    for invoice_id in unsent:
        try:
            send_invoice(invoice_id, organization_id)
        except Exception:  # noqa: BLE001
            logger.exception("Invoice mail step failed (organization_id=%s)", organization_id)
    return outcome


def open_work(cur, organization_id) -> dict:
    """Counts for the admin hint: bookings without invoice (by reason),
    open stornos, unsent mails."""
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
        counts["missing_profile"] = 0  # completed meanwhile: "Rechnungen erzeugen" can do them now
    cur.execute(f"select count(*) as n from camp_registrations r where {STORNO_PENDING_WHERE}", (organization_id,))
    counts["stornos"] = cur.fetchone()["n"]
    cur.execute(f"select count(*) as n from invoices where {UNSENT_WHERE}", (organization_id,))
    counts["unsent_mails"] = cur.fetchone()["n"]
    counts["total"] = counts["invoices"] + counts["stornos"] + counts["unsent_mails"]
    return counts


def sync_by_token(registration_token: UUID, organization_id) -> None:
    """Background task after admin actions; never raises."""
    try:
        with db.get_cursor() as cur:
            cur.execute("select id from camp_registrations where registration_token = %s and organization_id = %s",
                        (registration_token, organization_id))
            row = cur.fetchone()
    except Exception:  # noqa: BLE001
        logger.exception("Invoice sync lookup failed (organization_id=%s)", organization_id)
        return
    if row:
        sync_registration(row["id"], organization_id)
