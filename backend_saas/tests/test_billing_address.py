"""Billing address of the parent (migration 20261107130000): required for paid
bookings (camps and trainings), ignored for free ones, on the invoice and the
storno, admin list/export, column rights. Real local Postgres, synthetic data."""

from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from openpyxl import load_workbook
from pydantic import ValidationError

from app import invoices
from app.config import Settings
from app.repositories import registrations as registrations_repo
from app.schemas import RegistrationCreate
from .auth_helpers import org_admin_headers, owner_headers
from .test_billing_stripe_express import _reg, env  # noqa: F401
from .test_invoices import _invoices, _pay_manually, _profile, extract_text, mail  # noqa: F401
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _member, _post, fake_provider  # noqa: F401

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261107130000_parent_billing_address.sql"
GRANTS = MIGRATION.with_name("20261106160000_billing_refunds_and_grants.sql")
ADDRESS_KEYS = ("parent_street", "parent_postal_code", "parent_city")
MSG = "Bitte geben Sie Ihre Rechnungsanschrift an."


def _without_address(**over) -> dict:
    """Payload of an old client that does not know the fields at all."""
    payload = _valid_payload(child_first_name=f"Kind{uuid4().hex[:6]}", **over)
    for key in ADDRESS_KEYS:
        payload.pop(key)
    return payload


def _book_camp(env, payload):
    return env.client.post(f"/api/v1/organizations/{env.slug}/camps/summer-1/registrations", json=payload)


# ---------- schema: trimming and limits ----------

def test_fields_are_trimmed_and_blank_becomes_none():
    data = RegistrationCreate(**_valid_payload(parent_street="  Hauptstraße 5  ", parent_postal_code=" 34117 ",
                                               parent_city="  Kassel "))
    assert (data.parent_street, data.parent_postal_code, data.parent_city) == ("Hauptstraße 5", "34117", "Kassel")
    blank = RegistrationCreate(**_valid_payload(parent_street="   ", parent_postal_code=" ", parent_city=""))
    assert (blank.parent_street, blank.parent_postal_code, blank.parent_city) == (None, None, None)
    old = RegistrationCreate(**_without_address())
    assert (old.parent_street, old.parent_postal_code, old.parent_city) == (None, None, None)


@pytest.mark.parametrize("field,value", [
    ("parent_street", "x" * 121),
    ("parent_city", "x" * 81),
    ("parent_postal_code", "123"),
    ("parent_postal_code", "12345678901"),
    ("parent_postal_code", "34117!"),
    ("parent_postal_code", "-3411"),
])
def test_limits_and_postal_code_format(field, value):
    with pytest.raises(ValidationError):
        RegistrationCreate(**_valid_payload(**{field: value}))


@pytest.mark.parametrize("field", ADDRESS_KEYS)
@pytest.mark.parametrize("value", ["Musterweg 1\nZahlbar an: X", "Muster\rweg", "Muster\tweg", "Muster\x00weg",
                                   "Muster\x7fweg", "Muster\u2028weg", "Muster\x85weg"])
def test_control_characters_and_newlines_are_rejected(field, value):
    if field == "parent_postal_code":
        value = "341\n17"
    with pytest.raises(ValidationError) as exc:
        RegistrationCreate(**_valid_payload(**{field: value}))
    assert "Zeilenumbrüche" in str(exc.value) or field == "parent_postal_code"


def test_control_characters_return_422_from_api(env):
    r = _book_camp(env, _valid_payload(parent_street="Musterweg 1\nZahlbar an: X"))
    assert r.status_code == 422
    assert any(e["loc"][-1] == "parent_street" for e in r.json()["detail"])


@pytest.mark.parametrize("value", ["1010", "34117", "D-34117", "SW1A 1AA", "1234567890"])
def test_postal_code_accepts_common_formats(value):
    assert RegistrationCreate(**_valid_payload(parent_postal_code=value)).parent_postal_code == value


def test_limits_at_the_edge_are_accepted():
    data = RegistrationCreate(**_valid_payload(parent_street="s" * 120, parent_city="c" * 80))
    assert len(data.parent_street) == 120 and len(data.parent_city) == 80


# ---------- camps ----------

