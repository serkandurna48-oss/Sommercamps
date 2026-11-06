"""Billing B3: parent invoices, numbering, tax variants, PDF, storno, mail.

Real disposable Postgres (REVIEW_POSTGRES_PORT), Stripe mocked, fake mail
provider; synthetic data only.
"""

from __future__ import annotations

import threading
import time
from datetime import date
from uuid import uuid4

import psycopg2
import pytest
from psycopg2.extras import RealDictCursor

from app import invoices
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import platform_stats
from app.routers import payments
from .auth_helpers import org_admin_headers, owner_headers
from .test_billing_stripe_express import (  # noqa: F401
    CONNECT_HOOK, LEGACY, PLATFORM_HOOK, PLATFORM_SECRET, CONNECT_SECRET, _activate_express, _activate_legacy,
    _charge_refunded, _checkout, _completed, _fee_month, _org, _paid_destination, _post_webhook, _refund, _reg,
    _register, env,
)
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import fake_provider  # noqa: F401


class DeliveringFake(FakeProvider):
    delivers = True

    @property
    def invoices(self):
        """Only invoice mails (registration confirmations go through the same provider)."""
        return [m for m in self.sent if m.attachments]


class FailingProvider:
    delivers = True

    def __init__(self):
        self.calls = 0

    def send(self, message):
        self.calls += 1
        raise RuntimeError("boom")


@pytest.fixture
def mail():
    provider = DeliveringFake()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


PROFILE = dict(legal_name="Testverein e.V.", street="Am Sportplatz 3", postal_code="34117", city="Kassel",
               tax_number="026 123 45678", vat_id=None, tax_status="ust_pflichtig", default_vat_rate=19,
               tax_exemption_text=None, invoice_number_prefix="TV-", invoice_email="rechnung@example.com")


def _profile(env, org=None, **over):
    values = {**PROFILE, **over}
    with env.cursor() as cur:
        cur.execute("delete from organization_billing_profiles where organization_id=%s", (org or env.org,))
        cur.execute(f"insert into organization_billing_profiles (organization_id, {', '.join(values)}) "
                    f"values (%s, {', '.join(['%s'] * len(values))})", (org or env.org, *values.values()))


def _invoices(env, token):
    with env.cursor() as cur:
        cur.execute("""select i.* from invoices i join camp_registrations r on r.id = i.registration_id
                       where r.registration_token = %s order by i.year, i.sequence""", (token,))
        return cur.fetchall()


def _pay_manually(env, token, status="paid"):
    r = env.client.patch(f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/payment-status",
                         headers=env.admin(), json={"payment_status": status})
    assert r.status_code == 200, r.text


# ---------- amounts and numbering (pure) ----------

@pytest.mark.parametrize("gross,status,rate,expected", [
    (14900, "ust_pflichtig", 19, (12521, 2379)),  # 12521.008
    (14900, "ust_pflichtig", 7, (13925, 975)),    # 13925.23
    (1000, "ust_pflichtig", 19, (840, 160)),      # 840.34
    (119, "ust_pflichtig", 19, (100, 19)),
    (5, "ust_pflichtig", 19, (4, 1)),             # 4.20 -> 4
    (-1000, "ust_pflichtig", 19, (-840, -160)),   # storno mirrors the original
    (14900, "kleinunternehmer", None, (14900, 0)),
    (14900, "steuerbefreit", None, (14900, 0)),
])
def test_split_tax(gross, status, rate, expected):
    assert invoices.split_tax(gross, status, rate) == expected
    net, vat = invoices.split_tax(gross, status, rate)
    assert net + vat == gross


def test_number_format():
    assert invoices.format_number("JK-", 2026, 1) == "JK-2026-0001"
    assert invoices.format_number("JK", 2026, 12) == "JK-2026-0012"
    assert invoices.euro(-123456) == "-1.234,56 EUR"


def _data(**over):
    base = {
        "kind": "invoice", "number": "TV-2026-0001", "year": 2026, "sequence": 1, "issue_date": "2026-11-07",
        "service_period": "05.07.2027 - 09.07.2027",
        "issuer": {"legal_name": "Testverein e.V.", "street": "Am Sportplatz 3", "postal_code": "34117",
                   "city": "Kassel", "tax_number": "026 123 45678", "vat_id": None,
                   "invoice_email": "rechnung@example.com"},
        "recipient": {"name": "Max Mustermann", "email": "max@example.com", "address": None},
        "item": {"description": "Camp: Sommercamp (05.07.2027 - 09.07.2027)", "participant": "Lena Mustermann"},
        "tax": {"status": "ust_pflichtig", "vat_rate": 19, "exemption_text": None},
        "net_cents": 12521, "vat_cents": 2379, "gross_cents": 14900, "payment_note": "Betrag erhalten. Vielen Dank!",
    }
    base.update(over)
    return base


