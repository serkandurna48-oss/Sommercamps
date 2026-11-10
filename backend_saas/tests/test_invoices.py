"""Billing B3: parent invoices, numbering, tax variants, PDF, storno, mail.

Real disposable Postgres (REVIEW_POSTGRES_PORT), Stripe mocked, fake mail
provider; synthetic data only.
"""

from __future__ import annotations

import re
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


def extract_text(pdf: bytes) -> str:
    """Minimal text extraction for the uncompressed fpdf2 output (pypdf is not
    a dependency): 2-byte glyph codes in Tj literals, decoded per font via its
    ToUnicode CMap. Lines are joined with newlines."""
    text = pdf.decode("latin-1")
    objects = {int(m.group(1)): m.group(2) for m in re.finditer(r"(\d+) 0 obj(.*?)endobj", text, re.S)}
    cmaps = {}
    for name, oid in re.findall(r"/(F\d+) (\d+) 0 R", text):
        ref = re.search(r"/ToUnicode (\d+) 0 R", objects[int(oid)])
        cmap = objects[int(ref.group(1))] if ref else ""
        block = "".join(re.findall(r"beginbfchar(.*?)endbfchar", cmap, re.S))
        cmaps[name] = {int(a, 16): chr(int(b, 16)) for a, b in re.findall(r"<([0-9A-Fa-f]{4})> <([0-9A-Fa-f]{4})>", block)}
    escapes = {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f"}
    lines, font, i = [], None, 0
    while i < len(text):
        tf = re.compile(r"/(F\d+) [\d.]+ Tf").match(text, i)
        if tf:
            font, i = tf.group(1), tf.end()
            continue
        if text[i] == "(" and font:
            raw, i = [], i + 1
            while text[i] != ")":
                if text[i] == "\\":
                    nxt = text[i + 1]
                    raw.append(escapes.get(nxt, nxt))
                    i += 2
                else:
                    raw.append(text[i])
                    i += 1
            i += 1
            if text.startswith(" Tj", i):
                data = "".join(raw).encode("latin-1")
                lines.append("".join(cmaps[font].get(int.from_bytes(data[k:k + 2], "big"), "?")
                                     for k in range(0, len(data) - 1, 2)))
            continue
        i += 1
    return "\n".join(lines)


def test_pdf_contains_the_required_fields_only():
    pdf = _pdf_text(_data())
    assert pdf.startswith(b"%PDF")
    content = extract_text(pdf)
    for needle in ("Rechnung", "TV-2026-0001", "Testverein e.V.", "Am Sportplatz 3", "34117 Kassel",
                   "Steuernummer: 026 123 45678", "Max Mustermann", "max@example.com",
                   "Teilnehmer/in: Lena", "Rechnungsnummer", "Rechnungsdatum", "07.11.2026",
                   "Leistungszeitraum", "05.07.2027 - 09.07.2027", "Camp: Sommercamp", "Erstellt mit CampsPilot",
                   "Nettobetrag", "125,21 EUR", "Umsatzsteuer 19 %", "23,79 EUR", "Gesamtbetrag", "149,00 EUR"):
        assert needle in content, needle
    assert "Mustermann" not in content.split("Teilnehmer/in:")[1].split("\n")[0]  # child: first name only
    text = " ".join(t for _, t in invoices.invoice_lines(_data()))
    for forbidden in ("Gebühr", "Plattformgebühr", "2017", "Allerg", "Geburt"):
        assert forbidden not in text
    assert invoices.render_pdf(_data()).startswith(b"%PDF")  # compressed default


def test_pdf_tax_variants():
    klein = extract_text(_pdf_text(_data(
        tax={"status": "kleinunternehmer", "vat_rate": None, "exemption_text": None}, net_cents=14900, vat_cents=0)))
    assert "§ 19 UStG" in klein and "Nettobetrag" not in klein and "Umsatzsteuer 19" not in klein
    assert "Gesamtbetrag" in klein and "149,00 EUR" in klein
    frei = extract_text(_pdf_text(_data(
        tax={"status": "steuerbefreit", "vat_rate": None, "exemption_text": "Steuerfrei nach § 4 Nr. 22 b UStG"},
        net_cents=14900, vat_cents=0)))
    assert "Steuerfrei nach § 4 Nr. 22 b UStG" in frei and "Nettobetrag" not in frei
    ust = extract_text(_pdf_text(_data()))
    assert "§ 19" not in ust and "Steuerfrei" not in ust
    storno = _pdf_text(_data(kind="storno", number="TV-2026-0002", gross_cents=-14900, net_cents=-12521,
                             vat_cents=-2379, cancels={"id": "x", "number": "TV-2026-0001", "issue_date": "2026-11-07"}))
    storno = extract_text(storno)
    assert "Stornorechnung zu Rechnung TV-2026-0001 vom 07.11.2026" in storno
    assert "-149,00 EUR" in storno and "-125,21 EUR" in storno


def test_pdf_new_snapshot_fields_payment_footer_and_old_snapshot_fallback():
    issuer = {**_data()["issuer"], "iban": "DE89370400440532013000", "vat_id": "DE123456789"}
    new = extract_text(_pdf_text(_data(
        issuer=issuer, booking_ref="A1B2C3D4", branding={"logo_url": None, "color": "#1E6E3C"},
        item={"description": "x", "participant": "Lena Mustermann", "title": "Camp: Sommercamp",
              "participant_first": "Lena"},
        payment={"status": "paid", "method": "online", "paid_at": "2026-11-07"})))
    for needle in ("Buchungsreferenz", "A1B2C3D4", "Bezahlt am 07.11.2026 per Online-Zahlung.",
                   "IBAN: DE89370400440532013000", "USt-IdNr.: DE123456789", "E-Mail: rechnung@example.com"):
        assert needle in new, needle
    open_ = extract_text(_pdf_text(_data(issuer=issuer, payment={"status": "open"})))
    assert "Bitte überweisen Sie 149,00 EUR auf IBAN DE89370400440532013000" in open_
    assert "TV-2026-0001" in open_.split("Verwendungszweck")[1]
    old = extract_text(_pdf_text(_data()))  # snapshot without the new keys
    assert "Betrag erhalten. Vielen Dank!" in old and "Buchungsreferenz" not in old and "IBAN" not in old


def test_pdf_long_position_and_page_break_stay_valid():
    data = _data(item={"description": "Camp: " + "Sehr langer Campname " * 12, "participant": "Lena Mustermann"})
    pdf = invoices.render_pdf(data, compress=False)
    assert pdf.count(b"/Type /Page\n") >= 1 and pdf.startswith(b"%PDF")
    assert "Gesamtbetrag" in extract_text(pdf)


def _png() -> bytes:
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (200, 80), (30, 110, 60)).save(buf, "PNG")
    return buf.getvalue()