@pytest.fixture
def tolerance(monkeypatch):
    """Rollout tolerance BILLING_ADDRESS_LEGACY_UNTIL; value None = unset (strict)."""
    def set_until(value):
        monkeypatch.setattr(registrations_repo, "billing_address_legacy_until", lambda: value)
    return set_until


def test_paid_camp_old_client_strict_without_tolerance(env, tolerance):
    tolerance(None)
    r = _book_camp(env, _without_address())
    assert r.status_code == 422 and r.json()["detail"] == MSG
    partial = _without_address(parent_street="Musterweg 1", parent_city="Kassel")
    r = _book_camp(env, partial)
    assert r.status_code == 422 and r.json()["detail"] == MSG
    with env.cursor() as cur:
        cur.execute("select count(*) as n from camp_registrations where organization_id=%s", (env.org,))
        assert cur.fetchone()["n"] == 0


def test_old_client_tolerated_during_rollout_and_logged(env, tolerance, caplog):
    tolerance(date.today() + timedelta(days=7))
    with caplog.at_level(logging.INFO, logger="app.repositories.registrations"):
        r = _book_camp(env, _without_address())
    assert r.status_code == 201, r.text
    row = _reg(env, r.json()["registration_token"])
    assert (row["parent_street"], row["parent_postal_code"], row["parent_city"]) == (None, None, None)
    (line,) = [rec.getMessage() for rec in caplog.records if "legacy client" in rec.getMessage()]
    assert f"organization_slug={env.slug}" in line and "camp_slug=summer-1" in line and "reason=legacy_client" in line
    assert "Max" not in line and "max@example.com" not in line and "Mustermann" not in line


@pytest.mark.parametrize("sent", [
    {"parent_street": "", "parent_postal_code": "", "parent_city": ""},       # present but empty
    {"parent_street": "Musterweg 1", "parent_city": "Kassel"},                 # partial
    {"parent_street": None},                                                    # explicit null counts as sent
])
def test_new_client_with_empty_or_partial_address_is_never_tolerated(env, tolerance, sent):
    tolerance(date.today() + timedelta(days=7))
    r = _book_camp(env, {**_without_address(), **sent})
    assert r.status_code == 422 and r.json()["detail"] == MSG


def test_tolerance_expires(env, tolerance):
    tolerance(date.today() - timedelta(days=1))
    r = _book_camp(env, _without_address())
    assert r.status_code == 422 and r.json()["detail"] == MSG
    assert registrations_repo._legacy_tolerance_active(date(2026, 11, 14)) is False
    tolerance(date(2026, 11, 14))
    assert registrations_repo._legacy_tolerance_active(date(2026, 11, 14)) is True  # inclusive
    assert registrations_repo._legacy_tolerance_active(date(2026, 11, 15)) is False


def test_legacy_until_setting_parses_iso_date_and_blank(monkeypatch):
    base = dict(DATABASE_URL="postgresql://test:test@127.0.0.1:5432/x")
    monkeypatch.setenv("BILLING_ADDRESS_LEGACY_UNTIL", "2026-11-21")
    assert Settings(**base).billing_address_legacy_until == date(2026, 11, 21)
    monkeypatch.setenv("BILLING_ADDRESS_LEGACY_UNTIL", "")
    assert Settings(**base).billing_address_legacy_until is None
    monkeypatch.delenv("BILLING_ADDRESS_LEGACY_UNTIL")
    assert Settings(**base).billing_address_legacy_until is None
    monkeypatch.setenv("BILLING_ADDRESS_LEGACY_UNTIL", "morgen")
    with pytest.raises(ValidationError):
        Settings(**base)


def test_paid_camp_stores_trimmed_address(env):
    payload = _valid_payload(child_first_name="Anna", parent_street=" Hauptstraße 5 ", parent_postal_code="34117",
                             parent_city=" Kassel ")
    r = _book_camp(env, payload)
    assert r.status_code == 201, r.text
    row = _reg(env, r.json()["registration_token"])
    assert (row["parent_street"], row["parent_postal_code"], row["parent_city"]) == ("Hauptstraße 5", "34117", "Kassel")