def _pdf_text(data) -> bytes:
    return invoices.render_pdf(data, compress=False)


def test_pdf_contains_the_required_fields_only():
    pdf = _pdf_text(_data())
    assert pdf.startswith(b"%PDF")
    for needle in ("Rechnung", "TV-2026-0001", "Testverein e.V.", "Am Sportplatz 3", "34117 Kassel",
                   "Steuernummer: 026 123 45678", "Max Mustermann", "max@example.com", "Lena Mustermann",
                   "Rechnungsdatum: 07.11.2026", "Leistungszeitraum: 05.07.2027 - 09.07.2027",
                   "Nettobetrag: 125,21 EUR", "Umsatzsteuer 19 %: 23,79 EUR", "Gesamtbetrag: 149,00 EUR"):
        assert needle.encode("latin-1") in pdf, needle
    text = " ".join(t for _, t in invoices.invoice_lines(_data()))
    for forbidden in ("Gebühr", "Plattformgebühr", "2017", "Allerg", "Geburt"):
        assert forbidden not in text
    assert invoices.render_pdf(_data()).startswith(b"%PDF")  # compressed default


def test_pdf_tax_variants():
    klein = " ".join(t for _, t in invoices.invoice_lines(_data(
        tax={"status": "kleinunternehmer", "vat_rate": None, "exemption_text": None}, net_cents=14900, vat_cents=0)))
    assert "§ 19 UStG" in klein and "Umsatzsteuer" not in klein.replace("keine Umsatzsteuer", "")
    frei = " ".join(t for _, t in invoices.invoice_lines(_data(
        tax={"status": "steuerbefreit", "vat_rate": None, "exemption_text": "Steuerfrei nach § 4 Nr. 22 b UStG"},
        net_cents=14900, vat_cents=0)))
    assert "Steuerfrei nach § 4 Nr. 22 b UStG" in frei and "Nettobetrag" not in frei
    storno = _pdf_text(_data(kind="storno", number="TV-2026-0002", gross_cents=-14900, net_cents=-12521,
                             vat_cents=-2379, cancels={"id": "x", "number": "TV-2026-0001", "issue_date": "2026-11-07"}))
    assert b"Stornorechnung" in storno and b"Storno zu Rechnung TV-2026-0001 vom 07.11.2026" in storno
    assert b"-149,00 EUR" in storno
    # Typography outside Latin-1 does not break the PDF.
    assert _pdf_text(_data(item={"description": "Camp – „Spezial“ €", "participant": "Zoë Łukasz"})).startswith(b"%PDF")


# ---------- numbering against Postgres ----------

def _connect(local_database):
    conn = psycopg2.connect(cursor_factory=RealDictCursor, **local_database)
    return conn


def test_numbers_are_gapless_under_concurrency_and_rollback(env, local_database):
    results, errors = [], []
    barrier = threading.Barrier(8)

    def worker():
        conn = _connect(local_database)
        try:
            with conn, conn.cursor() as cur:
                barrier.wait()
                results.append(invoices.allocate_number(cur, env.org, 2031))
                time.sleep(0.01)
        except Exception as exc:  # pragma: no cover
            errors.append(exc)
        finally:
            conn.close()

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert errors == [] and sorted(results) == list(range(1, 9))
    # A transaction that fails after taking a number gives it back.
    conn = _connect(local_database)
    try:
        with pytest.raises(RuntimeError):
            with conn, conn.cursor() as cur:
                assert invoices.allocate_number(cur, env.org, 2031) == 9
                raise RuntimeError("insert failed")
    finally:
        conn.close()
    with env.cursor() as cur:
        assert invoices.allocate_number(cur, env.org, 2031) == 9
        assert invoices.allocate_number(cur, env.other, 2031) == 1  # per club
        assert invoices.allocate_number(cur, env.org, 2032) == 1  # per year


