"""Parent invoices: tax split, PDF content, create/storno idempotency, admin routes.

No real database. create_invoice is exercised against an in-memory cursor so
the PDF renderer and the number allocation run together.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient
from psycopg2.extras import Json

from app import db, invoices
from app.main import app
from app.repositories import camps as camps_repo
from app.repositories import organizations
from app.repositories import registrations as registrations_repo

from .auth_helpers import owner_headers


def _sample(**overrides) -> dict:
    data = {
        "kind": "invoice",
        "number": "KSV-2026-0001",
        "year": 2026,
        "sequence": 1,
        "issue_date": "2026-11-10",
        "service_period": "05.07.2027 - 09.07.2027",
        "issuer": {
            "legal_name": "KSV Baunatal",
            "street": "Am Sportplatz 1",
            "postal_code": "34225",
            "city": "Baunatal",
            "tax_number": "026 123 45678",
            "vat_id": None,
            "invoice_email": "rechnung@example.com",
            "iban": "DE89370400440532013000",
        },
        "branding": {"logo_url": None, "color": "#123456"},
        "booking_ref": "AB12CD34",
        "payment": {"status": "paid", "method": "manual", "paid_at": "2026-11-01"},
        "recipient": {"name": "Max Mustermann", "email": "max@example.com", "address": None},
        "item": {
            "description": "Camp: Sommerwoche (05.07.2027 - 09.07.2027)",
            "participant": "Ayşe Geheim",
            "title": "Camp: Sommerwoche",
            "participant_first": "Ayşe",
        },
        "tax": {"status": "kleinunternehmer", "vat_rate": None, "exemption_text": None},
        "net_cents": 14900,
        "vat_cents": 0,
        "gross_cents": 14900,
        "payment_note": "Betrag erhalten. Vielen Dank!",
    }
    data.update(overrides)
    return data


def test_split_tax_extracts_nineteen_percent_half_up():
    net, vat = invoices.split_tax(11900, "ust_pflichtig", 19)
    assert (net, vat) == (10000, 1900)


def test_split_tax_kleinunternehmer_keeps_gross():
    assert invoices.split_tax(14900, "kleinunternehmer", None) == (14900, 0)


def test_storno_split_of_the_full_amount_cancels_original():
    original = {"gross_cents": 11900, "net_cents": 10000, "vat_cents": 1900, "tax_status": "ust_pflichtig", "vat_rate": 19}
    net, vat = invoices.storno_split(original, 11900, 0, 0)
    assert (net, vat) == (-10000, -1900)
    assert net + vat == -original["gross_cents"]


def test_format_number_pads_sequence_and_keeps_hyphenated_prefix():
    assert invoices.format_number("KSV-BAU", 2026, 7) == "KSV-BAU-2026-0007"


def test_invoice_lines_omit_last_name_birth_date_and_health():
    lines = "\n".join(text for _, text in invoices.invoice_lines(_sample()))
    assert "Ayşe" in lines
    assert "Geheim" not in lines
    assert "2018-05-10" not in lines
    assert "Allergie" not in lines
    assert "Gebühr" not in lines
    assert "Gemäß § 19 UStG" in lines


def test_render_pdf_is_a_pdf_and_omits_the_last_name():
    raw = invoices.render_pdf(_sample(), compress=False)
    # fpdf2 subsets DejaVu, so given names are not stored as raw UTF-8.
    # The invoice number and the letter title stay as literal strings.
    assert raw.startswith(b"%PDF")
    assert b"KSV-2026-0001" in raw
    assert b"Rechnung" in raw
    assert b"Geheim" not in raw
    assert b"2018-05-10" not in raw
    assert b"Allergie" not in raw


class _Flow:
    def __init__(self, booking, profile, existing=None):
        self.booking = booking
        self.profile = profile
        self.existing = existing
        self.inserted = None
        self.pending_reason = None
        self.sql = ""

    def execute(self, sql, params=None):
        self.sql = " ".join(sql.split())
        self.params = params
        if "invoice_pending_reason = %s" in self.sql and self.sql.startswith("update"):
            self.pending_reason = params[0]

    def fetchone(self):
        sql = self.sql
        if "from camp_registrations r" in sql:
            return self.booking
        if "kind = 'invoice'" in sql:
            return self.existing
        if "from organization_billing_profiles" in sql:
            return self.profile
        if "logo_url, primary_color, iban" in sql:
            return {"logo_url": None, "primary_color": "#123456", "iban": None}
        if "organization_invoice_counters" in sql:
            return {"last_number": 1}
        if sql.startswith("insert into invoices"):
            payload = self.params[15].adapted if isinstance(self.params[15], Json) else self.params[15]
            self.inserted = payload
            return {
                "id": uuid4(),
                "organization_id": self.params[0],
                "registration_id": self.params[1],
                "kind": payload["kind"],
                "number": payload["number"],
                "year": payload["year"],
                "sequence": payload["sequence"],
                "cancels_invoice_id": None,
                "issue_date": date.fromisoformat(payload["issue_date"]),
                "net_cents": payload["net_cents"],
                "vat_cents": payload["vat_cents"],
                "gross_cents": payload["gross_cents"],
                "tax_status": payload["tax"]["status"],
                "vat_rate": payload["tax"].get("vat_rate"),
                "recipient_email": payload["recipient"]["email"],
                "data": payload,
                "created_at": datetime.now(timezone.utc),
                "sent_at": None,
                "send_error": None,
                "send_attempts": 0,
            }
        if "invoice_pending_reason = %s" in sql and "update camp_registrations" in sql:
            self.pending_reason = self.params[0]
        return None

    def fetchall(self):
        return []


def _cursor(flow):
    @contextmanager
    def _cm():
        yield flow

    return _cm


def _booking(**overrides):
    token = uuid4()
    row = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "registration_token": token,
        "status": "registered",
        "payment_status": "paid",
        "booked_price_cents": 14900,
        "paid_at": datetime(2026, 11, 1, tzinfo=timezone.utc),
        "parent_first_name": "Max",
        "parent_last_name": "Mustermann",
        "parent_email": "max@example.com",
        "child_first_name": "Ayşe",
        "child_last_name": "Geheim",
        "camp_title": "Sommerwoche",
        "start_date": date(2027, 7, 5),
        "end_date": date(2027, 7, 9),
        "price_cents": 14900,
    }
    row.update(overrides)
    return row


def _profile():
    return {
        "legal_name": "KSV Baunatal",
        "street": "Am Sportplatz 1",
        "postal_code": "34225",
        "city": "Baunatal",
        "tax_number": "026 123 45678",
        "vat_id": None,
        "tax_status": "kleinunternehmer",
        "default_vat_rate": None,
        "tax_exemption_text": None,
        "invoice_number_prefix": "KSV",
        "invoice_email": "rechnung@example.com",
    }


def test_create_invoice_freezes_number_and_omits_the_last_name_from_the_pdf(monkeypatch):
    booking = _booking()
    flow = _Flow(booking, _profile())
    monkeypatch.setattr(db, "get_cursor", _cursor(flow))

    invoice = invoices.create_invoice(booking["id"], booking["organization_id"], created_by="owner-1")

    assert invoice["_new"] is True
    assert invoice["number"].endswith("-0001")
    assert flow.inserted["recipient"]["name"] == "Max Mustermann"
    assert flow.inserted["item"]["participant_first"] == "Ayşe"
    text = "\n".join(line for _, line in invoices.invoice_lines(flow.inserted))
    assert "Geheim" not in text
    assert "Allergie" not in text


def test_create_invoice_returns_the_existing_row(monkeypatch):
    booking = _booking()
    existing = {
        "id": uuid4(),
        "number": "KSV-2026-0004",
        "data": {"recipient": {"name": "Max Mustermann"}},
        "sent_at": None,
        "send_attempts": 0,
    }
    flow = _Flow(booking, _profile(), existing=existing)
    monkeypatch.setattr(db, "get_cursor", _cursor(flow))

    invoice = invoices.create_invoice(booking["id"], booking["organization_id"])

    assert invoice["_new"] is False
    assert invoice["number"] == "KSV-2026-0004"
    assert flow.inserted is None


def test_create_invoice_marks_missing_profile_and_blocks(monkeypatch):
    booking = _booking()
    flow = _Flow(booking, profile=None)
    monkeypatch.setattr(db, "get_cursor", _cursor(flow))

    try:
        invoices.create_invoice(booking["id"], booking["organization_id"])
    except invoices.InvoiceBlocked as blocked:
        assert blocked.code == "missing_billing_profile"
    else:
        raise AssertionError("expected InvoiceBlocked")
    assert flow.pending_reason == "missing_billing_profile"


def test_create_invoice_refuses_unpaid(monkeypatch):
    booking = _booking(payment_status="open")
    flow = _Flow(booking, _profile())
    monkeypatch.setattr(db, "get_cursor", _cursor(flow))
    try:
        invoices.create_invoice(booking["id"], booking["organization_id"])
    except invoices.InvoiceBlocked as blocked:
        assert blocked.code == "not_paid"
    else:
        raise AssertionError("expected InvoiceBlocked")


def test_download_requires_auth():
    with TestClient(app) as client:
        response = client.get(f"/admin/organizations/demo-fc/invoices/{uuid4()}/pdf")
    assert response.status_code == 401


def test_download_unknown_invoice_is_404(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: {"id": org_id, "slug": slug})

    class _Empty:
        def execute(self, sql, params=None):
            self.params = params

        def fetchone(self):
            return None

    @contextmanager
    def _cm():
        yield _Empty()

    monkeypatch.setattr(db, "get_cursor", _cm)
    headers = owner_headers()
    invoice_id = uuid4()
    with TestClient(app) as client:
        response = client.get(f"/admin/organizations/demo-fc/invoices/{invoice_id}/pdf", headers=headers)
    assert response.status_code == 404


def test_marking_paid_syncs_the_invoice(monkeypatch):
    org = {"id": uuid4(), "slug": "demo-fc"}
    camp = {"id": uuid4()}
    registration_token = uuid4()
    updated = {
        "id": uuid4(),
        "registration_token": registration_token,
        "status": "registered",
        "payment_status": "paid",
        "parent_first_name": "Max",
        "parent_last_name": "Mustermann",
        "parent_email": "max@example.com",
        "parent_phone": "+49 123",
        "child_first_name": "Lena",
        "child_last_name": "Mustermann",
        "child_birth_date": "2018-05-10",
        "emergency_contact_name": None,
        "emergency_contact_phone": None,
        "medical_notes": None,
        "allergies": None,
        "photo_permission": False,
        "created_at": datetime(2026, 11, 1, tzinfo=timezone.utc),
    }
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)
    monkeypatch.setattr(camps_repo, "get_camp_by_slug", lambda org_id, slug: camp)
    monkeypatch.setattr(registrations_repo, "update_payment_status", lambda *args: updated)
    calls = []
    monkeypatch.setattr(
        invoices,
        "sync_by_token",
        lambda token, organization_id, created_by=None: calls.append((token, organization_id, created_by)),
    )
    headers = owner_headers()
    with TestClient(app) as client:
        response = client.patch(
            f"/admin/organizations/demo-fc/camps/summer-1/registrations/{registration_token}/payment-status",
            json={"payment_status": "paid"},
            headers=headers,
        )
    assert response.status_code == 200
    assert calls == [(registration_token, org["id"], "owner-1")]


def test_create_endpoint_maps_missing_profile_to_409(monkeypatch):
    org = {"id": uuid4(), "slug": "demo-fc"}
    token = uuid4()
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: org)

    class _Reg:
        def execute(self, sql, params=None):
            self.sql = sql

        def fetchone(self):
            return {"id": uuid4(), "payment_status": "paid", "invoice_pending_reason": None, "booked_price_cents": 1000, "status": "registered"}

    @contextmanager
    def _cm():
        yield _Reg()

    monkeypatch.setattr(db, "get_cursor", _cm)

    def _blocked(*args, **kwargs):
        raise invoices.InvoiceBlocked("missing_billing_profile")

    monkeypatch.setattr(invoices, "create_invoice", _blocked)
    headers = owner_headers()
    with TestClient(app) as client:
        response = client.post(f"/admin/organizations/demo-fc/registrations/{token}/invoice", headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "missing_billing_profile"
