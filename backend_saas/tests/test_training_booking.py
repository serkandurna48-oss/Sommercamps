"""Booking a training session (Stufe 1, Task 3): server-side member pricing,
no waitlist, concurrency, mail/export price. Real local Postgres, synthetic data."""

from __future__ import annotations

import threading
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app import db
from app.main import app
from app.notifications import sending
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import camps, memberships, training
from app.repositories import registrations as repo
from app.routers import payments
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401

BIRTH = date(2015, 3, 4)  # age 11+ -> within 4..18 for any future session


@pytest.fixture(autouse=True)
def fake_provider():
    provider = FakeProvider()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


def _make(real_db, *, capacity=1, offer_status="published", session_status="published",
          starts_in=timedelta(days=10), member=3000, nonmember=4500, kind="einzel"):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    offer = training.create_offer(
        org, slug=f"einzel-{uuid4().hex[:6]}", title="Einzeltraining", kind=kind,
        duration_minutes=60, price_member_cents=member, price_nonmember_cents=nonmember,
        status=offer_status,
    )
    starts = datetime.now(timezone.utc) + starts_in
    if starts_in < timedelta(0):
        with cursor() as cur:  # the check constraint-free route: insert a past session directly
            session = training.create_session(org, offer["id"], datetime.now(timezone.utc) + timedelta(days=1),
                                              capacity=capacity, status=session_status)
            cur.execute("update camps set starts_at=%s, ends_at=%s, start_date=%s, end_date=%s where id=%s",
                        (starts, starts + timedelta(minutes=60), starts.date(), starts.date(), session["id"]))
        return offer, {**session, "starts_at": starts}
    session = training.create_session(
        org, offer["id"], starts, capacity=capacity if kind == "gruppe" or capacity != 1 else None,
        status=session_status,
    )
    return offer, session


def _post(real_db, session, **overrides):
    _, tenant, _ = real_db
    payload = _valid_payload(child_birth_date=BIRTH.isoformat(), payment_method="ueberweisung")
    payload.update(overrides)
    with TestClient(app) as client:
        return client.post(
            f"/api/v1/organizations/{tenant.slug}/camps/{session['slug']}/registrations", json=payload
        )


def _row(real_db, token):
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        return cur.fetchone()


def _member(real_db, first="Lena", last="Mustermann", birth=BIRTH, active=True):
    _, tenant, _ = real_db
    m = memberships.create_member(tenant.organization_id, first_name=first, last_name=last, birth_date=birth)
    if not active:
        memberships.deactivate_member(tenant.organization_id, m["id"])
    return m


# ---------- pricing ----------

def test_member_pays_member_price(real_db):
    _member(real_db)
    _, session = _make(real_db)
    r = _post(real_db, session)
    assert r.status_code == 201, r.text
    assert r.json()["applied_price_cents"] == 3000
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["payment_method"]) == (3000, True, "ueberweisung")
    assert row["status"] == "registered"


def test_nonmember_pays_nonmember_price(real_db):
    _, session = _make(real_db)
    r = _post(real_db, session)
    assert r.status_code == 201
    assert r.json()["applied_price_cents"] == 4500
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"]) == (4500, False)


def test_inactive_member_pays_nonmember_price(real_db):
    _member(real_db, active=False)
    _, session = _make(real_db)
    r = _post(real_db, session)
    assert r.json()["applied_price_cents"] == 4500
    assert _row(real_db, r.json()["registration_token"])["member_match"] is False


def test_member_of_other_organization_is_not_matched(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'X','x@example.com')",
                    (other, f"o-{other.hex}"))
    memberships.create_member(other, first_name="Lena", last_name="Mustermann", birth_date=BIRTH)
    _, session = _make(real_db)
    assert _post(real_db, session).json()["applied_price_cents"] == 4500


def test_member_birth_date_must_match(real_db):
    _member(real_db, birth=date(2014, 3, 4))
    _, session = _make(real_db)
    assert _post(real_db, session).json()["applied_price_cents"] == 4500


@pytest.mark.parametrize("member_first,member_last,child_first,child_last", [
    ("Jörg", "Müller", "Joerg", "Mueller"),
    ("Joerg", "Mueller", "JÖRG", "MÜLLER"),
    ("Anna-Lena", "Weiß", "anna lena", "weiss"),
    ("Anna Lena", "Meier-Schmidt", "Anna-Lena", "Meier Schmidt"),
    ("Lena", "Strauß", "  Lena ", "Strauss"),
])
def test_spelling_variants_match_member(real_db, member_first, member_last, child_first, child_last):
    _member(real_db, member_first, member_last)
    _, session = _make(real_db)
    r = _post(real_db, session, child_first_name=child_first, child_last_name=child_last)
    assert r.status_code == 201, r.text
    assert r.json()["applied_price_cents"] == 3000