def test_concurrent_invoices_get_consecutive_numbers(env, mail):
    _profile(env)
    tokens = [_register(env) for _ in range(4)]
    for token in tokens:
        _pay_manually(env, token)  # background task creates the invoice
    numbers = sorted(i["number"] for t in tokens for i in _invoices(env, t))
    year = date.today().year
    assert numbers == [f"TV-{year}-{n:04d}" for n in range(1, 5)]
    # Parallel calls for one booking: still one invoice.
    token = _register(env)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set payment_status='paid', fee_snapshot_at=now(), fee_plan='starter', "
                    "fee_percent=6.9, fee_base_cents=1000, fee_cents=69, fee_collection='not_collected' "
                    "where registration_token=%s returning id", (token,))
        rid = cur.fetchone()["id"]
    threads = [threading.Thread(target=invoices.sync_registration, args=(rid, env.org)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(_invoices(env, token)) == 1
    assert _invoices(env, token)[0]["number"] == f"TV-{year}-0005"


# ---------- automatic invoice: manual payment ----------

def test_manual_payment_creates_invoice_and_mails_pdf(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    assert (invoice["kind"], invoice["gross_cents"], invoice["net_cents"], invoice["vat_cents"]) == (
        "invoice", 1000, 840, 160)
    assert invoice["sent_at"] is not None and invoice["send_attempts"] == 1
    (message,) = mail.invoices
    assert message.to_email == "max@example.com" and invoice["number"] in message.subject
    (attachment,) = message.attachments
    assert attachment.filename == f"{invoice['number']}.pdf" and attachment.content.startswith(b"%PDF")
    assert attachment.content == bytes(invoice["pdf"])
    assert "Sie" in message.html_content and "Gebühr" not in message.html_content
    assert message.reply_to == "rechnung@example.com"
    # Paid again (undo + redo): no second invoice, no second mail.
    _pay_manually(env, token, "open")
    _pay_manually(env, token)
    assert len(_invoices(env, token)) == 1 and len(mail.invoices) == 1


def test_free_booking_gets_no_invoice(env, mail):
    _profile(env)
    with env.cursor() as cur:
        cur.execute("update camps set price_cents=0 where organization_id=%s", (env.org,))
    token = _register(env)
    _pay_manually(env, token)
    assert _invoices(env, token) == [] and mail.invoices == []


def test_invoice_uses_booked_price_after_camp_price_change(env, mail):
    _profile(env, tax_status="kleinunternehmer", default_vat_rate=None)
    token = _register(env)
    with env.cursor() as cur:
        cur.execute("update camps set price_cents=2000 where organization_id=%s", (env.org,))
    assert _reg(env, token)["booked_price_cents"] == 1000
    _pay_manually(env, token)
    row = _reg(env, token)
    assert row["fee_base_cents"] == 1000
    (invoice,) = _invoices(env, token)
    assert (invoice["gross_cents"], invoice["vat_cents"], invoice["tax_status"]) == (1000, 0, "kleinunternehmer")
    # Online checkout charges the booked price too.
    _activate_legacy(env)
    token2 = _register(env)
    with env.cursor() as cur:
        cur.execute("update camps set price_cents=3000 where organization_id=%s", (env.org,))
    assert _checkout(env, token2).status_code == 200
    assert env.fake.named("Session.create")[-1][1]["line_items"][0]["price_data"]["unit_amount"] == 2000


# ---------- automatic invoice: online payment ----------

def test_express_webhook_creates_one_invoice_even_on_replay(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    event = _completed(session_id, intent=env.intent)
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).status_code == 200
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).status_code == 200
    (invoice,) = _invoices(env, token)
    assert invoice["gross_cents"] == 1000 and "Online-Zahlung" in invoice["data"]["payment_note"]
    assert len(mail.invoices) == 1
    assert "fee" not in str(invoice["data"]).lower()


def test_legacy_webhook_creates_invoice(env, mail):
    _profile(env)
    _activate_legacy(env)
    token = _register(env)
    _checkout(env, token)
    session_id = _reg(env, token)["stripe_checkout_session_id"]
    event = {**_completed(session_id, intent=env.intent), "account": LEGACY}
    env.fake.charge = {"refunded": False, "amount_refunded": 0, "amount": 1000}
    r = _post_webhook(env, CONNECT_HOOK, event, CONNECT_SECRET)
    assert r.json() == {"received": True, "settled": True}
    assert [i["kind"] for i in _invoices(env, token)] == ["invoice"]


def test_mail_failure_does_not_touch_booking_and_resend_works(env):
    failing = FailingProvider()
    reset_provider_for_testing(failing)
    try:
        _profile(env)
        token = _register(env)
        _pay_manually(env, token)
        (invoice,) = _invoices(env, token)
        assert invoice["sent_at"] is None and invoice["send_error"] and _reg(env, token)["payment_status"] == "paid"
        path = f"/admin/organizations/{env.slug}/invoices/{invoice['id']}/resend"
        assert env.client.post(path, headers=env.admin()).status_code == 502
        good = DeliveringFake()
        reset_provider_for_testing(good)
        r = env.client.post(path, headers=env.admin())
        assert r.status_code == 200 and r.json()["sent_at"] is not None and r.json()["send_error"] is None
        assert len(good.invoices) == 1
        # Resend is explicit: a second resend sends again.
        env.client.post(path, headers=env.admin())
        assert len(good.invoices) == 2
    finally:
        reset_provider_for_testing(None)


# ---------- storno ----------

def test_partial_and_full_refund_create_storno_invoices(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    _refund(env, token, 400)
    assert _charge_refunded(env, 400, 20).status_code == 200
    assert _charge_refunded(env, 400, 20).status_code == 200  # replay
    docs = _invoices(env, token)
    assert [(d["kind"], d["gross_cents"]) for d in docs] == [("invoice", 1000), ("storno", -400)]
    storno = docs[1]
    assert storno["cancels_invoice_id"] == docs[0]["id"] and storno["net_cents"] + storno["vat_cents"] == -400
    assert storno["data"]["cancels"]["number"] == docs[0]["number"]
    _refund(env, token)
    assert _charge_refunded(env, 1000, 50).status_code == 200
    assert [d["gross_cents"] for d in _invoices(env, token)] == [1000, -400, -600]
    assert sum(d["gross_cents"] for d in _invoices(env, token)) == 0
    assert [m.subject.split()[0] for m in mail.invoices] == ["Rechnung", "Stornorechnung", "Stornorechnung"]
    # Refund month view for the fee invoice.
    month = _fee_month(env)
    assert month["refunds_in_month"]["collected_fee_refunded_cents"] == 50
    assert month["refunds_in_month"]["refunded_cents"] == 1000


def test_cancel_paid_booking_creates_storno_once(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    cancel = f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/cancel"
    assert env.client.post(cancel, headers=env.admin()).status_code == 200
    _pay_manually(env, token, "refunded")  # later manual refund: already fully stornoed
    assert [(d["kind"], d["gross_cents"]) for d in _invoices(env, token)] == [("invoice", 1000), ("storno", -1000)]


def test_manual_refund_creates_storno(env, mail):
    _profile(env, tax_status="steuerbefreit", default_vat_rate=None, tax_exemption_text="Steuerfrei nach § 4 Nr. 22 UStG")
    token = _register(env)
    _pay_manually(env, token)
    _pay_manually(env, token, "refunded")
    docs = _invoices(env, token)
    assert [(d["kind"], d["gross_cents"], d["vat_cents"]) for d in docs] == [("invoice", 1000, 0), ("storno", -1000, 0)]
    assert "Steuerfrei" in " ".join(t for _, t in invoices.invoice_lines(docs[1]["data"]))


def test_invoices_are_immutable(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    for statement in ("update invoices set gross_cents = 1 where id = %s", "update invoices set pdf = '' where id = %s",
                      "update invoices set data = '{}' where id = %s", "delete from invoices where id = %s"):
        with pytest.raises(psycopg2.errors.RaiseException):
            with env.cursor() as cur:
                cur.execute(statement, (invoice["id"],))
    with env.cursor() as cur:  # the send log may change
        cur.execute("update invoices set send_error = 'x' where id = %s", (invoice["id"],))


# ---------- missing master data ----------

def test_missing_billing_profile_blocks_until_completed(env, mail):
    token = _register(env)
    _pay_manually(env, token)
    assert _invoices(env, token) == [] and _reg(env, token)["invoice_pending_reason"] == "missing_billing_profile"
    listing = env.client.get(f"/admin/organizations/{env.slug}/invoices", headers=env.admin()).json()
    assert listing["billing_profile_complete"] is False
    assert [p["registration_token"] for p in listing["pending"]] == [token]
    detail = env.client.get(f"/admin/organizations/{env.slug}/registrations/{token}/invoices", headers=env.admin()).json()
    assert detail["pending_reason"] == "missing_billing_profile" and detail["can_create"] is True
    r = env.client.post(f"/admin/organizations/{env.slug}/registrations/{token}/invoice", headers=env.admin())
    assert r.status_code == 409 and r.json()["detail"] == {"code": "missing_billing_profile"}
    _profile(env)
    r = env.client.post(f"/admin/organizations/{env.slug}/invoices/generate-pending", headers=env.admin())
    assert r.json() == {"created": 1, "blocked": 0}
    assert len(_invoices(env, token)) == 1 and _reg(env, token)["invoice_pending_reason"] is None
    assert len(mail.invoices) == 1
    listing = env.client.get(f"/admin/organizations/{env.slug}/invoices", headers=env.admin()).json()
    assert listing["pending"] == [] and listing["invoices"][0]["registration_token"] == token


# ---------- API and tenant isolation ----------

def test_invoice_api_and_tenant_isolation(env, mail):
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    base = f"/admin/organizations/{env.slug}"
    r = env.client.get(f"{base}/invoices/{invoice['id']}/pdf", headers=env.admin())
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content == bytes(invoice["pdf"]) and invoice["number"] in r.headers["content-disposition"]
    detail = env.client.get(f"{base}/registrations/{token}/invoices", headers=env.admin()).json()
    assert [i["number"] for i in detail["invoices"]] == [invoice["number"]] and detail["can_create"] is False
    assert detail["refund"] == {"possible": False, "remaining_cents": 0}  # paid by transfer

    foreign = org_admin_headers(str(env.other))
    for method, path in (("get", f"{base}/invoices"), ("get", f"{base}/invoices/{invoice['id']}/pdf"),
                         ("post", f"{base}/invoices/{invoice['id']}/resend"),
                         ("get", f"{base}/registrations/{token}/invoices"),
                         ("post", f"{base}/registrations/{token}/invoice"),
                         ("post", f"{base}/invoices/generate-pending")):
        assert getattr(env.client, method)(path, headers=foreign).status_code == 403, path
    # The other club's admin, on its own slug, cannot reach this invoice id.
    other = f"/admin/organizations/{env.other_slug}"
    assert env.client.get(f"{other}/invoices/{invoice['id']}/pdf", headers=foreign).status_code == 404
    assert env.client.post(f"{other}/invoices/{invoice['id']}/resend", headers=foreign).status_code == 404
    assert env.client.get(f"{other}/invoices", headers=foreign).json()["invoices"] == []
    assert env.client.get(f"{base}/invoices", headers=owner_headers()).status_code == 200


def test_refund_options_for_online_payment(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    detail = env.client.get(f"/admin/organizations/{env.slug}/registrations/{token}/invoices", headers=env.admin()).json()
    assert detail["refund"] == {"possible": True, "remaining_cents": 1000}


def test_platform_stats_count_partial_refunds_net(env, mail):
    before = platform_stats.get_platform_stats()["payments_paid_cents"]
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    assert platform_stats.get_platform_stats()["payments_paid_cents"] - before == 1000
    _charge_refunded(env, 400, 20)
    assert platform_stats.get_platform_stats()["payments_paid_cents"] - before == 600



def test_brevo_sends_attachment_base64():
    import base64

    from app.notifications.mail import BrevoProvider, MailAttachment, MailMessage

    class Client:
        def post(self, url, headers, json):
            self.payload = json

            class Resp:
                def raise_for_status(self):
                    return None
            return Resp()

    client = Client()
    BrevoProvider("key", "noreply@example.com", "CampsPilot", _http_client=client).send(MailMessage(
        to_email="max@example.com", subject="Rechnung", html_content="<p>x</p>",
        attachments=[MailAttachment("TV-2026-0001.pdf", b"%PDF-1.4 test")]))
    assert client.payload["attachment"] == [
        {"name": "TV-2026-0001.pdf", "content": base64.b64encode(b"%PDF-1.4 test").decode()}]
    BrevoProvider("key", "noreply@example.com", "CampsPilot", _http_client=client).send(MailMessage(
        to_email="max@example.com", subject="x", html_content="x"))
    assert "attachment" not in client.payload
