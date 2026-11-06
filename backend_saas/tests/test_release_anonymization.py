"""Release abrechnung + admin-fixes: player-record delete vs. linker, birth
date CHECK, invoices (retention) and exports. Real local Postgres, synthetic
data only."""

from __future__ import annotations

from datetime import date
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.repositories import players as players_repo
from app.repositories import registrations as registrations_repo
from app.routers import exports

from .auth_helpers import owner_headers
from .test_admin_registration_delete import _book
from .test_invoices import _invoices, _pay_manually, _profile, mail  # noqa: F401
from .test_billing_stripe_express import _register, _reg, env  # noqa: F401
from .test_player_delete_and_member_emails import _player, audit  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401


def _delete_player(tenant_slug, player_id):
    with TestClient(app) as client:
        return client.delete(f"/admin/organizations/{tenant_slug}/players/{player_id}", headers=owner_headers())


def _cancelled_child(cursor, tenant, camp, name):
    reg = _book(tenant, camp, child_first_name=name)
    registrations_repo.cancel_registration_and_promote_next(tenant, camp.id, reg["registration_token"])
    return reg, _player(cursor, tenant, reg)


def _row(cursor, token):
    with cursor() as cur:
        cur.execute("select * from camp_registrations where registration_token = %s", (token,))
        return cur.fetchone()


def test_linker_after_player_delete_recreates_no_player_and_merges_nothing(real_db, audit):
    """N-8: two different children, both anonymized, must not come back as one
    "Gelöscht Gelöscht" player when the backend starts."""
    cursor, tenant, camp = real_db
    first, first_player = _cancelled_child(cursor, tenant, camp, "Anna")
    second, second_player = _cancelled_child(cursor, tenant, camp, "Ben")
    assert _delete_player(tenant.slug, first_player).status_code == 204
    assert _delete_player(tenant.slug, second_player).status_code == 204

    players_repo.link_unlinked_registrations()
    players_repo.link_unlinked_registrations()

    with cursor() as cur:
        cur.execute("select count(*) as n from players where organization_id = %s", (tenant.organization_id,))
        assert cur.fetchone()["n"] == 0
    for reg in (first, second):
        row = _row(cursor, reg["registration_token"])
        assert row["player_id"] is None and row["anonymized_at"] is not None


def test_correcting_an_anonymized_booking_links_no_player(real_db, audit):
    cursor, tenant, camp = real_db
    reg, player_id = _cancelled_child(cursor, tenant, camp, "Clara")
    assert _delete_player(tenant.slug, player_id).status_code == 204
    registrations_repo.update_registration_details(
        tenant.organization_id, camp.id, reg["registration_token"],
        child_first_name="Gelöscht", child_last_name="Gelöscht", jersey_size=None,
        allergies=None, pickup_authorized=None,
    )
    assert _row(cursor, reg["registration_token"])["player_id"] is None


def test_anonymized_birth_date_is_the_booking_date_and_stays_inside_the_check(real_db, audit):
    """N-9: the placeholder must satisfy the plausibility CHECK on every later
    update, not just today."""
    cursor, tenant, camp = real_db
    reg, player_id = _cancelled_child(cursor, tenant, camp, "Dora")
    assert _delete_player(tenant.slug, player_id).status_code == 204
    row = _row(cursor, reg["registration_token"])
    assert row["child_birth_date"] == row["created_at"].date()
    with cursor() as cur:
        cur.execute("""select pg_get_constraintdef(oid) as def from pg_constraint
                       where conname = 'chk_camp_registrations_child_birth_date_plausible'""")
        definition = cur.fetchone()["def"]
        assert "CURRENT_DATE" in definition and "100 years" in definition
        # The CHECK re-evaluated on a later day (here: in 5 years): booking date
        # passes, the former "today minus 99 years" placeholder would not.
        cur.execute("""select %(b)s::date <= current_date + interval '5 years'
                              and %(b)s::date >= current_date + interval '5 years' - interval '100 years' as booking_ok,
                              (current_date - interval '99 years')::date
                                  >= current_date + interval '5 years' - interval '100 years' as old_ok""",
                    {"b": row["child_birth_date"]})
        result = cur.fetchone()
        assert (result["booking_ok"], result["old_ok"]) == (True, False)
        # A real later update of the row passes the CHECK.
        cur.execute("update camp_registrations set payment_status = 'refunded' where registration_token = %s",
                    (reg["registration_token"],))


def test_player_delete_keeps_the_invoice_unchanged(env, mail, audit):
    """Retention: anonymization leaves invoice snapshot and PDF untouched and
    does not trip the invoices immutability trigger."""
    _profile(env)
    token = _register(env)
    _pay_manually(env, token)
    cancel = f"/admin/organizations/{env.slug}/camps/summer-1/registrations/{token}/cancel"
    assert env.client.post(cancel, headers=env.admin()).status_code == 200
    before = _invoices(env, token)
    assert [d["kind"] for d in before] == ["invoice", "storno"]
    player_id = _reg(env, token)["player_id"]
    r = env.client.delete(f"/admin/organizations/{env.slug}/players/{player_id}", headers=owner_headers())
    assert r.status_code == 204, r.text
    after = _invoices(env, token)
    assert after == before
    assert before[0]["data"] == after[0]["data"] and bytes(before[0]["pdf"]) == bytes(after[0]["pdf"])
    assert _reg(env, token)["child_first_name"] == "Gelöscht"


def test_exports_show_anonymized_bookings_as_geloescht_without_birth_date():
    """N-10."""
    row = {"child_first_name": "Gelöscht", "child_last_name": "Gelöscht", "child_birth_date": date(2027, 1, 1),
           "anonymized_at": "2027-02-01T00:00:00Z"}
    assert exports._child_columns(row) == ("Gelöscht", "", None)
    assert exports._child_name(row) == "Gelöscht"
    live = {**row, "child_first_name": "Mia", "child_last_name": "Test", "anonymized_at": None}
    assert exports._child_columns(live) == ("Mia", "Test", date(2027, 1, 1))


@pytest.mark.parametrize("failure", [httpx.ConnectError("down"), RuntimeError("boom"), KeyError("x")])
def test_get_user_email_returns_none_on_any_exception(monkeypatch, failure):
    """N-11."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "supabase_service_role_key", "service", raising=False)

    class _Client:
        def get(self, *a, **k):
            raise failure

    monkeypatch.setattr(supabase_auth, "get_client", lambda: _Client())
    assert supabase_auth.get_user_email(str(uuid4())) is None
