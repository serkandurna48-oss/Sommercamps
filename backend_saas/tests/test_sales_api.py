"""
Access rules of the sales CRM API (/sales). Repository and Supabase Auth are
monkeypatched; the SQL-level scoping (a rep's guessed lead id is not found)
is covered against a real database in test_sales_postgres.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.auth_deps import AuthContext, get_auth_context
from app.main import app
from app.repositories import organizations, platform_roles
from app.repositories import sales as sales_repo

from .auth_helpers import _FAKE_HEADERS, owner_headers

REP_ID = str(uuid4())
OTHER_REP_ID = str(uuid4())
LEAD_ID = str(uuid4())
NOW = datetime(2026, 11, 19, tzinfo=timezone.utc)


def _as_user(user_id: str, role: str | None, monkeypatch, org_ids: set[str] | None = None) -> dict:
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id=user_id, email=f"{user_id[:4]}@example.com", is_owner=False, admin_organization_ids=org_ids or set()
    )
    monkeypatch.setattr(sales_repo, "get_active_role", lambda uid: role if uid == user_id else None)
    return dict(_FAKE_HEADERS)


def _lead(owner: str | None = REP_ID, **over) -> dict:
    base = {
        "id": LEAD_ID, "name": "Soccer Academy Kassel", "kind": "fussballschule", "city": "Kassel",
        "website": None, "contact_name": None, "phone": None, "email": None, "fit": "A", "source_url": None,
        "status": "neu", "owner_user_id": owner, "owner_name": "Kristian", "next_action_at": None,
        "created_at": NOW, "updated_at": NOW,
    }
    base.update(over)
    return base


@pytest.fixture
def calls(monkeypatch):
    seen: list[tuple[str, dict]] = []

    def record(name, result):
        def fn(*args, **kwargs):
            seen.append((name, {"args": args, **kwargs}))
            return result() if callable(result) else result
        return fn

    monkeypatch.setattr(sales_repo, "list_leads", record("list_leads", lambda: [_lead()]))
    monkeypatch.setattr(sales_repo, "get_lead", record("get_lead", lambda: _lead()))
    monkeypatch.setattr(sales_repo, "list_activities", record("list_activities", []))
    monkeypatch.setattr(sales_repo, "list_members", record("list_members", []))
    monkeypatch.setattr(sales_repo, "create_lead", record("create_lead", lambda: _lead()))
    monkeypatch.setattr(sales_repo, "update_lead", record("update_lead", lambda: _lead(status="kontaktiert")))
    monkeypatch.setattr(sales_repo, "assign_lead", record("assign_lead", lambda: _lead(owner=OTHER_REP_ID)))
    monkeypatch.setattr(
        sales_repo, "team_overview", record("team_overview", {"members": [], "funnel": {}, "unassigned_open": 0})
    )
    monkeypatch.setattr(sales_repo, "existing_lead_keys", record("existing_lead_keys", set()))
    monkeypatch.setattr(sales_repo, "import_leads", record("import_leads", 0))
    monkeypatch.setattr(sales_repo, "upsert_member", record("upsert_member", {}))
    monkeypatch.setattr(sales_repo, "update_member", record("update_member", None))
    return seen


def _names(calls):
    return [name for name, _ in calls]


# --- who gets in at all -----------------------------------------------------------


def test_unauthenticated_is_401(calls):
    with TestClient(app) as client:
        assert client.get("/sales/leads").status_code == 401
        assert client.get("/sales/me").status_code == 401


def test_account_without_sales_role_is_403_even_as_org_admin(calls, monkeypatch):
    headers = _as_user(str(uuid4()), None, monkeypatch, org_ids={str(uuid4())})
    with TestClient(app) as client:
        for method, path in [("get", "/sales/me"), ("get", "/sales/leads"), ("get", f"/sales/leads/{LEAD_ID}"),
                             ("post", "/sales/leads"), ("get", "/sales/team")]:
            response = client.request(method, path, headers=headers, json={"name": "x"} if method == "post" else None)
            assert response.status_code == 403, path
    assert calls == []


def test_sales_role_grants_no_club_or_platform_access(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_lead", monkeypatch)
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: {"id": uuid4(), "slug": slug})
    with TestClient(app) as client:
        assert client.get("/admin/organizations", headers=headers).status_code == 403
        assert client.get("/admin/stats", headers=headers).status_code == 403
        assert client.get("/admin/platform/owners", headers=headers).status_code == 403
        assert client.get("/admin/organizations/ksv-baunatal/camps", headers=headers).status_code == 403


# --- sales_rep: own leads only --------------------------------------------------------


def test_rep_list_is_always_scoped_to_self(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        for query in ("", "?view=all", "?view=unassigned", f"?view=all&owner_user_id={OTHER_REP_ID}"):
            assert client.get(f"/sales/leads{query}", headers=headers).status_code == 200
    assert [c[1]["scope_user_id"] for c in calls] == [REP_ID] * 4


def test_rep_detail_and_update_pass_own_scope(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        assert client.get(f"/sales/leads/{LEAD_ID}", headers=headers).status_code == 200
        response = client.patch(f"/sales/leads/{LEAD_ID}", headers=headers, json={"status": "kontaktiert", "note": "Rückruf Fr"})
    assert response.status_code == 200
    get_call = next(c for n, c in calls if n == "get_lead")
    update_call = next(c for n, c in calls if n == "update_lead")
    assert get_call["scope_user_id"] == REP_ID
    assert update_call["scope_user_id"] == REP_ID
    assert update_call["changes"] == {"status": "kontaktiert"} and update_call["note"] == "Rückruf Fr"


def test_rep_gets_404_for_foreign_lead(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    monkeypatch.setattr(sales_repo, "get_lead", lambda lead_id, scope_user_id: None)
    monkeypatch.setattr(sales_repo, "update_lead", lambda *a, **k: None)
    with TestClient(app) as client:
        assert client.get(f"/sales/leads/{LEAD_ID}", headers=headers).status_code == 404
        assert client.patch(f"/sales/leads/{LEAD_ID}", headers=headers, json={"status": "demo"}).status_code == 404


def test_rep_created_lead_is_always_own(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        response = client.post("/sales/leads", headers=headers, json={"name": "TSV Neu", "owner_user_id": OTHER_REP_ID})
    assert response.status_code == 201
    assert next(c for n, c in calls if n == "create_lead")["owner_user_id"] == REP_ID


@pytest.mark.parametrize("body", [
    {"owner_user_id": OTHER_REP_ID},
    {"created_by": REP_ID},
    {"status": "erfunden"},
    {"role": "sales_lead"},
])
def test_rep_cannot_smuggle_fields_into_update(calls, monkeypatch, body):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        response = client.patch(f"/sales/leads/{LEAD_ID}", headers=headers, json=body)
    assert response.status_code == 422
    assert "update_lead" not in _names(calls)


@pytest.mark.parametrize("method,path,body", [
    ("get", "/sales/team", None),
    ("get", "/sales/assignees", None),
    ("post", f"/sales/leads/{LEAD_ID}/assign", {"owner_user_id": REP_ID}),
    ("get", "/sales/members", None),
    ("post", "/sales/members", {"email": "x@example.com", "display_name": "X"}),
    ("patch", f"/sales/members/{REP_ID}", {"role": "sales_lead"}),
    ("post", "/sales/leads/import", {"csv": "Name\nA\n"}),
])
def test_rep_cannot_use_manager_or_owner_routes(calls, monkeypatch, method, path, body):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        assert client.request(method, path, headers=headers, json=body).status_code == 403
    assert not set(_names(calls)) & {"team_overview", "assign_lead", "upsert_member", "update_member", "import_leads"}


# --- sales_lead: everything in sales, no account management ----------------------------


def test_lead_sees_all_and_can_assign(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_lead", monkeypatch)
    with TestClient(app) as client:
        assert client.get("/sales/leads?view=all", headers=headers).status_code == 200
        assert client.get("/sales/leads?view=unassigned", headers=headers).status_code == 200
        assert client.get("/sales/team", headers=headers).status_code == 200
        assigned = client.post(f"/sales/leads/{LEAD_ID}/assign", headers=headers, json={"owner_user_id": OTHER_REP_ID})
        me = client.get("/sales/me", headers=headers).json()
    assert assigned.status_code == 200
    lists = [c for n, c in calls if n == "list_leads"]
    assert lists[0]["scope_user_id"] is None and lists[1]["unassigned_only"] is True
    assert me == {"user_id": REP_ID, "email": f"{REP_ID[:4]}@example.com", "role": "sales_lead", "can_manage": True}


@pytest.mark.parametrize("method,path,body", [
    ("get", "/sales/members", None),
    ("post", "/sales/members", {"email": "x@example.com", "display_name": "X"}),
    ("post", "/sales/leads/import", {"csv": "Name\nA\n"}),
])
def test_lead_cannot_manage_accounts_or_import(calls, monkeypatch, method, path, body):
    headers = _as_user(REP_ID, "sales_lead", monkeypatch)
    with TestClient(app) as client:
        assert client.request(method, path, headers=headers, json=body).status_code == 403


def test_assign_to_non_member_is_422(calls, monkeypatch):
    headers = _as_user(REP_ID, "sales_lead", monkeypatch)

    def refuse(*a, **k):
        raise sales_repo.SalesMemberNotFoundError()

    monkeypatch.setattr(sales_repo, "assign_lead", refuse)
    with TestClient(app) as client:
        response = client.post(f"/sales/leads/{LEAD_ID}/assign", headers=headers, json={"owner_user_id": str(uuid4())})
    assert response.status_code == 422


# --- platform owner: accounts, import ---------------------------------------------------


def test_owner_invites_new_sales_account(calls, monkeypatch):
    new_id = str(uuid4())
    monkeypatch.setattr(supabase_auth, "find_user_by_email", lambda email: None)
    monkeypatch.setattr(supabase_auth, "create_user", lambda email, pw, email_confirmed: supabase_auth.SupabaseUser(id=new_id, email=email))
    links: list[dict] = []
    monkeypatch.setattr(
        supabase_auth, "generate_confirmation_link",
        lambda email, redirect_to, link_type: links.append({"redirect_to": redirect_to, "type": link_type}) or "https://link",
    )
    from app.notifications import sending

    mails: list[dict] = []
    monkeypatch.setattr(sending, "send_sales_invite_email", lambda **kw: mails.append(kw) or True)
    monkeypatch.setattr(
        sales_repo, "upsert_member",
        lambda **kw: {"user_id": kw["user_id"], "role": kw["role"], "display_name": kw["display_name"], "active": True, "created_at": NOW},
    )
    audits: list[dict] = []
    monkeypatch.setattr(platform_roles, "write_audit_log", lambda **kw: audits.append(kw))
    headers = owner_headers()
    with TestClient(app) as client:
        response = client.post("/sales/members", headers=headers,
                               json={"email": "kristian@example.com", "display_name": "Kristian", "role": "sales_lead"})
    assert response.status_code == 201
    body = response.json()
    assert body["invited"] is True and body["invite_mail_sent"] is True and body["role"] == "sales_lead"
    assert links == [{"redirect_to": "http://localhost:3000/vertrieb/neues-passwort", "type": "recovery"}]
    assert mails[0]["new_account"] is True and mails[0]["display_name"] == "Kristian"
    assert audits[0]["action"] == "sales.member_added"


def test_owner_member_invite_rejects_other_roles(calls):
    headers = owner_headers()
    with TestClient(app) as client:
        for role in ("platform_owner", "org_admin", "owner"):
            response = client.post("/sales/members", headers=headers,
                                   json={"email": "x@example.com", "display_name": "X", "role": role})
            assert response.status_code == 422


def test_owner_import_dry_run_writes_nothing(calls):
    headers = owner_headers()
    with TestClient(app) as client:
        response = client.post("/sales/leads/import", headers=headers,
                               json={"csv": "Name;Ort;Foo\nA;Kassel;x\nB;Fulda;y\n", "dry_run": True})
    assert response.status_code == 200
    assert response.json() == {"created": 2, "duplicates": 0, "invalid": 0, "unknown_columns": ["Foo"], "dry_run": True}
    assert "import_leads" not in _names(calls)


def test_owner_import_without_name_column_is_422(calls):
    headers = owner_headers()
    with TestClient(app) as client:
        response = client.post("/sales/leads/import", headers=headers, json={"csv": "Ort\nKassel\n"})
    assert response.status_code == 422


# --- login routing ----------------------------------------------------------------------


def test_me_reports_sales_role_for_routing(monkeypatch):
    headers = _as_user(REP_ID, "sales_rep", monkeypatch)
    with TestClient(app) as client:
        body = client.get("/admin/me", headers=headers).json()
    assert body["sales_role"] == "sales_rep" and body["is_platform_owner"] is False


def test_me_keeps_working_when_sales_tables_are_missing(monkeypatch):
    # Backend deployed before the migration: club logins must not break.
    headers = _as_user(REP_ID, None, monkeypatch)

    def missing(user_id):
        raise RuntimeError('relation "sales_members" does not exist')

    monkeypatch.setattr(sales_repo, "get_active_role", missing)
    with TestClient(app) as client:
        response = client.get("/admin/me", headers=headers)
    assert response.status_code == 200 and response.json()["sales_role"] is None