def test_member_price_null_falls_back_to_nonmember(real_db):
    _member(real_db)
    _, session = _make(real_db)
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("update camps set price_member_cents=NULL where id=%s", (session["id"],))
    r = _post(real_db, session)
    assert r.json()["applied_price_cents"] == 4500
    assert _row(real_db, r.json()["registration_token"])["member_match"] is True


def test_browser_price_fields_are_ignored(real_db):
    _, session = _make(real_db)
    r = _post(real_db, session, price_cents=1, applied_price_cents=1, member_match=True, price=0)
    assert r.status_code == 201, r.text
    assert r.json()["applied_price_cents"] == 4500
    row = _row(real_db, r.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"]) == (4500, False)


def test_public_response_never_leaks_membership(real_db):
    _member(real_db)
    _, session = _make(real_db)
    body = _post(real_db, session).json()
    assert "member_match" not in body and "member" not in " ".join(body).lower()
    assert set(body) == {"registration_token", "status", "payment_status", "payment_reference",
                         "applied_price_cents"}


# ---------- payment method ----------

@pytest.mark.parametrize("pm", ["online", "paypal", "", "BAR"])
def test_training_rejects_other_payment_methods(real_db, pm):
    _, session = _make(real_db)
    assert _post(real_db, session, payment_method=pm).status_code == 422


def test_training_requires_payment_method(real_db):
    _, session = _make(real_db)
    payload = _valid_payload(child_birth_date=BIRTH.isoformat())
    _, tenant, _ = real_db
    with TestClient(app) as client:
        r = client.post(f"/api/v1/organizations/{tenant.slug}/camps/{session['slug']}/registrations", json=payload)
    assert r.status_code == 422


def test_bar_is_allowed(real_db):
    _, session = _make(real_db)
    r = _post(real_db, session, payment_method="bar")
    assert r.status_code == 201
    assert _row(real_db, r.json()["registration_token"])["payment_method"] == "bar"


# ---------- capacity / no waitlist ----------

def test_full_one_to_one_session_returns_409_without_waitlist(real_db):
    _, session = _make(real_db)
    assert _post(real_db, session).status_code == 201
    r = _post(real_db, session, child_first_name="Tom", child_birth_date="2014-01-01")
    assert r.status_code == 409
    # Contract with the frontend (trainingConflictKind): it reads detail.code.
    assert r.json()["detail"]["code"] == "training_session_full"
    assert "belegt" in r.json()["detail"]["message"]
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select status from camp_registrations where camp_id=%s", (session["id"],))
        assert [x["status"] for x in cur.fetchall()] == ["registered"]


def test_group_session_fills_up_then_409(real_db):
    _, session = _make(real_db, capacity=2, kind="gruppe")
    for name in ("A", "B"):
        assert _post(real_db, session, child_first_name=name).status_code == 201
    r = _post(real_db, session, child_first_name="C")
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "training_session_full"


def test_duplicate_child_409(real_db):
    _, session = _make(real_db, capacity=3, kind="gruppe")
    assert _post(real_db, session).status_code == 201
    r = _post(real_db, session)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "registration_duplicate"
    assert "bereits eine Anmeldung" in r.json()["detail"]["message"]


def test_classic_camp_duplicate_keeps_plain_string_detail(real_db):
    _, tenant, _ = real_db
    url = f"/api/v1/organizations/{tenant.slug}/camps/summer-1/registrations"
    payload = _valid_payload(child_birth_date="2017-05-10")
    with TestClient(app) as client:
        assert client.post(url, json=payload).status_code == 201
        r = client.post(url, json=payload)
    assert r.status_code == 409
    assert isinstance(r.json()["detail"], str)


def test_concurrent_bookings_capacity_one_yield_exactly_one(real_db):
    _, session = _make(real_db)
    results, barrier = [], threading.Barrier(4)

    def attempt(i):
        barrier.wait()
        results.append(_post(real_db, session, child_first_name=f"Kind{i}").status_code)

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(4)]
    [t.start() for t in threads]
    [t.join(30) for t in threads]
    assert sorted(results) == [201, 409, 409, 409]
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select count(*) n from camp_registrations where camp_id=%s", (session["id"],))
        assert cur.fetchone()["n"] == 1


# ---------- bookability ----------

@pytest.mark.parametrize("kwargs", [
    dict(offer_status="archived"), dict(offer_status="draft"), dict(session_status="draft"),
])
def test_unbookable_training_is_404(real_db, kwargs):
    _, session = _make(real_db, **kwargs)
    assert _post(real_db, session).status_code == 404


def test_offer_archived_after_session_published_is_404(real_db):
    offer, session = _make(real_db)
    training.update_offer(real_db[1].organization_id, offer["id"], status="archived")
    assert _post(real_db, session).status_code == 404


