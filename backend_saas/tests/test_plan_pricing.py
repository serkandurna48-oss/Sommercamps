"""Preismodell (Plan P): Grundgebühr je Regel, Monatsübersicht mit Summe,
Camp-Begrenzung im Paket Starter. Echte Wegwerf-Postgres, nur synthetische Daten."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest

from app import fees
from .auth_helpers import org_admin_headers, owner_headers
from .test_billing_fees import _add_rule, api  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, fake_provider  # noqa: F401

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261110100000_fee_rule_monthly_fee.sql"
LIMIT_DETAIL = {
    "code": "plan_camp_limit",
    "message": "Im Paket Starter ist 1 aktives Camp enthalten. Für weitere Camps wechsle ins Paket Verein.",
}


# ---------- fees.py (pure) ----------

def test_plan_monthly_defaults():
    assert fees.PLAN_MONTHLY_CENTS == {"starter": 0, "verein": 2490, "individuell": 0}


@pytest.mark.parametrize("plan,monthly,expected", [
    ("starter", None, 0), ("verein", None, 2490), ("individuell", None, 0),
    ("verein", 0, 0), ("verein", 1990, 1990), ("individuell", 5000, 5000), ("starter", 100, 100),
])
def test_monthly_fee_for(plan, monthly, expected):
    rule = fees.FeeRule(None, plan, Decimal("1"), None, None, None, monthly)
    assert fees.monthly_fee_for(rule) == expected


def test_default_rule_has_no_monthly_fee():
    assert fees.monthly_fee_for(fees.DEFAULT_RULE) == 0


# ---------- migration ----------

def test_migration_column_check_and_idempotent(real_db):
    cursor, tenant, _ = real_db
    with cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
    rid = _add_rule(cursor, tenant.organization_id, "verein", "4.90", date(2026, 1, 1))
    with cursor() as cur:
        cur.execute("select monthly_fee_cents from organization_fee_rules where id = %s", (rid,))
        assert cur.fetchone()["monthly_fee_cents"] is None
    with pytest.raises(psycopg2.errors.CheckViolation):
        with cursor() as cur:
            cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, monthly_fee_cents) "
                        "values (%s, 'verein', 4.9, '2026-01-01', -1)", (tenant.organization_id,))


def test_anon_and_authenticated_have_no_access_to_fee_rules(real_db):
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
        cur.execute("select has_column_privilege(%s, 'public.organization_fee_rules', 'monthly_fee_cents', 'SELECT') as ok",
                    ("anon",))
        # The harness re-grants all tables; the migration must itself revoke on re-run.
        assert cur.fetchone()["ok"] is False
        cur.execute("select has_column_privilege(%s, 'public.organization_fee_rules', 'monthly_fee_cents', 'SELECT') as ok",
                    ("authenticated",))
        assert cur.fetchone()["ok"] is False


# ---------- fee rules API ----------

def _rules_path(api):
    return f"/admin/platform/organizations/{api['slug']}/fee-rules"


def test_fee_rule_monthly_fee_roundtrip_and_defaults(api):
    c, h = api["client"], owner_headers(user_id=api["actor"])
    r = c.post(_rules_path(api), headers=h, json={"plan": "verein", "valid_from": "2026-01-01"})
    assert r.status_code == 201, r.text
    assert r.json()["current"]["monthly_fee_cents"] == 2490  # null -> Paketstandard
    r = c.post(_rules_path(api), headers=h, json={"plan": "individuell", "percent": "3", "monthly_fee_cents": 9900,
                                                  "valid_from": "2026-02-01"})
    body = r.json()
    assert body["current"]["monthly_fee_cents"] == 9900
    assert [x["monthly_fee_cents"] for x in body["history"]] == [9900, 2490]
    r = c.post(_rules_path(api), headers=h, json={"plan": "verein", "monthly_fee_cents": 0, "valid_from": "2026-03-01"})
    assert r.json()["current"]["monthly_fee_cents"] == 0  # explicit 0 is not "default"
    with api["cursor"]() as cur:
        cur.execute("select monthly_fee_cents from organization_fee_rules where organization_id=%s order by valid_from",
                    (api["org"],))
        assert [row["monthly_fee_cents"] for row in cur.fetchall()] == [None, 9900, 0]
        cur.execute("select metadata from audit_log where action='organization.fee_rule_added' and organization_id=%s "
                    "order by created_at", (api["org"],))
        assert cur.fetchall()[1]["metadata"]["monthly_fee_cents"] == 9900


def test_default_current_rule_shows_starter_zero(api):
    body = api["client"].get(_rules_path(api), headers=owner_headers()).json()
    assert body["current"]["plan"] == "starter" and body["current"]["monthly_fee_cents"] == 0


@pytest.mark.parametrize("value", [-1, -2490, 1000001, 1.5, "abc"])
def test_fee_rule_rejects_invalid_monthly_fee(api, value):
    r = api["client"].post(_rules_path(api), headers=owner_headers(),
                           json={"plan": "verein", "monthly_fee_cents": value, "valid_from": "2026-01-01"})
    assert r.status_code == 422
    assert "monthly_fee_cents" in r.text


# ---------- monthly overview ----------

def _paid(api, cursor, paid_at, fee_cents, collection="not_collected", base=10000):
    org = api["org"]
    camp = None
    with cursor() as cur:
        cur.execute("select id from camps where organization_id=%s and slug='summer-1'", (org,))
        camp = cur.fetchone()["id"]
        cur.execute(
            """insert into camp_registrations (organization_id, camp_id, registration_token, status, payment_status,
                   child_first_name, child_last_name, child_birth_date, parent_first_name, parent_last_name, parent_email, parent_phone, terms_accepted, privacy_accepted,
                   fee_plan, fee_percent, fee_base_cents, fee_cents, fee_collection, fee_snapshot_at)
               values (%s,%s,gen_random_uuid(),'registered','paid','K','T','2018-01-01','P','Q','p@example.com','1', true, true,
                       'starter',6.9,%s,%s,%s,%s)""",
            (org, camp, base, fee_cents, collection, paid_at))


def _fees_get(api, month):
    r = api["client"].get(f"/admin/platform/organizations/{api['slug']}/fees?month={month}", headers=owner_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_month_overview_adds_base_fee_valid_on_last_day_of_month(api):
    cursor = api["cursor"]
    _add_rule(cursor, api["org"], "starter", "6.90", date(2026, 1, 1))
    _add_rule(cursor, api["org"], "verein", "4.90", date(2026, 3, 15))
    _add_rule(cursor, api["org"], "individuell", "3.00", date(2026, 5, 1))
    _paid(api, cursor, datetime(2026, 3, 10, 10, tzinfo=timezone.utc), 700)
    _paid(api, cursor, datetime(2026, 3, 20, 10, tzinfo=timezone.utc), 300, collection="application_fee")
    body = _fees_get(api, "2026-03")
    assert body["monthly_fee_cents"] == 2490  # rule valid on 31 March
    assert body["total_cents"] == 700 + 300 + 2490
    # February: only the starter rule applies on the last day.
    body = _fees_get(api, "2026-02")
    assert body["monthly_fee_cents"] == 0 and body["total_cents"] == 0
    # Month without bookings still carries the base fee.
    body = _fees_get(api, "2026-04")
    assert body["monthly_fee_cents"] == 2490 and body["total_cents"] == 2490 and body["bookings"] == []
    # Individuell without explicit base fee: 0.
    assert _fees_get(api, "2026-05")["monthly_fee_cents"] == 0


def test_month_overview_uses_explicit_base_fee_and_net_of_refunds(api):
    cursor = api["cursor"]
    rid = _add_rule(cursor, api["org"], "verein", "4.90", date(2026, 1, 1))
    # append-only: new rule row with explicit base fee, same valid_from, newer
    with cursor() as cur:
        cur.execute("insert into organization_fee_rules (organization_id, plan, percent, valid_from, monthly_fee_cents, "
                    "created_at) values (%s,'verein',4.9,'2026-01-01',1990, now() + interval '5 seconds')", (api["org"],))
    _paid(api, cursor, datetime(2026, 6, 3, 10, tzinfo=timezone.utc), 500)
    with cursor() as cur:
        cur.execute("update camp_registrations set fee_refunded_cents = 200 where organization_id=%s", (api["org"],))
    body = _fees_get(api, "2026-06")
    assert body["monthly_fee_cents"] == 1990
    assert body["total_cents"] == 300 + 1990  # fee net of refund + base fee
    assert rid


def test_current_month_uses_rule_valid_today(api):
    cursor = api["cursor"]
    today = datetime.now(timezone.utc).astimezone(fees.BERLIN).date()
    _add_rule(cursor, api["org"], "verein", "4.90", today - timedelta(days=40))
    _add_rule(cursor, api["org"], "starter", "6.90", today + timedelta(days=1))  # not yet valid
    # A rule that starts later in the current month is not the one valid today.
    month = today.strftime("%Y-%m")
    assert _fees_get(api, month)["monthly_fee_cents"] == 2490


def test_month_overview_other_organization_has_own_base_fee(api):
    cursor = api["cursor"]
    _add_rule(cursor, api["other"], "verein", "4.90", date(2026, 1, 1))
    assert _fees_get(api, "2026-03")["monthly_fee_cents"] == 0


# ---------- Starter camp limit ----------

CAMP = {"title": "Zweites Camp", "start_date": "2027-08-01", "end_date": "2027-08-05",
        "age_min": 6, "age_max": 12, "capacity": 10, "price_cents": 10000}


def _camps_path(api):
    return f"/admin/organizations/{api['slug']}/camps"


def _post_camp(api, slug, status="published", org_headers=True, **over):
    headers = org_admin_headers(str(api["org"])) if org_headers else owner_headers()
    return api["client"].post(_camps_path(api), headers=headers, json={**CAMP, "slug": slug, "status": status, **over})


def _count(api, status="published"):
    with api["cursor"]() as cur:
        cur.execute("select count(*) as n from camps where organization_id=%s and status=%s and offer_id is null",
                    (api["org"], status))
        return cur.fetchone()["n"]


def test_starter_second_published_camp_is_rejected_on_create(api):
    # real_db already holds one published future camp (summer-1).
    r = _post_camp(api, "camp-2")
    assert r.status_code == 409
    assert r.json()["detail"] == LIMIT_DETAIL
    assert _count(api) == 1


def test_starter_limit_applies_to_platform_owner_too(api):
    r = _post_camp(api, "camp-2", org_headers=False)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "plan_camp_limit"


def test_starter_blocks_creating_a_draft_while_one_camp_is_active(api):
    r = _post_camp(api, "camp-2", status="draft")
    assert r.status_code == 409 and r.json()["detail"] == LIMIT_DETAIL
    assert _count(api, "draft") == 0


def test_starter_blocks_even_ended_draft_creation_while_one_camp_is_active(api):
    r = _post_camp(api, "camp-2", status="draft", start_date="2020-01-01", end_date="2020-01-05")
    assert r.status_code == 409


def test_starter_existing_draft_cannot_be_published_second_camp(api):
    with api["cursor"]() as cur:
        cur.execute("insert into camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, "
                    "price_cents, status) values (%s,'camp-2','D','2027-09-05','2027-09-09',6,12,5,1000,'draft')",
                    (api["org"],))
    r = api["client"].patch(f"{_camps_path(api)}/camp-2", headers=org_admin_headers(str(api["org"])),
                            json={"status": "published"})
    assert r.status_code == 409 and r.json()["detail"] == LIMIT_DETAIL


def test_starter_can_swap_active_camp_after_unpublishing(api):
    h = org_admin_headers(str(api["org"]))
    assert api["client"].patch(f"{_camps_path(api)}/summer-1", headers=h, json={"status": "closed"}).status_code == 200
    assert _post_camp(api, "camp-2").status_code == 201


def test_ended_camp_does_not_count(api):
    with api["cursor"]() as cur:
        cur.execute("update camps set start_date = current_date - 20, end_date = current_date - 10 "
                    "where organization_id=%s", (api["org"],))
    assert _post_camp(api, "camp-2").status_code == 201


def test_camp_ending_today_still_counts(api):
    today = datetime.now(timezone.utc).astimezone(fees.BERLIN).date()
    with api["cursor"]() as cur:
        cur.execute("update camps set start_date = %s, end_date = %s where organization_id=%s",
                    (today - timedelta(days=2), today, api["org"]))
    assert _post_camp(api, "camp-2").status_code == 409


@pytest.mark.parametrize("status", ["draft", "closed", "archived"])
def test_unpublished_camp_does_not_count(api, status):
    with api["cursor"]() as cur:
        cur.execute("update camps set status=%s where organization_id=%s", (status, api["org"]))
    assert _post_camp(api, "camp-2").status_code == 201


def test_trainings_do_not_count(api, real_db, fake_provider):
    _make(real_db)  # published offer + published future session
    _make(real_db)
    with api["cursor"]() as cur:
        cur.execute("update camps set status='draft' where organization_id=%s and offer_id is null", (api["org"],))
        cur.execute("select count(*) as n from camps where organization_id=%s and offer_id is not null and status='published'",
                    (api["org"],))
        assert cur.fetchone()["n"] >= 2
    assert _post_camp(api, "camp-2").status_code == 201
    assert _post_camp(api, "camp-3").status_code == 409  # camp-2 now is the one active camp


def test_other_organizations_camps_do_not_count(api):
    with api["cursor"]() as cur:
        cur.execute("update camps set status='draft' where organization_id=%s", (api["org"],))
        cur.execute("insert into camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, "
                    "price_cents, status) values (%s,'fremd','F','2027-07-05','2027-07-09',6,12,5,1000,'published')",
                    (api["other"],))
    assert _post_camp(api, "camp-2").status_code == 201


@pytest.mark.parametrize("plan,extra", [("verein", {}), ("individuell", {"percent": "3"})])
def test_verein_and_individuell_are_unlimited(api, plan, extra):
    _add_rule(api["cursor"], api["org"], plan, extra.get("percent", "4.90"), date(2026, 1, 1))
    for i in range(3):
        assert _post_camp(api, f"camp-{i}").status_code == 201
    assert _count(api) == 4


def test_explicit_starter_rule_is_limited_and_future_rule_not_yet(api):
    cursor = api["cursor"]
    _add_rule(cursor, api["org"], "verein", "4.90", date(2026, 1, 1))
    _add_rule(cursor, api["org"], "starter", "6.90", date.today() + timedelta(days=30))  # future: ignored
    assert _post_camp(api, "camp-2").status_code == 201
    # Switch to starter today: the two existing camps stay, a third cannot be published.
    _add_rule(cursor, api["org"], "starter", "6.90", date(2026, 1, 2),
              created_at=datetime.now(timezone.utc) + timedelta(seconds=5))
    assert _count(api) == 2
    assert _post_camp(api, "camp-3").status_code == 409
    assert _count(api) == 2  # nothing withdrawn automatically


def test_existing_surplus_camps_can_still_be_edited_in_starter(api):
    with api["cursor"]() as cur:
        cur.execute("insert into camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, "
                    "price_cents, status) values (%s,'alt','A','2027-09-05','2027-09-09',6,12,5,1000,'published')",
                    (api["org"],))
    h = org_admin_headers(str(api["org"]))
    assert api["client"].patch(f"{_camps_path(api)}/alt", headers=h, json={"title": "Neu"}).status_code == 200
    assert api["client"].patch(f"{_camps_path(api)}/alt", headers=h, json={"status": "published"}).status_code == 200


def test_reactivating_ended_camp_by_new_end_date_is_limited(api):
    with api["cursor"]() as cur:
        cur.execute("insert into camps (organization_id, slug, title, start_date, end_date, age_min, age_max, capacity, "
                    "price_cents, status) values (%s,'alt','A','2020-09-05','2020-09-09',6,12,5,1000,'published')",
                    (api["org"],))
    r = api["client"].patch(f"{_camps_path(api)}/alt", headers=org_admin_headers(str(api["org"])),
                            json={"end_date": "2027-12-01"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "plan_camp_limit"


# ---------- plan and active camps for the "new camp" hint ----------

def _org_get(api, headers):
    return api["client"].get(f"/admin/organizations/{api['slug']}", headers=headers)


def test_org_detail_shows_plan_and_active_camps(api):
    # real_db holds one published future camp; no fee rule = starter.
    for headers in (org_admin_headers(str(api["org"])), owner_headers()):
        body = _org_get(api, headers).json()
        assert body["plan"] == "starter" and body["active_camps"] == 1


def test_org_detail_active_camps_ignores_drafts_ended_and_trainings(api, real_db, fake_provider):
    _make(real_db)  # training offer + session do not count
    with api["cursor"]() as cur:
        cur.execute("update camps set status='draft' where organization_id=%s and offer_id is null", (api["org"],))
    assert _org_get(api, org_admin_headers(str(api["org"]))).json()["active_camps"] == 0
    with api["cursor"]() as cur:
        cur.execute("update camps set status='published', start_date = current_date - 20, end_date = current_date - 10 "
                    "where organization_id=%s and offer_id is null", (api["org"],))
    assert _org_get(api, org_admin_headers(str(api["org"]))).json()["active_camps"] == 0


def test_org_detail_plan_follows_fee_rule(api):
    _add_rule(api["cursor"], api["org"], "verein", "4.90", date(2026, 1, 1))
    assert _org_get(api, org_admin_headers(str(api["org"]))).json()["plan"] == "verein"


def test_org_detail_survives_plan_usage_failure(api, monkeypatch):
    from app.repositories import camps as camps_repo

    def boom(organization_id):
        raise RuntimeError("fee lookup down")

    monkeypatch.setattr(camps_repo, "plan_usage", boom)
    r = _org_get(api, org_admin_headers(str(api["org"])))
    assert r.status_code == 200
    assert r.json()["plan"] is None and r.json()["active_camps"] is None