def test_free_camp_needs_no_address_and_stores_none(env):
    with env.cursor() as cur:
        cur.execute("update camps set price_cents=0 where organization_id=%s", (env.org,))
    r = _book_camp(env, _without_address())
    assert r.status_code == 201, r.text
    sent = _book_camp(env, _valid_payload(child_first_name="Frei"))
    assert sent.status_code == 201
    row = _reg(env, sent.json()["registration_token"])
    assert (row["parent_street"], row["parent_postal_code"], row["parent_city"]) == (None, None, None)


def test_full_paid_camp_waitlist_still_requires_address(env):
    with env.cursor() as cur:
        cur.execute("update camps set capacity=1 where organization_id=%s", (env.org,))
    assert _book_camp(env, _valid_payload(child_first_name="Erste")).json()["status"] == "registered"
    r = _book_camp(env, _without_address())
    assert r.status_code == 422 and r.json()["detail"] == MSG
    assert _book_camp(env, _valid_payload(child_first_name="Zweite")).json()["status"] == "waitlist"


# ---------- trainings ----------

def test_paid_training_requires_address(real_db):
    _, session = _make(real_db, member=3000, nonmember=4500, capacity=2, kind="gruppe")
    missing = _post(real_db, session, **{k: "" for k in ADDRESS_KEYS})
    assert missing.status_code == 422 and missing.json()["detail"] == MSG
    r = _post(real_db, session, parent_city=" Baunatal ")
    assert r.status_code == 201, r.text
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select parent_street, parent_postal_code, parent_city from camp_registrations "
                    "where registration_token=%s", (r.json()["registration_token"],))
        assert cur.fetchone() == {"parent_street": "Musterweg 1", "parent_postal_code": "34117",
                                  "parent_city": "Baunatal"}


def test_free_member_training_needs_no_address(real_db):
    _member(real_db)
    _, session = _make(real_db, member=0, nonmember=4500, capacity=2, kind="gruppe")
    r = _post(real_db, session, **{k: "" for k in ADDRESS_KEYS})
    assert r.status_code == 201, r.text
    assert r.json()["applied_price_cents"] == 0
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select parent_street, parent_city from camp_registrations where registration_token=%s",
                    (r.json()["registration_token"],))
        assert cur.fetchone() == {"parent_street": None, "parent_city": None}
    # Same session, non-member child: pays 45 EUR, so the address is required.
    paid = _post(real_db, session, **{k: "" for k in ADDRESS_KEYS}, child_first_name="Nicht", child_last_name="Mitglied")
    assert paid.status_code == 422 and paid.json()["detail"] == MSG


# ---------- invoice and storno ----------

def test_invoice_and_storno_carry_the_address(env, mail):
    _profile(env, tax_status="kleinunternehmer", default_vat_rate=None)
    r = _book_camp(env, _valid_payload(child_first_name="Rechnung", parent_street="Hauptstraße 5",
                                       parent_postal_code="34117", parent_city="Kassel"))
    token = r.json()["registration_token"]
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    assert invoice["data"]["recipient"]["address"] == "Hauptstraße 5\n34117 Kassel"
    content = extract_text(invoices.render_pdf(invoice["data"], compress=False))
    assert "Max Mustermann\nHauptstraße 5\n34117 Kassel\nmax@example.com" in content
    lines = [t for _, t in invoices.invoice_lines(invoice["data"])]
    assert lines.index("Hauptstraße 5") == lines.index("Max Mustermann") + 1
    _pay_manually(env, token, "refunded")
    docs = _invoices(env, token)
    assert [d["kind"] for d in docs] == ["invoice", "storno"]
    assert docs[1]["data"]["recipient"] == invoice["data"]["recipient"]


def test_booking_without_address_keeps_old_invoice_shape(env, mail):
    """Bookings from before the migration (no address) still get the name+email invoice."""
    _profile(env)
    token = _book_camp(env, _valid_payload(child_first_name="Alt")).json()["registration_token"]
    with env.cursor() as cur:
        cur.execute("update camp_registrations set parent_street=null, parent_postal_code=null, parent_city=null "
                    "where registration_token=%s", (token,))
    _pay_manually(env, token)
    (invoice,) = _invoices(env, token)
    assert invoice["data"]["recipient"]["address"] is None
    assert "Musterweg" not in extract_text(invoices.render_pdf(invoice["data"], compress=False))


