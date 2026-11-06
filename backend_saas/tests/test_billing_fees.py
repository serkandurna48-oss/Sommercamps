"""Billing B1: fee model, fee history, club invoice master data, fee snapshot.

Real disposable Postgres (REVIEW_POSTGRES_PORT); synthetic data only.
Admin auth by dependency override.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app import fees
from app.main import app
from .auth_helpers import org_admin_headers, owner_headers
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _post, _row, fake_provider  # noqa: F401

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261106140000_billing_profile_fee_rules.sql"
RULE = fees.FeeRule


# ---------- fee computation (pure) ----------

@pytest.mark.parametrize("percent,fixed,minimum,base,expected", [
    ("6.90", None, None, 14900, 1028),   # 1028.1 -> 1028
    ("4.90", None, None, 14900, 730),    # 730.1
    ("5.00", None, None, 4500, 225),
    ("6.90", None, None, 50, 3),         # 3.45 -> 3 (half-up on .5 only)
    ("5.00", None, None, 1010, 51),      # 50.5 -> 51 (half-up)
    ("5.00", 30, None, 4500, 255),       # + fixed per booking
    ("5.00", None, 300, 4500, 300),      # minimum fee
    ("5.00", 30, 100, 1000, 100),        # min applies after fixed: 50+30 < 100
    ("30.00", 5000, None, 1000, 1000),   # never more than the amount itself
    ("0.00", None, None, 1000, 0),
    ("6.90", 30, 100, 0, 0),             # free booking: no fee
])
def test_compute_fee_cents(percent, fixed, minimum, base, expected):
    rule = RULE(None, "individuell", Decimal(percent), fixed, minimum, None)
    assert fees.compute_fee_cents(rule, base) == expected


def test_plan_defaults():
    assert fees.plan_percent("starter", None) == Decimal("6.90")
    assert fees.plan_percent("verein", None) == Decimal("4.90")
    assert fees.plan_percent("verein", Decimal("3.5")) == Decimal("3.5")
    with pytest.raises(ValueError):
        fees.plan_percent("individuell", None)


def test_booking_date_uses_berlin_calendar_day():
    # 23:30 UTC on 31 Dec is already 1 Jan in Germany.
    assert fees.booking_date(datetime(2026, 12, 31, 23, 30, tzinfo=timezone.utc)) == date(2027, 1, 1)
    with pytest.raises(ValueError):
        fees.booking_date(datetime(2026, 12, 31, 23, 30))


# ---------- effective_fee with history (DB) ----------

def _add_rule(cursor, org, plan, percent, valid_from, created_at=None, **extra):
    with cursor() as cur:
        cur.execute(
            """insert into organization_fee_rules (organization_id, plan, percent, valid_from, fixed_cents,
                   min_fee_cents, created_at, created_by)
               values (%s, %s, %s, %s, %s, %s, coalesce(%s, now()), 'test') returning id""",
            (org, plan, Decimal(percent), valid_from, extra.get("fixed_cents"), extra.get("min_fee_cents"), created_at),
        )
        return cur.fetchone()["id"]


def test_effective_fee_default_and_history(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    assert fees.effective_fee(org, date(2026, 1, 1)) == fees.DEFAULT_RULE
    a = _add_rule(cursor, org, "starter", "6.90", date(2026, 1, 1))
    b = _add_rule(cursor, org, "individuell", "5.00", date(2026, 6, 1), fixed_cents=25, min_fee_cents=100)
    c = _add_rule(cursor, org, "verein", "4.90", date(2027, 1, 1))
    assert fees.effective_fee(org, date(2025, 12, 31)) == fees.DEFAULT_RULE  # before any rule
    assert fees.effective_fee(org, date(2026, 5, 31)).id == a
    rule = fees.effective_fee(org, date(2026, 6, 1))
    assert (rule.id, rule.plan, rule.percent, rule.fixed_cents, rule.min_fee_cents) == (b, "individuell", Decimal("5.00"), 25, 100)
    assert fees.effective_fee(org, date(2026, 12, 31)).id == b
    assert fees.effective_fee(org, date(2027, 3, 1)).id == c
    # Booking at 23:30 UTC on 31 Dec = 1 Jan in Berlin -> new rule.
    assert fees.effective_fee(org, datetime(2026, 12, 31, 23, 30, tzinfo=timezone.utc)).id == c
    # Same valid_from: the newest row is the correction that counts.
    later = datetime.now(timezone.utc) + timedelta(seconds=5)
    d = _add_rule(cursor, org, "individuell", "4.00", date(2027, 1, 1), created_at=later)
    assert fees.effective_fee(org, date(2027, 3, 1)).id == d


def test_effective_fee_is_tenant_scoped(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    with cursor() as cur:
        cur.execute("insert into organizations(id,slug,name,contact_email) values (%s,%s,'O','o@example.com')",
                    (other, f"o-{other.hex}"))
    _add_rule(cursor, other, "individuell", "1.00", date(2000, 1, 1))
    assert fees.effective_fee(tenant.organization_id, date(2026, 1, 1)) == fees.DEFAULT_RULE


# ---------- migration ----------

def test_rule_constraints_and_append_only(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    rid = _add_rule(cursor, org, "starter", "6.90", date(2026, 1, 1))
    for bad in (("shop", "5"), ("individuell", "30.01"), ("individuell", "-1")):
        with pytest.raises(psycopg2.errors.CheckViolation):
            _add_rule(cursor, org, bad[0], bad[1], date(2026, 1, 1))
    with pytest.raises(psycopg2.errors.RaiseException):
        with cursor() as cur:
            cur.execute("update organization_fee_rules set percent = 1 where id = %s", (rid,))
    with pytest.raises(psycopg2.errors.RaiseException):
        with cursor() as cur:
            cur.execute("delete from organization_fee_rules where id = %s", (rid,))
    # Deleting a whole (empty) organization still cascades.
    gone = uuid4()
    with cursor() as cur:
        cur.execute("insert into organizations(id,slug,name,contact_email) values (%s,%s,'G','g@example.com')",
                    (gone, f"g-{gone.hex}"))
    _add_rule(cursor, gone, "verein", "4.90", date(2026, 1, 1))
    with cursor() as cur:
        cur.execute("delete from organizations where id = %s", (gone,))
        cur.execute("select count(*) as n from organization_fee_rules where organization_id = %s", (gone,))
        assert cur.fetchone()["n"] == 0


def test_backfill_gives_existing_orgs_starter_once(real_db):
    cursor, tenant, _ = real_db
    with cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
        cur.execute(MIGRATION.read_text(encoding="utf-8"))  # idempotent
        cur.execute("select plan, percent, valid_from, created_by from organization_fee_rules where organization_id=%s",
                    (tenant.organization_id,))
        rows = cur.fetchall()
    assert [(r["plan"], r["percent"], r["valid_from"], r["created_by"]) for r in rows] == [
        ("starter", Decimal("6.90"), date(2000, 1, 1), None)]


def test_billing_profile_db_constraints(real_db):
    cursor, tenant, _ = real_db
    base = dict(legal_name="Verein e.V.", street="Hauptstr. 1", postal_code="34225", city="Baunatal",
                tax_number="026 123 45678", vat_id=None, tax_status="ust_pflichtig", default_vat_rate=19,
                tax_exemption_text=None, invoice_number_prefix="KSV-", invoice_email="rechnung@example.com")

    def insert(**over):
        values = {**base, **over}
        with cursor() as cur:
            cur.execute("delete from organization_billing_profiles where organization_id=%s", (tenant.organization_id,))
            cur.execute(
                f"insert into organization_billing_profiles (organization_id, {', '.join(values)}) "
                f"values (%s, {', '.join(['%s'] * len(values))})",
                (tenant.organization_id, *values.values()))

    insert()
    for over in ({"default_vat_rate": None}, {"default_vat_rate": 16}, {"postal_code": "1234"},
                 {"tax_number": None}, {"vat_id": "DE12"}, {"invoice_number_prefix": "jk-"},
                 {"tax_status": "steuerbefreit", "default_vat_rate": None},
                 {"tax_status": "kleinunternehmer", "default_vat_rate": 19}):
        with pytest.raises(psycopg2.errors.CheckViolation, match="chk_billing_profiles"):
            insert(**over)
    insert(tax_status="steuerbefreit", default_vat_rate=None, tax_number=None,
           tax_exemption_text="Steuerfrei nach § 4 Nr. 22 UStG")
    insert(tax_status="kleinunternehmer", default_vat_rate=None, tax_number=None, vat_id="DE123456789")


# ---------- billing profile API ----------

PROFILE = dict(
    legal_name="Testverein e.V.", street="Am Sportplatz 3", postal_code="34117", city="Kassel",
    tax_number="026 123 45678", vat_id="", tax_status="ust_pflichtig", default_vat_rate=19,
    tax_exemption_text="", invoice_number_prefix="tv-", invoice_email="rechnung@example.com",
)


@pytest.fixture
def api(real_db):
    cursor, tenant, _ = real_db
    other, actor = uuid4(), uuid4()
    with cursor() as cur:
        cur.execute("insert into auth.users(id) values (%s)", (actor,))  # audit_log FK
        cur.execute("insert into organizations(id,slug,name,contact_email,site_published,plan_status) "
                    "values (%s,%s,'Other','o@example.com',true,'active')", (other, f"other-{other.hex}"))
    with TestClient(app) as client:
        yield dict(client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug,
                   other=other, other_slug=f"other-{other.hex}", actor=str(actor))


def test_billing_profile_roundtrip_for_org_admin(api):
    c, headers = api["client"], org_admin_headers(str(api["org"]), user_id=api["actor"])
    path = f"/admin/organizations/{api['slug']}/billing-profile"
    assert c.get(path, headers=headers).json() is None
    r = c.put(path, headers=headers, json=PROFILE)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["invoice_number_prefix"] == "TV-" and body["vat_id"] is None and body["tax_exemption_text"] is None
    assert c.get(path, headers=headers).json()["legal_name"] == "Testverein e.V."
    # Switching to Kleinunternehmer drops the VAT rate.
    r = c.put(path, headers=headers, json={**PROFILE, "tax_status": "kleinunternehmer"})
    assert r.status_code == 200 and r.json()["default_vat_rate"] is None
    with api["cursor"]() as cur:
        cur.execute("select metadata from audit_log where action='organization.billing_profile_saved' "
                    "and organization_id=%s order by created_at", (api["org"],))
        entries = [row["metadata"] for row in cur.fetchall()]
    assert entries[0]["created"] is True and entries[-1]["changed_fields"] == ["tax_status", "default_vat_rate"]
    assert "Kassel" not in str(entries)  # field names only, never values


@pytest.mark.parametrize("change,field", [
    ({"default_vat_rate": None}, "default_vat_rate"),
    ({"default_vat_rate": 16}, "default_vat_rate"),
    ({"tax_number": "", "vat_id": ""}, "tax_number"),
    ({"tax_status": "steuerbefreit", "tax_exemption_text": ""}, "tax_exemption_text"),
    ({"postal_code": "3411"}, "postal_code"),
    ({"vat_id": "AT123456789"}, "vat_id"),
    ({"tax_number": "abc"}, "tax_number"),
    ({"invoice_number_prefix": "R E"}, "invoice_number_prefix"),
    ({"invoice_email": "kein-mail"}, "invoice_email"),
    ({"street": ""}, "street"),
])
def test_billing_profile_validation(api, change, field):
    r = api["client"].put(f"/admin/organizations/{api['slug']}/billing-profile",
                          headers=org_admin_headers(str(api["org"])), json={**PROFILE, **change})
    assert r.status_code == 422
    assert field in r.text


def test_billing_profile_tenant_isolation_and_owner(api):
    c = api["client"]
    path = f"/admin/organizations/{api['slug']}/billing-profile"
    assert c.put(path, json=PROFILE).status_code == 401
    foreign = org_admin_headers(str(api["other"]))
    assert c.get(path, headers=foreign).status_code == 403
    assert c.put(path, headers=foreign, json=PROFILE).status_code == 403
    assert c.put(path, headers=owner_headers(), json=PROFILE).status_code == 200
    # The other organization's own profile stays empty.
    assert c.get(f"/admin/organizations/{api['other_slug']}/billing-profile", headers=foreign).json() is None


# ---------- fee rules API (platform owner only) ----------

def test_fee_rules_are_platform_owner_only(api):
    c = api["client"]
    path = f"/admin/platform/organizations/{api['slug']}/fee-rules"
    assert c.get(path).status_code == 401
    admin = org_admin_headers(str(api["org"]))
    assert c.get(path, headers=admin).status_code == 403
    assert c.post(path, headers=admin, json={"plan": "verein", "valid_from": "2026-01-01"}).status_code == 403
    assert c.get(f"/admin/platform/organizations/unknown-{uuid4().hex}/fee-rules", headers=owner_headers()).status_code == 404


def test_fee_rules_add_history_and_current(api):
    c = api["client"]
    actor = api["actor"]
    headers = owner_headers(user_id=actor, email="chef@example.com")
    path = f"/admin/platform/organizations/{api['slug']}/fee-rules"
    body = c.get(path, headers=headers).json()
    assert body["history"] == [] and body["current"]["plan"] == "starter" and body["current"]["percent"] == "6.90"

    r = c.post(path, headers=headers, json={"plan": "verein", "valid_from": "2026-01-01"})
    assert r.status_code == 201, r.text
    assert r.json()["current"]["percent"] == "4.90"
    tomorrow = (date.today() + timedelta(days=30)).isoformat()
    r = c.post(path, headers=headers, json={"plan": "individuell", "percent": "5", "fixed_cents": 20,
                                            "min_fee_cents": 99, "valid_from": tomorrow, "note": "Vertrag 2027"})
    body = r.json()
    assert body["current"]["plan"] == "verein"  # future rule is not active yet
    assert [h["plan"] for h in body["history"]] == ["individuell", "verein"]
    assert body["history"][0]["created_by_email"] == "chef@example.com"
    assert body["history"][0]["fixed_cents"] == 20 and body["history"][0]["min_fee_cents"] == 99
    with api["cursor"]() as cur:
        cur.execute("select created_by from organization_fee_rules where organization_id=%s", (api["org"],))
        assert {row["created_by"] for row in cur.fetchall()} == {actor}
        cur.execute("select count(*) as n from audit_log where action='organization.fee_rule_added' "
                    "and organization_id=%s", (api["org"],))
        assert cur.fetchone()["n"] == 2
    # The other organization is untouched.
    assert c.get(f"/admin/platform/organizations/{api['other_slug']}/fee-rules", headers=headers).json()["history"] == []


@pytest.mark.parametrize("payload", [
    {"plan": "individuell", "valid_from": "2026-01-01"},
    {"plan": "individuell", "percent": "30.01", "valid_from": "2026-01-01"},
    {"plan": "individuell", "percent": "5.123", "valid_from": "2026-01-01"},
    {"plan": "individuell", "percent": "-1", "valid_from": "2026-01-01"},
    {"plan": "verein", "fixed_cents": -1, "valid_from": "2026-01-01"},
    {"plan": "verein", "min_fee_cents": 100001, "valid_from": "2026-01-01"},
    {"plan": "gold", "valid_from": "2026-01-01"},
    {"plan": "verein"},
])
def test_fee_rule_validation(api, payload):
    r = api["client"].post(f"/admin/platform/organizations/{api['slug']}/fee-rules",
                           headers=owner_headers(), json=payload)
    assert r.status_code == 422


# ---------- fee snapshot on manual payment ----------

def test_manual_paid_stores_fee_snapshot_once(api, real_db):
    cursor, tenant, _ = real_db
    c = api["client"]
    _add_rule(cursor, api["org"], "individuell", "5.00", date(2000, 1, 1), fixed_cents=10)
    r = c.post(f"/api/v1/organizations/{api['slug']}/camps/summer-1/registrations", json=_valid_payload())
    assert r.status_code == 201, r.text
    token = r.json()["registration_token"]
    path = f"/admin/organizations/{api['slug']}/camps/summer-1/registrations/{token}/payment-status"
    headers = org_admin_headers(str(api["org"]))
    assert c.patch(path, headers=headers, json={"payment_status": "paid"}).status_code == 200
    with cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token=%s", (token,))
        row = cur.fetchone()
    # camp price 1000 ct: 5 % = 50 + 10 fixed
    assert (row["fee_plan"], row["fee_percent"], row["fee_fixed_cents"], row["fee_base_cents"], row["fee_cents"],
            row["fee_collection"]) == ("individuell", Decimal("5.00"), 10, 1000, 60, "not_collected")
    first = row["fee_snapshot_at"]
    # A later rule change does not rewrite an existing snapshot.
    _add_rule(cursor, api["org"], "individuell", "9.00", date(2000, 1, 1),
              created_at=datetime.now(timezone.utc) + timedelta(seconds=5))
    c.patch(path, headers=headers, json={"payment_status": "open"})
    c.patch(path, headers=headers, json={"payment_status": "paid"})
    with cursor() as cur:
        cur.execute("select fee_cents, fee_snapshot_at from camp_registrations where registration_token=%s", (token,))
        again = cur.fetchone()
    assert (again["fee_cents"], again["fee_snapshot_at"]) == (60, first)


def test_open_or_waived_has_no_snapshot(api, real_db):
    cursor, _, _ = real_db
    c = api["client"]
    token = c.post(f"/api/v1/organizations/{api['slug']}/camps/summer-1/registrations",
                   json=_valid_payload()).json()["registration_token"]
    c.patch(f"/admin/organizations/{api['slug']}/camps/summer-1/registrations/{token}/payment-status",
            headers=org_admin_headers(str(api["org"])), json={"payment_status": "waived"})
    with cursor() as cur:
        cur.execute("select fee_snapshot_at from camp_registrations where registration_token=%s", (token,))
        assert cur.fetchone()["fee_snapshot_at"] is None


def test_training_snapshot_uses_applied_price(real_db):
    cursor, tenant, _ = real_db
    _add_rule(cursor, tenant.organization_id, "verein", "4.90", date(2000, 1, 1))
    _, session = _make(real_db, member=3000, nonmember=4500)
    r = _post(real_db, session)
    assert r.status_code == 201, r.text
    token = r.json()["registration_token"]
    row = _row(real_db, token)
    assert row["applied_price_cents"] == 4500
    with cursor() as cur:
        fees.snapshot_paid_registration(cur, row["id"], tenant.organization_id)
    row = _row(real_db, token)
    assert (row["fee_base_cents"], row["fee_cents"], row["fee_plan"]) == (4500, 221, "verein")  # 220.5 -> 221