def test_past_session_is_409(real_db):
    _, session = _make(real_db, starts_in=-timedelta(hours=2))
    r = _post(real_db, session)
    assert r.status_code == 409
    assert r.json()["detail"]["code"] == "training_session_past"
    assert "Vergangenheit" in r.json()["detail"]["message"]


def test_session_starting_between_lookup_and_lock_is_409(real_db):
    """The repo re-checks the start time inside the locked transaction."""
    _, tenant, _ = real_db
    _, session = _make(real_db, starts_in=-timedelta(hours=2))
    target = repo.RegistrationTarget(
        id=session["id"], organization_id=tenant.organization_id, slug=session["slug"],
        title="t", start_date=date.today(), end_date=date.today(), registration_start=None,
        registration_end=None, age_min=4, age_max=18, capacity=1, status="published",
        offer_id=session["offer_id"], starts_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    from app.schemas import RegistrationCreate
    with pytest.raises(repo.TrainingSessionPastError):
        repo.create_training_registration(
            tenant, target, RegistrationCreate(**_valid_payload(child_birth_date=BIRTH.isoformat(),
                                                                payment_method="bar")))


# ---------- camp detail / classic camps ----------

def test_camp_detail_hides_training_slug(real_db):
    _, tenant, camp = real_db
    _, session = _make(real_db)
    with TestClient(app) as client:
        assert client.get(f"/api/v1/organizations/{tenant.slug}/camps/{session['slug']}").status_code == 404
        assert client.get(f"/api/v1/organizations/{tenant.slug}/camps/summer-1").status_code == 200


def test_classic_camp_registration_unchanged(real_db):
    _, tenant, _ = real_db
    payload = _valid_payload(child_birth_date="2017-05-10")
    with TestClient(app) as client:
        url = f"/api/v1/organizations/{tenant.slug}/camps/summer-1/registrations"
        first = client.post(url, json=payload)
        second = client.post(url, json=_valid_payload(child_first_name="Zoe", child_birth_date="2017-05-11"))
        # a stray payment_method on a classic camp is ignored, not stored
        third = client.post(url, json=_valid_payload(child_first_name="Ida", child_birth_date="2017-06-11",
                                                     payment_method="bar"))
    assert (first.status_code, first.json()["status"]) == (201, "registered")
    assert (second.status_code, second.json()["status"]) == (201, "waitlist")
    assert "applied_price_cents" not in first.json() or first.json()["applied_price_cents"] is None
    row = _row(real_db, first.json()["registration_token"])
    assert (row["applied_price_cents"], row["member_match"], row["payment_method"]) == (None, None, None)
    assert third.status_code == 201
    assert _row(real_db, third.json()["registration_token"])["payment_method"] is None


# ---------- checkout ----------

def test_checkout_rejects_training_registration(real_db, monkeypatch):
    _, tenant, _ = real_db
    _, session = _make(real_db)
    token = _post(real_db, session).json()["registration_token"]
    monkeypatch.setattr(payments, "_stripe_client", lambda: SimpleNamespace())
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(frontend_base_url="http://x"))
    with pytest.raises(HTTPException) as err:
        payments.create_checkout(session["slug"], token if not isinstance(token, str) else __import__("uuid").UUID(token),
                                 tenant, None)
    assert err.value.status_code == 409
    assert "Training" in err.value.detail


# ---------- mail ----------

def test_confirmation_mail_uses_applied_price_and_berlin_time(real_db, fake_provider):
    _member(real_db)
    _, session = _make(real_db)
    r = _post(real_db, session)
    assert r.status_code == 201
    msgs = [m for m in fake_provider.sent if m.to_email == "max@example.com"]
    assert msgs, "confirmation mail not sent"
    html = msgs[0].html_content
    assert "30,00" in html and "45,00" not in html
    local = session["starts_at"].astimezone(__import__("zoneinfo").ZoneInfo("Europe/Berlin"))
    assert f"{local:%H:%M} Uhr" in html


def test_status_change_mail_uses_applied_price(real_db, fake_provider):
    _, tenant, _ = real_db
    _, session = _make(real_db)
    token = _post(real_db, session).json()["registration_token"]
    fake_provider.sent.clear()
    sending.resend_registration_mail(__import__("uuid").UUID(token), tenant.organization_id)
    assert "45,00" in fake_provider.sent[0].html_content


def test_bar_booking_mail_and_resend_have_no_bank_details(real_db, fake_provider):
    _, tenant, _ = real_db
    _, session = _make(real_db)
    r = _post(real_db, session, payment_method="bar")
    assert r.status_code == 201
    first = [m for m in fake_provider.sent if m.to_email == "max@example.com"][0]
    assert "Bitte bar beim Training bezahlen." in first.html_content
    assert "IBAN" not in first.html_content
    fake_provider.sent.clear()
    sending.resend_registration_mail(__import__("uuid").UUID(r.json()["registration_token"]), tenant.organization_id)
    assert "Bitte bar beim Training bezahlen." in fake_provider.sent[0].html_content
    assert "IBAN" not in fake_provider.sent[0].html_content


