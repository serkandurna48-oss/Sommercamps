"""Per-organization modules (migration 20261106130000_organization_modules.sql).

Real disposable Postgres; synthetic data only. Admin auth by dependency override.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg2
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import players, training
from app.repositories import registrations as registrations_repo
from app.repositories.registrations import CampNotAvailableError
from app.schemas import RegistrationCreate
from .auth_helpers import org_admin_headers, owner_headers
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401

MIGRATION = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261106130000_organization_modules.sql"
OFFER = dict(slug="einzel-60", title="Einzeltraining 60", kind="einzel", duration_minutes=60,
             price_member_cents=3000, price_nonmember_cents=4500, status="published")


@pytest.fixture(autouse=True)
def fake_provider():
    provider = FakeProvider()
    reset_provider_for_testing(provider)
    yield provider
    reset_provider_for_testing(None)


@pytest.fixture
def ctx(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    actor = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (actor,))
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email,site_published,plan_status,modules) "
            "VALUES (%s,%s,'Other','o@example.com',true,'active','{camps,trainings,members,players}')",
            (other, f"other-{other.hex}"),
        )
    with TestClient(app) as client:
        yield dict(
            client=client, cursor=cursor, tenant=tenant, org=tenant.organization_id, slug=tenant.slug,
            other=other, other_slug=f"other-{other.hex}", actor=actor,
            headers=org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )


def _set_modules(c, modules, org=None):
    with c["cursor"]() as cur:
        cur.execute("update organizations set modules=%s where id=%s", (list(modules), org or c["org"]))


def _modules(c, org=None):
    with c["cursor"]() as cur:
        cur.execute("select modules from organizations where id=%s", (org or c["org"],))
        return cur.fetchone()["modules"]


def _offer_and_session(org):
    offer = training.create_offer(org, **OFFER)
    session = training.create_session(org, offer["id"], datetime(2030, 5, 6, 16, tzinfo=timezone.utc),
                                      status="published")
    return offer, session


def _book(c, session_slug, slug=None, **over):
    payload = _valid_payload(child_birth_date="2015-03-04", payment_method="ueberweisung")
    payload.update(over)
    return c["client"].post(f"/api/v1/organizations/{slug or c['slug']}/camps/{session_slug}/registrations",
                            json=payload)


def _admin_paths(c, slug=None, offer_id=None, pid=None):
    base = f"/admin/organizations/{slug or c['slug']}"
    paths = {
        "trainings": [f"{base}/training-offers", f"{base}/training-payments"],
        "members": [f"{base}/club-members"],
        "players": [f"{base}/players"],
    }
    if offer_id:
        paths["trainings"] += [f"{base}/training-offers/{offer_id}", f"{base}/training-offers/{offer_id}/sessions",
                               f"{base}/training-offers/{offer_id}/overview"]
    if pid:
        paths["players"].append(f"{base}/players/{pid}")
    return paths


# ---------- migration ----------

def test_column_default_and_check_constraint(ctx):
    c = ctx
    new = uuid4()
    with c["cursor"]() as cur:
        cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'N','n@example.com')",
                    (new, f"n-{new.hex}"))
        cur.execute("select modules from organizations where id=%s", (new,))
        assert cur.fetchone()["modules"] == ["camps"]
    for bad in (["trainings"], ["camps", "shop"], [], ["camps", "camps"], ["camps", "trainings", "trainings"]):
        with pytest.raises(psycopg2.errors.CheckViolation):
            with c["cursor"]() as cur:
                cur.execute("update organizations set modules=%s where id=%s", (bad, new))
    assert _modules(c, new) == ["camps"]


def test_backfill_rules_and_idempotency(ctx):
    c = ctx
    orgs = {name: uuid4() for name in ("plain", "train", "member", "note", "goal", "measure", "player_only")}
    with c["cursor"]() as cur:
        for name, oid in orgs.items():
            cur.execute("INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,%s,'b@example.com')",
                        (oid, f"bf-{oid.hex}", name))
    training.create_offer(orgs["train"], **OFFER)
    with c["cursor"]() as cur:
        cur.execute("insert into organization_memberships(organization_id,first_name,last_name,birth_date,match_key,source) "
                    "values (%s,'A','B','2015-01-01','a b','manual')", (orgs["member"],))
    pids = {n: players.find_or_create_player_id(orgs[n], "Lena", "M", date(2015, 1, 1))
            for n in ("note", "goal", "measure", "player_only")}
    with c["cursor"]() as cur:
        cur.execute("insert into player_notes(organization_id,player_id,note_date,body) values (%s,%s,'2027-01-01','x')",
                    (orgs["note"], pids["note"]))
        cur.execute("insert into player_goals(organization_id,player_id,title,area) values (%s,%s,'Ziel','technik')",
                    (orgs["goal"], pids["goal"]))
        cur.execute("insert into player_measurements(organization_id,player_id,measured_on,metric,value,unit) "
                    "values (%s,%s,'2027-01-01','sprint_10m',2.1,'s')", (orgs["measure"], pids["measure"]))
        cur.execute("update organizations set modules='{camps}' where id = any(%s)", (list(orgs.values()),))
    sql = MIGRATION.read_text(encoding="utf-8")
    for _ in range(2):  # second run: no-op
        with c["cursor"]() as cur:
            cur.execute(sql)
        assert _modules(c, orgs["plain"]) == ["camps"]
        assert _modules(c, orgs["player_only"]) == ["camps"]  # auto-created players do not count
        # premium bundle: trainings or members also bring the player file
        assert _modules(c, orgs["train"]) == ["camps", "trainings", "players"]
        assert _modules(c, orgs["member"]) == ["camps", "members", "players"]
        for name in ("note", "goal", "measure"):
            assert _modules(c, orgs[name]) == ["camps", "players"]


# ---------- admin gating ----------

def test_admin_endpoints_off_are_403_module_disabled_on_are_200(ctx):
    c = ctx
    offer, _ = _offer_and_session(c["org"])
    pid = players.find_or_create_player_id(c["org"], "Lena", "Mustermann", date(2015, 3, 4))
    paths = _admin_paths(c, offer_id=offer["id"], pid=pid)
    for module, urls in paths.items():
        _set_modules(c, [m for m in ("camps", "trainings", "members", "players") if m != module])
        for url in urls:
            r = c["client"].get(url, headers=c["headers"])
            assert r.status_code == 403, url
            assert r.json()["detail"] == {"code": "module_disabled", "module": module}
        _set_modules(c, ["camps", "trainings", "members", "players"])
        for url in urls:
            assert c["client"].get(url, headers=c["headers"]).status_code == 200, url


def test_admin_writes_blocked_when_off(ctx):
    c = ctx
    _set_modules(c, ["camps"])
    base = f"/admin/organizations/{c['slug']}"
    cl, h = c["client"], c["headers"]
    assert cl.post(f"{base}/training-offers", headers=h, json=OFFER).status_code == 403
    assert cl.post(f"{base}/club-members", headers=h,
                   json={"first_name": "A", "last_name": "B", "birth_date": "2015-01-01"}).status_code == 403
    pid = players.find_or_create_player_id(c["org"], "Lena", "M", date(2015, 1, 1))
    assert cl.post(f"{base}/players/{pid}/notes", headers=h,
                   json={"note_date": "2027-01-01", "body": "x"}).status_code == 403
    assert training.list_offers(c["org"]) == []


def test_platform_owner_is_gated_too(ctx):
    c = ctx
    _set_modules(c, ["camps"])
    h = owner_headers()
    r = c["client"].get(f"/admin/organizations/{c['slug']}/training-offers", headers=h)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "module_disabled"


def test_auth_checked_before_module(ctx):
    """Anonymous: 401; admin of another org: plain 403, no module information."""
    c = ctx
    _set_modules(c, ["camps"])
    url = f"/admin/organizations/{c['slug']}/players"
    app.dependency_overrides.clear()
    assert c["client"].get(url).status_code == 401
    h = org_admin_headers(str(c["other"]))
    r = c["client"].get(url, headers=h)
    assert r.status_code == 403 and r.json()["detail"] == "Not authorized for this organization"


def test_tenant_isolation_modules_are_per_org(ctx):
    c = ctx
    _set_modules(c, ["camps"])
    training.create_offer(c["other"], **OFFER)
    h = org_admin_headers(str(c["other"]))
    r = c["client"].get(f"/admin/organizations/{c['other_slug']}/training-offers", headers=h)
    assert r.status_code == 200 and len(r.json()) == 1
    assert c["client"].get(f"/api/v1/organizations/{c['other_slug']}/training-offers").status_code == 200
    assert c["client"].get(f"/api/v1/organizations/{c['slug']}/training-offers").status_code == 404


def test_camps_unaffected_when_all_premium_off(ctx):
    c = ctx
    _set_modules(c, ["camps"])
    cl = c["client"]
    assert cl.get(f"/api/v1/organizations/{c['slug']}").status_code == 200
    assert cl.get(f"/api/v1/organizations/{c['slug']}/camps").status_code == 200
    assert cl.get(f"/admin/organizations/{c['slug']}/camps", headers=c["headers"]).status_code == 200
    r = cl.post(f"/api/v1/organizations/{c['slug']}/camps/summer-1/registrations",
                json=_valid_payload(child_birth_date="2017-05-10"))
    assert r.status_code == 201, r.text


# ---------- public gating ----------

def test_public_training_offers_404_when_off(ctx):
    c = ctx
    offer, _ = _offer_and_session(c["org"])
    base = f"/api/v1/organizations/{c['slug']}/training-offers"
    assert c["client"].get(base).status_code == 200
    assert c["client"].get(f"{base}/{offer['slug']}").status_code == 200
    _set_modules(c, ["camps", "members", "players"])
    assert c["client"].get(base).status_code == 404
    assert c["client"].get(f"{base}/{offer['slug']}").status_code == 404


def test_booking_session_404_when_trainings_off(ctx):
    c = ctx
    _, session = _offer_and_session(c["org"])
    _set_modules(c, ["camps"])
    r = _book(c, session["slug"])
    assert r.status_code == 404
    with c["cursor"]() as cur:
        cur.execute("select count(*) n from camp_registrations where camp_id=%s", (session["id"],))
        assert cur.fetchone()["n"] == 0
    _set_modules(c, ["camps", "trainings"])
    assert _book(c, session["slug"]).status_code == 201


def test_booking_rechecks_module_under_lock(ctx):
    """Module switched off after the lookup: the locked transaction refuses."""
    c = ctx
    _, session = _offer_and_session(c["org"])
    target = registrations_repo.get_registration_target(c["tenant"], session["slug"])
    _set_modules(c, ["camps"])
    data = RegistrationCreate(**_valid_payload(child_birth_date="2015-03-04", payment_method="ueberweisung"))
    with pytest.raises(CampNotAvailableError):
        registrations_repo.create_training_registration(c["tenant"], target, data)


def test_member_price_only_with_members_module(ctx):
    c = ctx
    _, session = _offer_and_session(c["org"])
    r = c["client"].post(f"/admin/organizations/{c['slug']}/club-members", headers=c["headers"],
                         json={"first_name": "Lena", "last_name": "Mustermann", "birth_date": "2015-03-04"})
    assert r.status_code == 201, r.text
    _set_modules(c, ["camps", "trainings"])
    off = _book(c, session["slug"])
    assert off.status_code == 201 and off.json()["applied_price_cents"] == 4500
    _set_modules(c, ["camps", "trainings", "members"])
    # same child on a second session (a second booking of the same session is a duplicate)
    s2 = training.create_session(c["org"], session["offer_id"], datetime(2030, 5, 13, 16, tzinfo=timezone.utc),
                                 status="published")
    on = _book(c, s2["slug"])
    assert on.status_code == 201 and on.json()["applied_price_cents"] == 3000
    with c["cursor"]() as cur:
        cur.execute("select member_match from camp_registrations where camp_id = any(%s) order by created_at",
                    ([session["id"], s2["id"]],))
        assert [r["member_match"] for r in cur.fetchall()] == [None, True]


# ---------- platform owner endpoint ----------

def _patch(c, modules, headers=None, slug=None):
    return c["client"].patch(f"/admin/platform/organizations/{slug or c['slug']}/modules",
                             headers=headers or owner_headers(user_id=str(c["actor"])), json={"modules": modules})


def test_owner_sets_modules_with_audit(ctx):
    c = ctx
    _set_modules(c, ["camps"])
    r = _patch(c, ["players", "camps", "trainings", "players"])
    assert r.status_code == 200, r.text
    assert r.json()["modules"] == ["camps", "trainings", "players"]
    assert _modules(c) == ["camps", "trainings", "players"]
    r = _patch(c, ["camps"])
    assert r.json()["modules"] == ["camps"]
    with c["cursor"]() as cur:
        cur.execute("select action, metadata from audit_log where organization_id=%s "
                    "and action='organization.modules_changed' order by created_at", (c["org"],))
        rows = cur.fetchall()
    assert [r["metadata"]["enabled"] for r in rows] == [["trainings", "players"], []]
    assert rows[1]["metadata"]["disabled"] == ["trainings", "players"]


def test_modules_endpoint_validation_and_access(ctx):
    c = ctx
    assert _patch(c, ["camps", "shop"]).status_code == 422
    for without_camps in ([], ["trainings"]):
        r = _patch(c, without_camps)
        assert r.status_code == 422 and r.json()["detail"] == {"code": "camps_required"}
    assert c["client"].patch(f"/admin/platform/organizations/{c['slug']}/modules", headers=owner_headers(),
                             json={"modules": ["camps"], "x": 1}).status_code == 422
    assert _patch(c, ["camps"], slug="does-not-exist").status_code == 404
    admin = org_admin_headers(str(c["org"]))
    assert _patch(c, ["camps"], headers=admin).status_code == 403  # org_admin of this org
    app.dependency_overrides.clear()
    assert c["client"].patch(f"/admin/platform/organizations/{c['slug']}/modules",
                             json={"modules": ["camps"]}).status_code == 401
    assert _modules(c) == ["camps", "trainings", "members", "players"]


def test_modules_exposed_in_me_org_and_public(ctx):
    c = ctx
    _set_modules(c, ["camps", "players"])
    me = c["client"].get("/admin/me", headers=c["headers"]).json()
    assert me["organization_modules"] == {c["slug"]: ["camps", "players"]}
    org = c["client"].get(f"/admin/organizations/{c['slug']}", headers=c["headers"]).json()
    assert org["modules"] == ["camps", "players"]
    public = c["client"].get(f"/api/v1/organizations/{c['slug']}").json()
    assert public["modules"] == ["camps", "players"]
    listed = c["client"].get("/admin/organizations", headers=owner_headers()).json()
    assert next(o for o in listed if o["slug"] == c["slug"])["modules"] == ["camps", "players"]


def test_org_update_cannot_set_modules(ctx):
    c = ctx
    r = c["client"].patch(f"/admin/organizations/{c['slug']}", headers=c["headers"], json={"modules": ["camps"]})
    assert r.status_code == 422
    assert _modules(c) == ["camps", "trainings", "members", "players"]


# ---------- members module off: one price, no membership info ----------

def test_public_prices_single_without_members_module(ctx):
    c = ctx
    offer, session = _offer_and_session(c["org"])
    base = f"/api/v1/organizations/{c['slug']}/training-offers"
    on_list = c["client"].get(base).json()[0]
    assert (on_list["price_member_cents"], on_list["price_nonmember_cents"]) == (3000, 4500)
    _set_modules(c, ["camps", "trainings"])
    listed = c["client"].get(base).json()[0]
    assert listed["price_member_cents"] == listed["price_nonmember_cents"] == 4500
    assert listed["from_price_member_cents"] == listed["from_price_nonmember_cents"]
    detail = c["client"].get(f"{base}/{offer['slug']}").json()
    assert detail["price_member_cents"] == detail["price_nonmember_cents"] == 4500
    assert all(s["price_member_cents"] == s["price_nonmember_cents"] for s in detail["sessions"])


def test_member_books_at_the_shown_price_without_members_module(ctx):
    """Live-like: a real member, members module off. Page shows one price and the booking charges exactly it."""
    c = ctx
    offer, session = _offer_and_session(c["org"])
    r = c["client"].post(f"/admin/organizations/{c['slug']}/club-members", headers=c["headers"],
                         json={"first_name": "Lena", "last_name": "Mustermann", "birth_date": "2015-03-04"})
    assert r.status_code == 201
    _set_modules(c, ["camps", "trainings"])
    shown = c["client"].get(f"/api/v1/organizations/{c['slug']}/training-offers/{offer['slug']}").json()["sessions"][0]
    assert shown["price_member_cents"] == shown["price_nonmember_cents"]
    booked = _book(c, session["slug"])
    assert booked.status_code == 201
    assert booked.json()["applied_price_cents"] == shown["price_nonmember_cents"]


def test_players_api_omits_membership_without_members_module(ctx):
    c = ctx
    r = c["client"].post(f"/admin/organizations/{c['slug']}/club-members", headers=c["headers"],
                         json={"first_name": "Lena", "last_name": "Mustermann", "birth_date": "2015-03-04"})
    assert r.status_code == 201
    pid = players.find_or_create_player_id(c["org"], "Lena", "Mustermann", date(2015, 3, 4))
    base = f"/admin/organizations/{c['slug']}/players"
    assert c["client"].get(base, headers=c["headers"]).json()[0]["is_member"] is True
    assert c["client"].get(f"{base}/{pid}", headers=c["headers"]).json()["player"]["is_member"] is True
    _set_modules(c, ["camps", "players"])
    assert c["client"].get(base, headers=c["headers"]).json()[0]["is_member"] is None
    assert c["client"].get(f"{base}/{pid}", headers=c["headers"]).json()["player"]["is_member"] is None