def test_logo_is_embedded_and_failures_never_break_rendering(monkeypatch):
    data = _data(branding={"logo_url": "https://cdn.example.com/logo.png", "color": "#1E6E3C"})
    monkeypatch.setattr(invoices, "_fetch_logo", lambda url: _png())
    with_logo = invoices.render_pdf(data, compress=False)
    assert b"/Subtype /Image" in with_logo
    for broken in (lambda url: None, lambda url: b"not an image"):
        monkeypatch.setattr(invoices, "_fetch_logo", broken)
        pdf = invoices.render_pdf(data, compress=False)
        assert b"/Subtype /Image" not in pdf and "Gesamtbetrag" in extract_text(pdf)


def test_fetch_logo_rules(monkeypatch):
    import httpx

    monkeypatch.setattr("socket.getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))])

    def serve(handler):
        transport = httpx.MockTransport(handler)
        monkeypatch.setattr(httpx, "stream", lambda m, u, **kw: httpx.Client(transport=transport).stream(m, u, **kw))

    serve(lambda request: httpx.Response(200, content=_png(), headers={"content-type": "text/plain"}))
    assert invoices._fetch_logo("https://cdn.example.com/l.png") == _png()  # sniffed, not Content-Type
    assert invoices._fetch_logo("http://cdn.example.com/l.png") is None  # https only
    assert invoices._fetch_logo(None) is None and invoices._fetch_logo("") is None
    serve(lambda request: httpx.Response(200, content=b"<svg/>"))
    assert invoices._fetch_logo("https://cdn.example.com/l.svg") is None  # png/jpg only
    serve(lambda request: httpx.Response(200, content=b"\x89PNG\r\n\x1a\n" + b"0" * (invoices.LOGO_MAX_BYTES + 1)))
    assert invoices._fetch_logo("https://cdn.example.com/big.png") is None  # size limit
    serve(lambda request: httpx.Response(404))
    assert invoices._fetch_logo("https://cdn.example.com/x.png") is None

    def boom(request):
        raise httpx.ConnectTimeout("slow")

    serve(boom)
    assert invoices._fetch_logo("https://cdn.example.com/x.png") is None  # timeout: skipped silently
    monkeypatch.setattr("socket.getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))])
    assert invoices._fetch_logo("https://localhost/x.png") is None  # no internal targets


def test_pdf_renders_names_outside_latin1():
    """DejaVu Sans is embedded: Turkish, Polish and German names stay intact."""
    data = _data(
        recipient={"name": "Ayşe Yılmaz-Doğan", "email": "ayse@example.com", "address": None},
        item={"description": "Camp – „Spezial“ für Groß & Klein", "participant": "Łukasz Çelik Weiß"},
        issuer={**_data()["issuer"], "legal_name": "SV Gänseblümchen e.V."},
    )
    content = extract_text(_pdf_text(data))
    for needle in ("Ayşe Yılmaz-Doğan", "Teilnehmer/in: Łukasz", "„Spezial“ für Groß", "SV Gänseblümchen e.V."):
        assert needle in content, needle
    assert "Ay?e" not in content and "?ukasz" not in content


def test_pdf_optional_recipient_address():
    with_address = _data(recipient={"name": "Max Mustermann", "email": "max@example.com",
                                    "address": "Hauptstraße 5, 34117 Kassel"})
    assert "Hauptstraße 5, 34117 Kassel" in extract_text(_pdf_text(with_address))
    assert "Hauptstraße" not in extract_text(_pdf_text(_data()))


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
    snap = invoice["data"]  # new snapshot keys for the layout (rendering only)
    assert snap["booking_ref"] and snap["item"]["participant_first"] and snap["payment"]["status"] == "paid"
    assert set(snap["branding"]) == {"logo_url", "color"} and "iban" in snap["issuer"]
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
    assert r.json() == {"created": 1, "stornos": 0, "blocked": 0, "failed": 0, "remaining": 0}
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


# ---------- fix round 1 ----------

@pytest.mark.parametrize("rate,parts", [(19, [333, 333, 334]), (7, [333, 333, 334]), (19, [500, 500]),
                                        (19, [1, 998, 1]), (7, [250, 250, 250, 250])])
def test_storno_split_is_cumulative_and_closes_exactly(rate, parts):
    net, vat = invoices.split_tax(1000, "ust_pflichtig", rate)
    original = {"gross_cents": 1000, "net_cents": net, "vat_cents": vat, "tax_status": "ust_pflichtig", "vat_rate": rate}
    done_net = done_vat = target = 0
    for part in parts:
        target += part
        n, v = invoices.storno_split(original, target, done_net, done_vat)
        assert n + v == -part
        done_net, done_vat = done_net - n, done_vat - v
    assert (done_net, done_vat) == (net, vat)


def test_three_partial_refunds_sum_to_zero(env, mail):
    _profile(env)
    token, session_id = _paid_destination(env)
    _post_webhook(env, PLATFORM_HOOK, _completed(session_id, intent=env.intent), PLATFORM_SECRET)
    for refunded, fee in ((333, 17), (666, 33), (1000, 50)):
        assert _charge_refunded(env, refunded, fee).status_code == 200
    docs = _invoices(env, token)
    assert [d["gross_cents"] for d in docs] == [1000, -333, -333, -334]
    assert (docs[0]["net_cents"], docs[0]["vat_cents"]) == (840, 160)
    for column in ("gross_cents", "net_cents", "vat_cents"):
        assert sum(d[column] for d in docs) == 0, column


def test_failed_invoice_run_is_marked_and_retried(env, mail, monkeypatch):
    _profile(env)
    real = invoices.render_pdf

    def broken(*args, **kwargs):
        raise OSError("disk")
    monkeypatch.setattr(invoices, "render_pdf", broken)
    token = _register(env)
    _pay_manually(env, token)
    row = _reg(env, token)
    assert _invoices(env, token) == []
    assert (row["invoice_pending_reason"], row["invoice_error"]) == ("error", "OSError")
    listing = env.client.get(f"/admin/organizations/{env.slug}/invoices", headers=env.admin()).json()
    assert listing["open"]["failed"] == 1 and listing["open"]["invoices"] == 1
    assert [p["reason"] for p in listing["pending"]] == ["error"]
    monkeypatch.setattr(invoices, "render_pdf", real)
    r = env.client.post(f"/admin/organizations/{env.slug}/invoices/generate-pending", headers=env.admin())
    assert r.json() == {"created": 1, "stornos": 0, "blocked": 0, "failed": 0, "remaining": 0}
    row = _reg(env, token)
    assert (row["invoice_pending_reason"], row["invoice_error"]) == (None, None)
    assert len(_invoices(env, token)) == 1 and len(mail.invoices) == 1


def test_pending_by_query_without_marker_and_webhook_replay_retries(env, mail, monkeypatch):
    _profile(env)
    token, session_id = _paid_destination(env)
    # The background task never ran (e.g. restart): no invoice, no marker.
    event = _completed(session_id, intent=env.intent)
    with monkeypatch.context() as patch:
        patch.setattr(invoices, "sync_registration", lambda *a, **k: None)
        _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET)
    assert _invoices(env, token) == [] and _reg(env, token)["invoice_pending_reason"] is None
    listing = env.client.get(f"/admin/organizations/{env.slug}/invoices", headers=env.admin()).json()
    assert [(p["registration_token"], p["reason"]) for p in listing["pending"]] == [(token, "not_created")]
    detail = env.client.get(f"/admin/organizations/{env.slug}/registrations/{token}/invoices", headers=env.admin()).json()
    assert detail["can_create"] is True and detail["pending_reason"] == "not_created"
    # Stripe's replay of the same event now creates it.
    assert _post_webhook(env, PLATFORM_HOOK, event, PLATFORM_SECRET).json() == {"received": True, "settled": True}
    assert len(_invoices(env, token)) == 1


def test_invoice_mail_is_claimed_once_and_retried(env, local_database):
    _profile(env)
    gate = threading.Event()

    class SlowProvider(DeliveringFake):
        def send(self, message):
            gate.wait(2)
            super().send(message)
    slow = SlowProvider()
    reset_provider_for_testing(slow)
    try:
        failing = FailingProvider()
        reset_provider_for_testing(failing)
        token = _register(env)
        _pay_manually(env, token)  # mail fails
        (invoice,) = _invoices(env, token)
        assert invoice["sent_at"] is None and invoice["send_error"]
        reset_provider_for_testing(slow)
        threads = [threading.Thread(target=invoices.send_invoice, args=(invoice["id"], env.org)) for _ in range(3)]
        for t in threads:
            t.start()
        time.sleep(0.2)
        gate.set()
        for t in threads:
            t.join()
        assert len(slow.invoices) == 1  # claimed atomically: one mail
        assert _invoices(env, token)[0]["sent_at"] is not None
        # generate-pending retries unsent mails (here: nothing left).
        r = env.client.post(f"/admin/organizations/{env.slug}/invoices/generate-pending", headers=env.admin())
        assert r.json()["remaining"] == 0 and len(slow.invoices) == 1
    finally:
        reset_provider_for_testing(None)


def test_generate_pending_retries_failed_mail(env):
    _profile(env)
    reset_provider_for_testing(FailingProvider())
    try:
        token = _register(env)
        _pay_manually(env, token)
        listing = env.client.get(f"/admin/organizations/{env.slug}/invoices", headers=env.admin()).json()
        assert listing["open"]["unsent_mails"] == 1 and listing["open"]["total"] == 1
        good = DeliveringFake()
        reset_provider_for_testing(good)
        r = env.client.post(f"/admin/organizations/{env.slug}/invoices/generate-pending", headers=env.admin())
        assert r.json()["remaining"] == 0 and len(good.invoices) == 1
    finally:
        reset_provider_for_testing(None)


def test_generate_pending_is_batched(env, mail, monkeypatch):
    from app.routers import invoices_admin
    monkeypatch.setattr(invoices_admin, "GENERATE_BATCH", 2)
    tokens = [_register(env) for _ in range(5)]
    for token in tokens:
        _pay_manually(env, token)  # no master data yet
    _profile(env)
    results = []
    for _ in range(3):
        results.append(env.client.post(f"/admin/organizations/{env.slug}/invoices/generate-pending",
                                       headers=env.admin()).json())
    assert [(r["created"], r["remaining"]) for r in results] == [(2, 3), (2, 1), (1, 0)]
    assert sum(len(_invoices(env, t)) for t in tokens) == 5


def test_booked_price_backfill_keeps_updated_at(env):
    from pathlib import Path
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261107100000_parent_invoices.sql"
    token = _register(env)
    with env.cursor() as cur:
        cur.execute("update camp_registrations set booked_price_cents = null where registration_token = %s", (token,))
        cur.execute("select updated_at from camp_registrations where registration_token = %s", (token,))
        before = cur.fetchone()["updated_at"]
    with env.cursor() as cur:
        cur.execute(migration.read_text(encoding="utf-8"))
    row = _reg(env, token)
    assert row["booked_price_cents"] == 1000 and row["updated_at"] == before
