"""Whole-record player delete, club-admin e-mails in the members list, review flag fallback."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.repositories import platform_roles
from app.repositories import registrations as registrations_repo
from app.routers import payments

from .auth_helpers import org_admin_headers, owner_headers
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401 - fixtures
from .test_admin_registration_delete import _book


@pytest.fixture
def audit(monkeypatch):
    entries = []
    monkeypatch.setattr(platform_roles, "write_audit_log", lambda **kw: entries.append(kw))
    return entries


def _player(cursor, tenant, reg):
    with cursor() as cur:
        cur.execute("select player_id from camp_registrations where registration_token = %s", (reg["registration_token"],))
        return cur.fetchone()["player_id"]


def _counts(cursor, tenant):
    with cursor() as cur:
        out = {}
        for table in ("players", "player_notes", "player_goals", "player_measurements"):
            cur.execute(f"select count(*) as n from {table} where organization_id = %s", (tenant.organization_id,))
            out[table] = cur.fetchone()["n"]
        return out


def test_delete_player_record_removes_everything_and_unlinks_cancelled_bookings(real_db, audit):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    player_id = _player(cursor, tenant, reg)
    registrations_repo.cancel_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    with cursor() as cur:
        cur.execute("insert into player_goals(organization_id, player_id, title, area) values (%s,%s,'Ziel','technik')", (tenant.organization_id, player_id))
        cur.execute("insert into player_measurements(organization_id, player_id, measured_on, metric, value, unit) values (%s,%s,'2027-01-01','sprint_10m',2.1,'s')", (tenant.organization_id, player_id))
    with TestClient(app) as client:
        response = client.delete(f"/admin/organizations/{tenant.slug}/players/{player_id}", headers=owner_headers())
    assert response.status_code == 204
    assert _counts(cursor, tenant) == {"players": 0, "player_notes": 0, "player_goals": 0, "player_measurements": 0}
    assert audit[0]["action"] == "player.deleted"
    assert audit[0]["metadata"] == {"notes": 0, "goals": 1, "measurements": 1, "anonymized_bookings": 1}
    assert audit[0]["target_id"] == str(player_id)


def test_delete_player_record_is_blocked_by_an_active_booking(real_db, audit):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    player_id = _player(cursor, tenant, reg)
    with TestClient(app) as client:
        response = client.delete(f"/admin/organizations/{tenant.slug}/players/{player_id}", headers=owner_headers())
    assert response.status_code == 409 and response.json()["detail"]["code"] == "player_has_active_registrations"
    assert _counts(cursor, tenant)["players"] == 1 and audit == []


def test_delete_player_record_is_tenant_scoped(real_db, audit):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    player_id = _player(cursor, tenant, reg)
    registrations_repo.cancel_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    other = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO organizations (id,slug,name,contact_email,site_published,plan_status,modules) VALUES (%s,%s,'Other','o@example.com',true,'active','{camps,players}')", (other, f"other-{other.hex}"))
        slug = f"other-{other.hex}"
    with TestClient(app) as client:
        # An admin of the other club cannot reach it, even with the real player id.
        response = client.delete(f"/admin/organizations/{slug}/players/{player_id}", headers=owner_headers())
        assert response.status_code == 404
        foreign_admin = org_admin_headers(str(other))
        assert client.delete(f"/admin/organizations/{tenant.slug}/players/{player_id}", headers=foreign_admin).status_code == 403
    assert _counts(cursor, tenant)["players"] == 1


def test_members_list_shows_admin_emails_and_falls_back_to_none(real_db, monkeypatch):
    cursor, tenant, _ = real_db
    admin_id = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (admin_id,))
        cur.execute("INSERT INTO organization_members(organization_id,user_id) VALUES (%s,%s)", (tenant.organization_id, admin_id))
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda user_id: "trainer@example.com" if user_id == str(admin_id) else None)
    with TestClient(app) as client:
        rows = client.get(f"/admin/organizations/{tenant.slug}/members", headers=owner_headers()).json()
    assert [(r["user_id"], r["email"]) for r in rows] == [(str(admin_id), "trainer@example.com")]
    monkeypatch.setattr(supabase_auth, "get_user_email", lambda user_id: None)
    with TestClient(app) as client:
        rows = client.get(f"/admin/organizations/{tenant.slug}/members", headers=owner_headers()).json()
    assert rows[0]["email"] is None


def test_get_user_email_needs_the_service_role_key(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "supabase_service_role_key", None, raising=False)
    assert supabase_auth.get_user_email(str(uuid4())) is None


def test_unmatched_payment_is_flagged_with_club_and_token_from_the_session(monkeypatch, audit):
    """After a delete the webhook finds no row; the review entry must still name club and booking."""
    org, token = str(uuid4()), str(uuid4())

    class _Cur:
        def execute(self, *a, **k): pass
        def fetchone(self): return None
        def __enter__(self): return self
        def __exit__(self, *a): return False

    monkeypatch.setattr(payments.db, "get_cursor", lambda: _Cur())
    monkeypatch.setattr(payments, "_fully_refunded", lambda *a: False)
    obj = {"id": "cs_x", "amount_total": 1000, "currency": "eur", "payment_intent": "pi_" + "a" * 20,
           "metadata": {"campspilot": "1", "organization_id": org}, "client_reference_id": token}
    monkeypatch.setattr(payments, "PAYMENT_INTENT_ID", __import__("re").compile(r"pi_[a-z]+"))
    result = payments._settle_checkout(None, obj, "acct_1", created=1)
    assert result == {"received": True, "settled": False}
    assert audit[0]["organization_id"] == org and audit[0]["target_id"] == token


def test_delete_player_record_anonymizes_child_data_in_cancelled_bookings(real_db, audit):
    cursor, tenant, camp = real_db
    reg = _book(tenant, camp)
    player_id = _player(cursor, tenant, reg)
    registrations_repo.cancel_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    with cursor() as cur:
        cur.execute("""update camp_registrations set allergies = 'Nüsse', medical_notes = 'Asthma', jersey_size = 'M',
                       pickup_authorized = 'Oma', emergency_contact_name = 'Tante', emergency_contact_phone = '123',
                       extra_answers = '{"x": "y"}'::jsonb, payment_status = 'paid', payment_method = 'online'
                       where registration_token = %s""", (reg["registration_token"],))
    with TestClient(app) as client:
        assert client.delete(f"/admin/organizations/{tenant.slug}/players/{player_id}", headers=owner_headers()).status_code == 204
    with cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token = %s", (reg["registration_token"],))
        row = cur.fetchone()
        cur.execute("select (child_birth_date >= current_date - interval '100 years') as plausible from camp_registrations where registration_token = %s", (reg["registration_token"],))
        assert cur.fetchone()["plausible"] is True
    assert (row["child_first_name"], row["child_last_name"]) == ("Gelöscht", "Gelöscht")
    for column in ("allergies", "medical_notes", "jersey_size", "pickup_authorized", "emergency_contact_name", "emergency_contact_phone", "player_id"):
        assert row[column] is None, column
    assert row["extra_answers"] == {}
    # Books stay intact.
    assert (row["status"], row["payment_status"], row["payment_method"]) == ("cancelled", "paid", "online")
    assert row["parent_email"] and row["registration_token"] == reg["registration_token"]


def test_get_user_email_survives_a_non_json_answer(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "service", raising=False)

    class _Response:
        status_code = 200

        def json(self):
            raise ValueError("not json")

    class _Client:
        def get(self, *a, **k):
            return _Response()

    monkeypatch.setattr(supabase_auth, "get_client", lambda: _Client())
    assert supabase_auth.get_user_email(str(uuid4())) is None
    assert supabase_auth.get_user_emails([str(uuid4()), str(uuid4())]) and supabase_auth.get_user_emails([]) == {}