def test_ueberweisung_booking_mail_and_resend_keep_transfer_block(real_db, fake_provider):
    _, tenant, _ = real_db
    _, session = _make(real_db)
    r = _post(real_db, session, payment_method="ueberweisung")
    first = [m for m in fake_provider.sent if m.to_email == "max@example.com"][0]
    assert "Verwendungszweck" in first.html_content and "bar beim Training" not in first.html_content
    fake_provider.sent.clear()
    sending.resend_registration_mail(__import__("uuid").UUID(r.json()["registration_token"]), tenant.organization_id)
    assert "Verwendungszweck" in fake_provider.sent[0].html_content
    assert "bar beim Training" not in fake_provider.sent[0].html_content


# ---------- export ----------

def test_export_payment_sheet_uses_applied_price(real_db):
    from app.routers import exports
    _, tenant, _ = real_db
    _member(real_db)
    _, session = _make(real_db)
    _post(real_db, session)
    regs = repo.list_registrations_for_organization(tenant.organization_id)
    assert regs[0]["applied_price_cents"] == 3000
    camp = {"title": "T", "price_cents": 4500}
    headers, rows = exports._payments_sheet([(camp, regs)], include_camp_column=False)
    assert rows[0][headers.index("Preis (EUR)")] == 30.0
    # legacy rows without applied price keep the camp price
    legacy = [{**regs[0], "applied_price_cents": None}]
    _, rows = exports._payments_sheet([(camp, legacy)], include_camp_column=False)
    assert rows[0][3] == 45.0


# ---------- review follow-ups ----------

def test_payment_options_offline_for_training_online_for_camp(real_db, monkeypatch):
    _, tenant, _ = real_db
    _, session = _make(real_db)
    monkeypatch.setattr(payments, "get_settings", lambda: SimpleNamespace(
        stripe_checkout_enabled=True, stripe_secret_key="sk_test_x", stripe_webhook_secret="whsec_x"))
    monkeypatch.setattr(payments, "_organization_payment_details", lambda _org: {
        "online_payment_enabled": True, "stripe_charges_enabled": True, "stripe_account_id": "acct_1234567890abcdef"})
    base = f"/api/v1/organizations/{tenant.slug}/camps"
    with TestClient(app) as client:
        assert client.get(f"{base}/{session['slug']}/payment-options").json() == {"online_payment_available": False}
        assert client.get(f"{base}/summer-1/payment-options").json() == {"online_payment_available": True}


def test_platform_stats_use_applied_price(real_db):
    from app.repositories import platform_stats
    _member(real_db)
    _, session = _make(real_db)
    _post(real_db, session)  # member: 3000 instead of camp price 4500, payment open
    before = platform_stats.get_platform_stats()["payments_open_cents"]
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("update camp_registrations set applied_price_cents = NULL where camp_id=%s", (session["id"],))
    legacy = platform_stats.get_platform_stats()["payments_open_cents"]
    assert legacy - before == 4500 - 3000
    with cursor() as cur:
        cur.execute("update camp_registrations set applied_price_cents = 0 where camp_id=%s", (session["id"],))
    assert platform_stats.get_platform_stats()["payments_open_cents"] == before - 3000


def test_archiving_offer_concurrently_blocks_booking_then_rejects(real_db, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from contextlib import contextmanager
    from app.schemas import RegistrationCreate
    from .test_review_postgres import wait_for_lock
    cursor, tenant, _ = real_db
    offer, session = _make(real_db)
    target = repo.get_registration_target(tenant, session["slug"])
    data = RegistrationCreate(**_valid_payload(child_birth_date=BIRTH.isoformat(), payment_method="bar"))
    name = f"training-booking-{uuid4().hex}"

    @contextmanager
    def named_cursor():
        with cursor() as cur:
            cur.execute("SET LOCAL application_name = %s", (name,))
            yield cur

    monkeypatch.setattr(db, "get_cursor", named_cursor)
    with ThreadPoolExecutor(max_workers=1) as executor:
        with cursor() as admin:
            admin.execute("update training_offers set status='archived' where id=%s", (offer["id"],))
            future = executor.submit(repo.create_training_registration, tenant, target, data)
            wait_for_lock(cursor, name)  # booking waits on the offer row
        with pytest.raises(repo.CampNotAvailableError):
            future.result(timeout=10)
    with cursor() as cur:
        cur.execute("select count(*) n from camp_registrations where camp_id=%s", (session["id"],))
        assert cur.fetchone()["n"] == 0
