"""Sales CRM against a disposable loopback PostgreSQL database.

Run: REVIEW_POSTGRES_PORT=55443 python -m pytest tests/test_sales_postgres.py -q
Skipped without REVIEW_POSTGRES_PORT (CI sets it). Never reads DATABASE_URL.
Synthetic users and leads only.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import pytest

from app.repositories import sales as repo

from .test_review_postgres import local_database, real_db  # noqa: F401 - pytest fixtures

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261119140000_sales_crm.sql"


@pytest.fixture
def crm(real_db):  # noqa: F811
    cursor, *_ = real_db
    rep_a, rep_b, lead_user, inactive, owner = (str(uuid4()) for _ in range(5))
    with cursor() as cur:
        cur.execute("DELETE FROM sales_activities; DELETE FROM sales_leads; DELETE FROM sales_members")
        for user in (rep_a, rep_b, lead_user, inactive, owner):
            cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (user,))
        cur.execute(
            "INSERT INTO sales_members(user_id, role, display_name, active) VALUES "
            "(%s,'sales_rep','Kristian',true),(%s,'sales_rep','Leandro',true),"
            "(%s,'sales_lead','Leitung',true),(%s,'sales_rep','Alt',false)",
            (rep_a, rep_b, lead_user, inactive),
        )
    lead_a = repo.create_lead(data={"name": "Soccer Academy Kassel", "city": "Kassel"}, owner_user_id=rep_a,
                              actor_user_id=owner, note="Startliste")
    lead_b = repo.create_lead(data={"name": "RSV Göttingen 05"}, owner_user_id=rep_b, actor_user_id=owner, note=None)
    pool = repo.create_lead(data={"name": "Fußball Akademie Fulda"}, owner_user_id=None, actor_user_id=owner, note=None)
    return cursor, rep_a, rep_b, lead_user, inactive, owner, str(lead_a["id"]), str(lead_b["id"]), str(pool["id"])


def test_migration_is_idempotent(crm):
    cursor = crm[0]
    with cursor() as cur:
        cur.execute(MIGRATION.read_text(encoding="utf-8"))
        cur.execute("SELECT count(*) AS n FROM sales_leads")
        assert cur.fetchone()["n"] == 3


def test_sales_tables_have_no_link_to_club_or_child_data(crm):
    cursor = crm[0]
    with cursor() as cur:
        cur.execute(
            """
            SELECT conrelid::regclass::text AS tbl, confrelid::regclass::text AS ref
            FROM pg_constraint WHERE contype = 'f'
              AND conrelid::regclass::text IN ('sales_members', 'sales_leads', 'sales_activities')
            """
        )
        refs = {row["ref"] for row in cur.fetchall()}
    assert refs <= {"auth.users", "sales_leads"}


def test_rls_hides_sales_tables_from_data_api_roles(crm):
    cursor = crm[0]
    with cursor() as cur:
        cur.execute("SET LOCAL ROLE authenticated")
        for table in ("sales_members", "sales_leads", "sales_activities"):
            cur.execute(f"SELECT * FROM {table}")
            assert cur.fetchall() == [], table


def test_rep_sees_and_changes_only_own_leads(crm):
    _, rep_a, rep_b, _, _, _, lead_a, lead_b, pool = crm
    assert [l["name"] for l in repo.list_leads(scope_user_id=rep_a)] == ["Soccer Academy Kassel"]
    # scope wins over any filter a caller might pass
    assert len(repo.list_leads(scope_user_id=rep_a, unassigned_only=True, owner_filter=rep_b)) == 1
    assert repo.get_lead(lead_b, scope_user_id=rep_a) is None
    assert repo.get_lead(pool, scope_user_id=rep_a) is None
    assert repo.update_lead(lead_b, changes={"status": "verloren"}, note="x", scope_user_id=rep_a, actor_user_id=rep_a) is None
    assert repo.get_lead(lead_b, scope_user_id=None)["status"] == "neu"
    assert repo.list_activities(lead_b)[0]["kind"] == "angelegt"  # no foreign note was written


def test_update_logs_status_and_note_in_one_step(crm):
    _, rep_a, *_rest = crm
    lead_a = crm[6]
    row = repo.update_lead(lead_a, changes={"status": "kontaktiert", "next_action_at": date(2026, 11, 25)},
                           note="Rückruf Freitag", scope_user_id=rep_a, actor_user_id=rep_a)
    assert row["status"] == "kontaktiert" and row["next_action_at"] == date(2026, 11, 25)
    kinds = [(a["kind"], a["body"], a["actor_name"]) for a in repo.list_activities(lead_a)]
    assert ("status", "neu → kontaktiert", "Kristian") in kinds
    assert ("notiz", "Rückruf Freitag", "Kristian") in kinds
    assert row["owner_user_id"] == rep_a  # ownership untouched by update


def test_manager_views(crm):
    _, rep_a, rep_b, *_ = crm
    assert len(repo.list_leads(scope_user_id=None)) == 3
    assert [l["name"] for l in repo.list_leads(scope_user_id=None, unassigned_only=True)] == ["Fußball Akademie Fulda"]
    assert [l["owner_name"] for l in repo.list_leads(scope_user_id=None, owner_filter=rep_b)] == ["Leandro"]


def test_assign_only_to_active_members_and_logged(crm):
    _, rep_a, rep_b, lead_user, inactive, owner, lead_a, _, pool = crm
    with pytest.raises(repo.SalesMemberNotFoundError):
        repo.assign_lead(pool, owner_user_id=inactive, actor_user_id=lead_user)
    with pytest.raises(repo.SalesMemberNotFoundError):
        repo.assign_lead(pool, owner_user_id=owner, actor_user_id=lead_user)  # platform owner is no sales member
    row = repo.assign_lead(pool, owner_user_id=rep_b, actor_user_id=lead_user)
    assert row["owner_user_id"] == rep_b
    assert repo.list_activities(pool)[0]["body"] == "zugewiesen an Leandro"
    assert repo.assign_lead(str(uuid4()), owner_user_id=rep_b, actor_user_id=lead_user) is None
    repo.assign_lead(lead_a, owner_user_id=None, actor_user_id=lead_user)
    assert repo.get_lead(lead_a, scope_user_id=rep_a) is None  # rep loses access immediately


def test_team_overview_counts(crm):
    _, rep_a, rep_b, lead_user, *_ = crm
    lead_a = crm[6]
    repo.update_lead(lead_a, changes={"next_action_at": date.today() - timedelta(days=1)}, note=None,
                     scope_user_id=rep_a, actor_user_id=rep_a)
    repo.create_lead(data={"name": "Gewonnen e.V."}, owner_user_id=rep_a, actor_user_id=lead_user, note=None)
    won = repo.list_leads(scope_user_id=rep_a)[-1]
    repo.update_lead(str(won["id"]), changes={"status": "gewonnen"}, note=None, scope_user_id=rep_a, actor_user_id=rep_a)
    overview = repo.team_overview(date.today())
    kristian = next(m for m in overview["members"] if m["display_name"] == "Kristian")
    assert (kristian["total"], kristian["open"], kristian["won"], kristian["overdue"]) == (2, 1, 1, 1)
    assert kristian["by_status"] == {"neu": 1, "gewonnen": 1}
    assert kristian["last_activity_at"] is not None
    assert overview["unassigned_open"] == 1
    assert overview["funnel"]["neu"] == 3 and overview["funnel"]["gewonnen"] == 1


def test_inactive_member_has_no_role(crm):
    _, rep_a, _, _, inactive, *_ = crm
    assert repo.get_active_role(rep_a) == "sales_rep"
    assert repo.get_active_role(inactive) is None
    assert repo.get_active_role(str(uuid4())) is None


def test_member_upsert_reactivates_and_updates(crm):
    _, _, _, _, inactive, *_ = crm
    row = repo.upsert_member(user_id=inactive, role="sales_lead", display_name="Wieder da")
    assert (row["role"], row["display_name"], row["active"]) == ("sales_lead", "Wieder da", True)
    row = repo.update_member(inactive, {"active": False, "user_id": "ignored"})
    assert row["active"] is False and repo.get_active_role(inactive) is None


def test_import_is_all_or_nothing_and_dedupes(crm):
    _, _, _, _, _, owner, *_ = crm
    assert ("soccer academy kassel", "kassel") in repo.existing_lead_keys()
    created = repo.import_leads([{"name": "A e.V.", "kind": "verein", "note": "aus CSV"}, {"name": "B"}], actor_user_id=owner)
    assert created == 2
    imported = [l for l in repo.list_leads(scope_user_id=None, unassigned_only=True) if l["name"] in ("A e.V.", "B")]
    assert len(imported) == 2
    with pytest.raises(Exception):
        repo.import_leads([{"name": "C"}, {"name": "x" * 300}], actor_user_id=owner)  # violates length check
    assert not [l for l in repo.list_leads(scope_user_id=None) if l["name"] == "C"]