def test_player_delete_nulls_address_but_keeps_invoice_snapshot(env, mail):
    _profile(env)
    r = _book_camp(env, _valid_payload(child_first_name="Loesch", parent_street="Hauptstraße 5"))
    token = r.json()["registration_token"]
    _pay_manually(env, token)
    cancel = f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/cancel"
    assert env.client.post(cancel, headers=env.admin()).status_code == 200
    player_id = _reg(env, token)["player_id"]
    assert env.client.delete(f"/admin/organizations/{env.slug}/players/{player_id}",
                             headers=owner_headers()).status_code == 204
    row = _reg(env, token)
    assert row["anonymized_at"] is not None
    assert (row["parent_street"], row["parent_postal_code"], row["parent_city"]) == (None, None, None)
    docs = _invoices(env, token)
    assert [d["kind"] for d in docs] == ["invoice", "storno"]
    assert all(d["data"]["recipient"]["address"] == "Hauptstraße 5\n34117 Kassel" for d in docs)


# ---------- admin, export, tenant isolation ----------

def test_admin_list_and_export_show_address_only_to_own_tenant(env):
    token = _book_camp(env, _valid_payload(child_first_name="Admin")).json()["registration_token"]
    base = f"/admin/organizations/{env.slug}/camps/summer-1"
    rows = env.client.get(f"{base}/registrations", headers=env.admin()).json()
    (row,) = [r for r in rows if r["registration_token"] == token]
    assert (row["parent_street"], row["parent_postal_code"], row["parent_city"]) == ("Musterweg 1", "34117", "Kassel")
    sheet = load_workbook(BytesIO(env.client.get(f"{base}/export.xlsx", headers=env.admin()).content)).active
    header = [c.value for c in sheet[1]]
    values = [c.value for c in sheet[2]]
    assert header[header.index("Telefon") + 1:header.index("Telefon") + 4] == ["Straße", "PLZ", "Ort"]
    assert values[header.index("Straße")] == "Musterweg 1" and values[header.index("Ort")] == "Kassel"
    foreign = org_admin_headers(str(env.other))
    assert env.client.get(f"{base}/registrations", headers=foreign).status_code == 403
    assert env.client.get(f"{base}/export.xlsx", headers=foreign).status_code == 403
    assert env.client.get(f"/admin/organizations/{env.other_slug}/camps/summer-1/registrations",
                          headers=foreign).status_code == 404


# ---------- migration ----------

def test_migration_is_idempotent_and_checks_format(env):
    token = _book_camp(env, _valid_payload(child_first_name="Mig")).json()["registration_token"]
    with env.cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
    assert _reg(env, token)["parent_city"] == "Kassel"  # data untouched
    for column, value in (("parent_postal_code", "12"), ("parent_postal_code", "34117!"),
                          ("parent_street", "x" * 121), ("parent_city", "x" * 81), ("parent_city", "  ")):
        with pytest.raises(psycopg2.errors.CheckViolation):
            with env.cursor() as cur:
                cur.execute(f"update camp_registrations set {column}=%s where registration_token=%s", (value, token))


def test_address_columns_not_readable_by_authenticated(env):
    user = uuid4()
    with env.cursor() as cur:
        cur.execute("insert into auth.users(id) values (%s)", (user,))
        cur.execute("insert into organization_members(user_id, organization_id) values (%s, %s)", (user, env.org))
    _book_camp(env, _valid_payload(child_first_name="Rechte"))
    try:
        with env.cursor() as cur:
            # Test DB re-grants every table after migrations: replay the column-grant state, then this file.
            cur.execute(GRANTS.read_text(encoding="utf-8"))
            cur.execute(MIGRATION.read_text(encoding="utf-8"))
        for column in ADDRESS_KEYS:
            with pytest.raises(psycopg2.errors.InsufficientPrivilege):
                with env.cursor() as cur:
                    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user)}),))
                    cur.execute("set local role authenticated")
                    cur.execute(f"select {column} from camp_registrations")
    finally:
        with env.cursor() as cur:
            cur.execute("grant select on public.camp_registrations to authenticated")
