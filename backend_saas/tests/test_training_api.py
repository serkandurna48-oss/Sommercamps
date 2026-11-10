"""Admin + public API for training offers and sessions (Stufe 1, Task 4).

Real disposable Postgres; synthetic data only. Admin auth by dependency override.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import training
from .auth_helpers import org_admin_headers, owner_headers
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401


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
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (actor,))  # audit_log.actor_user_id FK
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email,site_published,plan_status,modules) "
            "VALUES (%s,%s,'Other','o@example.com',true,'active','{camps,trainings,members}')",
            (other, f"other-{other.hex}"),
        )
    with TestClient(app) as client:
        yield dict(
            client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug,
            other=other, other_slug=f"other-{other.hex}",
            headers=org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )


OFFER = dict(slug="einzel-60", title="Einzeltraining 60", kind="einzel", duration_minutes=60,
             price_member_cents=3000, price_nonmember_cents=4500)


def _admin(c, slug=None):
    return f"/admin/organizations/{slug or c['slug']}/training-offers"


def _public(c, slug=None):
    return f"/api/v1/organizations/{slug or c['slug']}/training-offers"


def _new_offer(c, **over):
    body = {**OFFER, **over}
    r = c["client"].post(_admin(c), headers=c["headers"], json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _new_session(c, offer, date="2030-05-06", start_time="18:00", **over):
    r = c["client"].post(f"{_admin(c)}/{offer['id']}/sessions", headers=c["headers"],
                         json={"date": date, "start_time": start_time, **over})
    return r


def _book(c, session_slug, **overrides):
    payload = _valid_payload(child_birth_date="2015-03-04", payment_method="ueberweisung")
    payload.update(overrides)
    return c["client"].post(
        f"/api/v1/organizations/{c['slug']}/camps/{session_slug}/registrations", json=payload
    )


# ---------- access / tenant boundary ----------

def test_anonymous_rejected(ctx):
    c = ctx
    app.dependency_overrides.clear()
    assert c["client"].get(_admin(c)).status_code == 401
    assert c["client"].post(_admin(c), json=OFFER).status_code == 401


def test_admin_of_other_org_cannot_touch_this_org(ctx):
    c = ctx
    offer = _new_offer(c)
    session = _new_session(c, offer).json()
    h = org_admin_headers(str(c["other"]))
    cl, base = c["client"], _admin(c)
    one = f"{base}/{offer['id']}"
    assert cl.get(base, headers=h).status_code == 403
    assert cl.post(base, headers=h, json={**OFFER, "slug": "x"}).status_code == 403
    assert cl.get(one, headers=h).status_code == 403
    assert cl.patch(one, headers=h, json={"title": "Hack"}).status_code == 403
    assert cl.get(f"{one}/sessions", headers=h).status_code == 403
    assert cl.post(f"{one}/sessions", headers=h, json={"date": "2030-05-07", "start_time": "10:00"}).status_code == 403
    assert cl.delete(f"{one}/sessions/{session['id']}", headers=h).status_code == 403
    assert cl.post(f"{one}/sessions/{session['id']}/cancel", headers=h).status_code == 403
    assert cl.get(f"{one}/sessions/{session['id']}/registrations", headers=h).status_code == 403
    assert len(training.list_offers(c["org"])) == 1
    assert training.get_offer(c["org"], offer["id"])["title"] == "Einzeltraining 60"


def test_foreign_ids_under_own_org_path_are_404(ctx):
    """Admin of A uses A's slug with ids that belong to org B: 404, B unchanged."""
    c = ctx
    foreign = training.create_offer(c["other"], **{k: v for k, v in OFFER.items()})
    fsession = training.create_session(c["other"], foreign["id"], datetime(2030, 5, 6, 16, tzinfo=timezone.utc),
                                       status="published")
    own = _new_offer(c, slug="own-offer")
    own_session = _new_session(c, own).json()
    cl, h, base = c["client"], c["headers"], _admin(c)
    fo = f"{base}/{foreign['id']}"
    assert cl.get(fo, headers=h).status_code == 404
    assert cl.patch(fo, headers=h, json={"title": "Hack"}).status_code == 404
    assert cl.get(f"{fo}/sessions", headers=h).status_code == 404
    assert _new_session(c, foreign).status_code == 404
    assert cl.delete(f"{fo}/sessions/{fsession['id']}", headers=h).status_code == 404
    assert cl.post(f"{fo}/sessions/{fsession['id']}/cancel", headers=h).status_code == 404
    assert cl.get(f"{fo}/sessions/{fsession['id']}/registrations", headers=h).status_code == 404
    # B's session id under A's own offer is just as foreign
    own_o = f"{base}/{own['id']}"
    assert cl.delete(f"{own_o}/sessions/{fsession['id']}", headers=h).status_code == 404
    assert cl.get(f"{own_o}/sessions/{fsession['id']}/registrations", headers=h).status_code == 404
    assert cl.delete(f"{own_o}/sessions/{uuid4()}", headers=h).status_code == 404
    assert training.get_offer(c["other"], foreign["id"])["title"] == "Einzeltraining 60"
    assert len(training.list_sessions(c["other"], foreign["id"])) == 1
    assert own_session["offer_id"] == own["id"]


def test_session_of_other_offer_same_org_is_404(ctx):
    c = ctx
    a, b = _new_offer(c, slug="offer-a"), _new_offer(c, slug="offer-b")
    s = _new_session(c, a).json()
    assert c["client"].delete(f"{_admin(c)}/{b['id']}/sessions/{s['id']}", headers=c["headers"]).status_code == 404
    assert c["client"].get(f"{_admin(c)}/{b['id']}/sessions/{s['id']}/registrations", headers=c["headers"]).status_code == 404


def test_unknown_org_is_404(ctx):
    c = ctx
    h = owner_headers()
    assert c["client"].get(_admin(c, "does-not-exist"), headers=h).status_code == 404
    assert c["client"].get(_public(c, "does-not-exist")).status_code == 404
    assert c["client"].get(_public(c, "does-not-exist") + "/einzel-60").status_code == 404


# ---------- offers ----------

def test_create_offer_defaults_to_draft_and_audits(ctx):
    c = ctx
    offer = _new_offer(c, description="Test", location="Platz 1")
    assert offer["status"] == "draft"
    assert {"id", "slug", "title", "kind", "description", "duration_minutes", "location",
            "price_member_cents", "price_nonmember_cents", "status", "created_at", "updated_at"} <= set(offer)
    assert "organization_id" not in offer
    with c["cursor"]() as cur:
        cur.execute("select action, target_type, target_id from audit_log where organization_id=%s", (c["org"],))
        rows = cur.fetchall()
    assert [(r["action"], r["target_type"], r["target_id"]) for r in rows] == [
        ("training_offer.created", "training_offer", offer["id"])]


@pytest.mark.parametrize("bad", [
    {"slug": "Bad Slug"}, {"slug": "-x"}, {"slug": ""}, {"title": "  "}, {"kind": "team"},
    {"duration_minutes": 0}, {"duration_minutes": 601}, {"price_member_cents": -1},
    {"price_nonmember_cents": -1}, {"status": "closed"}, {"organization_id": str(uuid4())},
])
def test_create_offer_validation(ctx, bad):
    r = ctx["client"].post(_admin(ctx), headers=ctx["headers"], json={**OFFER, **bad})
    assert r.status_code == 422, r.text


def test_duplicate_slug_conflicts_per_org_only(ctx):
    c = ctx
    _new_offer(c)
    r = c["client"].post(_admin(c), headers=c["headers"], json=OFFER)
    assert r.status_code == 409
    other_h = org_admin_headers(str(c["other"]))
    assert c["client"].post(_admin(c, c["other_slug"]), headers=other_h, json=OFFER).status_code == 201


def test_update_offer_status_and_fields(ctx):
    c = ctx
    offer = _new_offer(c)
    r = c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"],
                          json={"status": "published", "title": "Neu", "price_member_cents": 2500, "location": None})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["status"], body["title"], body["price_member_cents"], body["location"]) == ("published", "Neu", 2500, None)
    assert body["slug"] == "einzel-60" and body["price_nonmember_cents"] == 4500
    r = c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"], json={"status": "archived"})
    assert r.json()["status"] == "archived"
    with c["cursor"]() as cur:
        cur.execute("select action from audit_log where organization_id=%s order by created_at", (c["org"],))
        actions = [r["action"] for r in cur.fetchall()]
    assert actions == ["training_offer.created", "training_offer.updated", "training_offer.updated"]


@pytest.mark.parametrize("bad", [
    {"slug": "other"}, {"kind": "gruppe"}, {"title": None}, {"status": "closed"}, {"price_member_cents": -5},
    {"duration_minutes": None}, {"status": None},
])
def test_update_offer_rejects_bad_or_immutable_fields(ctx, bad):
    c = ctx
    offer = _new_offer(c)
    assert c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"], json=bad).status_code == 422


def test_list_and_get_offers(ctx):
    c = ctx
    a = _new_offer(c, slug="a-offer", title="A")
    _new_offer(c, slug="b-offer", title="B", status="published")
    training.create_offer(c["other"], **{**OFFER, "slug": "foreign"})
    rows = c["client"].get(_admin(c), headers=c["headers"]).json()
    assert [r["slug"] for r in rows] == ["a-offer", "b-offer"]
    only = c["client"].get(_admin(c) + "?status=published", headers=c["headers"]).json()
    assert [r["slug"] for r in only] == ["b-offer"]
    assert c["client"].get(_admin(c) + "?status=bogus", headers=c["headers"]).status_code == 422
    assert c["client"].get(f"{_admin(c)}/{a['id']}", headers=c["headers"]).json()["slug"] == "a-offer"
    assert c["client"].get(f"{_admin(c)}/{uuid4()}", headers=c["headers"]).status_code == 404


# ---------- sessions: creation ----------

def test_create_session_berlin_dst(ctx):
    c = ctx
    offer = _new_offer(c)
    # 2026-03-29 is the spring-forward day: 18:00 is already CEST (UTC+2).
    r = _new_session(c, offer, date="2026-03-29", start_time="18:00")
    assert r.status_code == 201, r.text
    s = r.json()
    assert s["starts_at"].startswith("2026-03-29T16:00:00") and s["ends_at"].startswith("2026-03-29T17:00:00")
    assert (s["local_date"], s["local_time"]) == ("2026-03-29", "18:00")
    # the day before is still CET (UTC+1)
    s2 = _new_session(c, offer, date="2026-03-28", start_time="18:00").json()
    assert s2["starts_at"].startswith("2026-03-28T17:00:00")
    # autumn: 2026-10-25 18:00 is CET again
    s3 = _new_session(c, offer, date="2026-10-25", start_time="18:00").json()
    assert s3["starts_at"].startswith("2026-10-25T17:00:00")
    with c["cursor"]() as cur:
        cur.execute("select start_date, end_date, starts_at at time zone 'Europe/Berlin' as local from camps where id=%s",
                    (s["id"],))
        row = cur.fetchone()
    assert str(row["start_date"]) == "2026-03-29" and row["local"].hour == 18


def test_create_session_uses_offer_duration_and_frozen_prices(ctx):
    c = ctx
    offer = _new_offer(c, duration_minutes=45)
    s = _new_session(c, offer).json()
    assert datetime.fromisoformat(s["ends_at"]) - datetime.fromisoformat(s["starts_at"]) == timedelta(minutes=45)
    assert (s["price_member_cents"], s["price_nonmember_cents"]) == (3000, 4500)
    assert (s["capacity"], s["booked_count"], s["free_spots"]) == (1, 0, 1)
    assert s["slug"] == "einzel-60-20300506-1800" and s["offer_id"] == offer["id"]
    assert s["location"] is None
    c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"], json={"price_nonmember_cents": 9900})
    rows = c["client"].get(f"{_admin(c)}/{offer['id']}/sessions", headers=c["headers"]).json()
    assert rows[0]["price_nonmember_cents"] == 4500  # existing session keeps its frozen price


@pytest.mark.parametrize("date,time", [("2026-03-29", "02:30"), ("2026-10-25", "02:30")])
def test_nonexistent_or_ambiguous_local_time_rejected(ctx, date, time):
    c = ctx
    offer = _new_offer(c)
    assert _new_session(c, offer, date=date, start_time=time).status_code == 422


@pytest.mark.parametrize("bad", [
    {"date": "2030-13-01"}, {"date": "06.05.2030"}, {"start_time": "25:00"}, {"start_time": "18:00:30"},
    {"start_time": "6pm"}, {"capacity": 0}, {"capacity": 13}, {"capacity": -1}, {"status": "archived"},
    {"offer_id": str(uuid4())}, {"age_min": -1}, {"age_min": 10, "age_max": 5},
])
def test_create_session_validation(ctx, bad):
    c = ctx
    offer = _new_offer(c, kind="gruppe")
    r = _new_session(c, offer, capacity=4, **bad) if "capacity" not in bad else _new_session(c, offer, **bad)
    assert r.status_code == 422, r.text


def test_capacity_bounds_and_kind_rules(ctx):
    c = ctx
    group = _new_offer(c, slug="gruppe", kind="gruppe")
    einzel = _new_offer(c, slug="einzel")
    assert _new_session(c, group, date="2030-05-06").status_code == 422  # group needs explicit capacity
    assert _new_session(c, group, date="2030-05-07", capacity=1).json()["capacity"] == 1
    assert _new_session(c, group, date="2030-05-08", capacity=8).json()["capacity"] == 8
    assert _new_session(c, einzel, date="2030-05-06").json()["capacity"] == 1  # einzel defaults to 1
    assert _new_session(c, einzel, date="2030-05-07", capacity=3).status_code == 422  # einzel is always 1
    assert _new_session(c, einzel, date="2030-05-08", capacity=1).json()["capacity"] == 1


def test_session_defaults_to_published_and_draft_is_possible(ctx):
    c = ctx
    offer = _new_offer(c)
    assert _new_session(c, offer).json()["status"] == "published"
    assert _new_session(c, offer, start_time="19:00", status="draft").json()["status"] == "draft"


def test_duplicate_session_time_conflicts(ctx):
    c = ctx
    offer = _new_offer(c)
    assert _new_session(c, offer).status_code == 201
    assert _new_session(c, offer).status_code == 409


# ---------- sessions: list, bookings, delete/cancel ----------

def test_list_sessions_with_booked_counts(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    group = _new_offer(c, slug="gruppe", kind="gruppe", status="published")
    s1 = _new_session(c, offer, date="2030-05-06").json()
    _new_session(c, offer, date="2030-05-07")
    g = _new_session(c, group, capacity=3).json()
    assert _book(c, s1["slug"]).status_code == 201
    assert _book(c, g["slug"]).status_code == 201
    rows = c["client"].get(f"{_admin(c)}/{offer['id']}/sessions", headers=c["headers"]).json()
    assert [(r["local_date"], r["booked_count"], r["free_spots"]) for r in rows] == [
        ("2030-05-06", 1, 0), ("2030-05-07", 0, 1)]
    grows = c["client"].get(f"{_admin(c)}/{group['id']}/sessions", headers=c["headers"]).json()
    assert (grows[0]["booked_count"], grows[0]["free_spots"]) == (1, 2)


def test_registrations_of_a_session(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    token = _book(c, s["slug"], payment_method="bar").json()["registration_token"]
    r = c["client"].get(f"{_admin(c)}/{offer['id']}/sessions/{s['id']}/registrations", headers=c["headers"])
    assert r.status_code == 200
    (row,) = r.json()
    assert row["registration_token"] == token
    assert (row["applied_price_cents"], row["member_match"], row["payment_method"]) == (4500, False, "bar")
    assert row["child_first_name"] == "Lena"
    other = _new_session(c, offer, date="2030-05-07").json()
    assert c["client"].get(f"{_admin(c)}/{offer['id']}/sessions/{other['id']}/registrations",
                           headers=c["headers"]).json() == []


def test_delete_without_bookings(ctx):
    c = ctx
    offer = _new_offer(c)
    s = _new_session(c, offer).json()
    r = c["client"].delete(f"{_admin(c)}/{offer['id']}/sessions/{s['id']}", headers=c["headers"])
    assert r.status_code == 204
    assert training.list_sessions(c["org"], offer["id"]) == []
    assert c["client"].delete(f"{_admin(c)}/{offer['id']}/sessions/{s['id']}", headers=c["headers"]).status_code == 404


def test_delete_and_cancel_blocked_with_active_booking(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert _book(c, s["slug"]).status_code == 201
    base = f"{_admin(c)}/{offer['id']}/sessions/{s['id']}"
    assert c["client"].delete(base, headers=c["headers"]).status_code == 409
    assert c["client"].post(base + "/cancel", headers=c["headers"]).status_code == 409
    assert len(training.list_sessions(c["org"], offer["id"])) == 1
    assert training.list_sessions(c["org"], offer["id"])[0]["status"] == "published"


def test_cancelled_booking_history_blocks_delete_but_allows_cancel(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    token = _book(c, s["slug"]).json()["registration_token"]
    r = c["client"].post(f"/admin/organizations/{c['slug']}/camps/{s['slug']}/registrations/{token}/cancel",
                         headers=c["headers"])
    assert r.status_code == 200, r.text
    base = f"{_admin(c)}/{offer['id']}/sessions/{s['id']}"
    assert c["client"].delete(base, headers=c["headers"]).status_code == 409  # registration data is kept
    r = c["client"].post(base + "/cancel", headers=c["headers"])
    assert r.status_code == 200 and r.json()["status"] == "archived"
    # an archived session is no longer bookable or public
    assert _book(c, s["slug"]).status_code == 404
    pub = c["client"].get(f"{_public(c)}/{offer['slug']}").json()
    assert pub["sessions"] == []


# ---------- public ----------

def test_public_list_only_published_offers(ctx):
    c = ctx
    _new_offer(c, slug="draft-offer")
    _new_offer(c, slug="live-offer", status="published", description="Hallo", location="Halle")
    _new_offer(c, slug="old-offer", status="archived")
    training.create_offer(c["other"], **{**OFFER, "slug": "foreign", "status": "published"})
    r = c["client"].get(_public(c))
    assert r.status_code == 200
    (row,) = r.json()
    assert row["slug"] == "live-offer"
    assert set(row) == {"slug", "title", "kind", "description", "duration_minutes", "location",
                        "price_member_cents", "price_nonmember_cents", "category",
                        "from_price_member_cents", "from_price_nonmember_cents"}
    assert row["from_price_member_cents"] is None and row["from_price_nonmember_cents"] is None  # no session yet


def test_public_prices_are_the_frozen_session_prices_not_the_changed_offer_price(ctx):
    c = ctx
    offer = _new_offer(c, slug="preis", status="published")  # 30,00 / 45,00
    early = _new_session(c, offer, date="2031-02-01", start_time="10:00").json()
    c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"],
                      json={"price_member_cents": 2000, "price_nonmember_cents": 4000})
    later = _new_session(c, offer, date="2031-02-02", start_time="10:00").json()
    detail = c["client"].get(f"{_public(c)}/preis").json()
    assert [(s["price_member_cents"], s["price_nonmember_cents"]) for s in detail["sessions"]] == [
        (3000, 4500), (2000, 4000)]
    assert early["slug"] != later["slug"]
    (row,) = c["client"].get(_public(c)).json()
    assert (row["price_member_cents"], row["price_nonmember_cents"]) == (2000, 4000)  # template only
    assert (row["from_price_member_cents"], row["from_price_nonmember_cents"]) == (2000, 4000)
    with c["cursor"]() as cur:  # an earlier cheaper session still counts, a draft/past one does not
        cur.execute("update camps set price_cents=3500, price_member_cents=1500 where id=%s", (early["id"],))
    (row,) = c["client"].get(_public(c)).json()
    assert (row["from_price_member_cents"], row["from_price_nonmember_cents"]) == (1500, 3500)


def test_public_detail_404_for_draft_archived_unknown_and_foreign(ctx):
    c = ctx
    d = _new_offer(c, slug="draft-offer")
    a = _new_offer(c, slug="old-offer", status="published")
    _new_session(c, a)
    c["client"].patch(f"{_admin(c)}/{a['id']}", headers=c["headers"], json={"status": "archived"})
    training.create_offer(c["other"], **{**OFFER, "slug": "foreign", "status": "published"})
    for slug in ("draft-offer", "old-offer", "nope", "foreign"):
        assert c["client"].get(f"{_public(c)}/{slug}").status_code == 404, slug
    assert d["status"] == "draft"


def test_archiving_hides_sessions_and_booking(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert len(c["client"].get(f"{_public(c)}/{offer['slug']}").json()["sessions"]) == 1
    c["client"].patch(f"{_admin(c)}/{offer['id']}", headers=c["headers"], json={"status": "archived"})
    assert c["client"].get(f"{_public(c)}/{offer['slug']}").status_code == 404
    assert _book(c, s["slug"]).status_code == 404


def test_public_detail_sessions_future_published_with_free_spots(ctx):
    c = ctx
    offer = _new_offer(c, slug="gruppe", kind="gruppe", status="published")
    now = datetime.now(timezone.utc)
    fut = (now + timedelta(days=10)).astimezone(training.BERLIN)
    near = _new_session(c, offer, date=f"{fut:%Y-%m-%d}", start_time="18:00", capacity=3).json()
    far = _new_session(c, offer, date="2031-01-10", start_time="10:00", capacity=2).json()
    _new_session(c, offer, date="2031-01-11", start_time="10:00", capacity=2, status="draft")
    past = _new_session(c, offer, date="2031-01-12", start_time="10:00", capacity=2).json()
    with c["cursor"]() as cur:  # a session in the past (no API route creates one in the past by design? it may; force it)
        cur.execute("update camps set starts_at=%s, ends_at=%s where id=%s",
                    (now - timedelta(days=2), now - timedelta(days=2) + timedelta(hours=1), past["id"]))
    body = c["client"].get(f"{_public(c)}/gruppe").json()
    assert {k: body[k] for k in ("slug", "title", "kind", "duration_minutes")} == {
        "slug": "gruppe", "title": "Einzeltraining 60", "kind": "gruppe", "duration_minutes": 60}
    assert [s["slug"] for s in body["sessions"]] == [near["slug"], far["slug"]]
    assert [(s["capacity"], s["free_spots"]) for s in body["sessions"]] == [(3, 3), (2, 2)]
    assert _book(c, near["slug"]).status_code == 201
    body = c["client"].get(f"{_public(c)}/gruppe").json()
    assert [s["free_spots"] for s in body["sessions"]] == [2, 2]
    first = body["sessions"][0]
    assert set(first) == {"slug", "starts_at", "ends_at", "local_date", "local_time", "capacity", "free_spots",
                          "price_member_cents", "price_nonmember_cents", "age_min", "age_max"}
    assert "Lena" not in c["client"].get(f"{_public(c)}/gruppe").text  # no participant data


def test_public_free_spots_after_booking_einzel_is_zero(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert c["client"].get(f"{_public(c)}/{offer['slug']}").json()["sessions"][0]["free_spots"] == 1
    assert _book(c, s["slug"]).status_code == 201
    row = c["client"].get(f"{_public(c)}/{offer['slug']}").json()["sessions"][0]
    assert (row["capacity"], row["free_spots"]) == (1, 0)


def test_public_detail_hides_sessions_of_other_offers(ctx):
    c = ctx
    a, b = _new_offer(c, slug="offer-a", status="published"), _new_offer(c, slug="offer-b", status="published")
    _new_session(c, a)
    assert c["client"].get(f"{_public(c)}/offer-b").json()["sessions"] == []


# ---------- classic camp views no longer mix in sessions ----------

def test_admin_camp_list_excludes_sessions(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    rows = c["client"].get(f"/admin/organizations/{c['slug']}/camps", headers=c["headers"]).json()
    assert [r["slug"] for r in rows] == ["summer-1"]
    # classic camp PATCH must not reach a session row either
    r = c["client"].patch(f"/admin/organizations/{c['slug']}/camps/{s['slug']}", headers=c["headers"],
                          json={"title": "Hack"})
    assert r.status_code == 404
    # ... but the per-camp registrations route still resolves sessions (used for cancel/payment actions)
    assert c["client"].get(f"/admin/organizations/{c['slug']}/camps/{s['slug']}/registrations",
                           headers=c["headers"]).status_code == 200


def test_org_export_still_covers_session_payments(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert _book(c, s["slug"]).status_code == 201
    r = c["client"].get(f"/admin/organizations/{c['slug']}/export.xlsx?view=payments", headers=c["headers"])
    assert r.status_code == 200
    from io import BytesIO
    from openpyxl import load_workbook
    ws = load_workbook(BytesIO(r.content)).active
    assert any("Lena" in " ".join(str(v) for v in row) for row in ws.iter_rows(values_only=True))


def test_camp_counts_exclude_sessions(ctx):
    c = ctx
    offer = _new_offer(c)
    _new_session(c, offer)
    h = owner_headers()
    orgs = c["client"].get("/admin/organizations", headers=h).json()
    mine = next(o for o in orgs if o["slug"] == c["slug"])
    assert mine["camp_count"] == 1
    from app.repositories import platform_stats
    with c["cursor"]() as cur:
        cur.execute("select count(*) n from camps where offer_id is null")
        classic = cur.fetchone()["n"]
    assert platform_stats.get_platform_stats()["camps_total"] == classic


# ---------- sessions: weekly series ----------

def _series(c, offer, **over):
    body = {"start_date": "2027-03-21", "start_time": "18:00", "weeks": 3, **over}
    return c["client"].post(f"{_admin(c)}/{offer['id']}/sessions/series", headers=c["headers"], json=body)


def _session_count(c, offer):
    with c["cursor"]() as cur:
        cur.execute("select count(*) as n from camps where offer_id=%s", (offer["id"],))
        return cur.fetchone()["n"]


def test_series_creates_weekly_sessions_across_dst_change(ctx):
    c = ctx
    offer = _new_offer(c)
    r = _series(c, offer)  # 2027-03-28 is the spring-forward day
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["created"] == 3
    rows = body["sessions"]
    assert [(s["local_date"], s["local_time"]) for s in rows] == [
        ("2027-03-21", "18:00"), ("2027-03-28", "18:00"), ("2027-04-04", "18:00")]
    assert rows[0]["starts_at"].startswith("2027-03-21T17:00:00")  # CET
    assert rows[1]["starts_at"].startswith("2027-03-28T16:00:00")  # CEST
    assert rows[2]["starts_at"].startswith("2027-04-04T16:00:00")
    assert all(s["status"] == "published" and s["capacity"] == 1 for s in rows)
    assert _session_count(c, offer) == 3


def test_series_duplicate_slug_conflicts_and_creates_nothing(ctx):
    c = ctx
    offer = _new_offer(c)
    assert _new_session(c, offer, date="2027-04-04").status_code == 201  # collides with week 3
    r = _series(c, offer)
    assert r.status_code == 409
    assert r.json()["detail"] == {"code": "session_exists"}
    assert _session_count(c, offer) == 1  # only the pre-existing one; weeks 1-2 rolled back


def test_series_gap_time_rejected_whole_series(ctx):
    c = ctx
    offer = _new_offer(c)
    # 02:30 does not exist on 2027-03-28, the second week -> 422, nothing created
    assert _series(c, offer, start_time="02:30").status_code == 422
    assert _session_count(c, offer) == 0


@pytest.mark.parametrize("weeks", [0, 13, -1])
def test_series_weeks_bounds(ctx, weeks):
    c = ctx
    offer = _new_offer(c)
    assert _series(c, offer, weeks=weeks).status_code == 422
    assert _session_count(c, offer) == 0


def test_series_weeks_limits_accepted(ctx):
    c = ctx
    offer = _new_offer(c)
    assert _series(c, offer, weeks=1).json()["created"] == 1
    assert _series(c, offer, start_date="2028-01-03", weeks=12).json()["created"] == 12


def test_series_capacity_rules(ctx):
    c = ctx
    einzel = _new_offer(c, slug="einzel")
    group = _new_offer(c, slug="gruppe", kind="gruppe")
    assert _series(c, einzel, capacity=3).status_code == 422
    assert _session_count(c, einzel) == 0
    assert _series(c, einzel, capacity=1).status_code == 201
    assert _series(c, group).status_code == 422  # group needs capacity
    ok = _series(c, group, capacity=6, status="draft")
    assert ok.status_code == 201
    assert {s["capacity"] for s in ok.json()["sessions"]} == {6}
    assert {s["status"] for s in ok.json()["sessions"]} == {"draft"}


def test_series_tenant_isolation_and_unknown_offer(ctx):
    c = ctx
    offer = _new_offer(c)
    foreign = c["client"].post(
        f"{_admin(c, c['other_slug'])}/{offer['id']}/sessions/series", headers=c["headers"],
        json={"start_date": "2027-03-21", "start_time": "18:00", "weeks": 2})
    assert foreign.status_code in (403, 404)
    assert _session_count(c, offer) == 0
    unknown = c["client"].post(
        f"{_admin(c)}/{uuid4()}/sessions/series", headers=c["headers"],
        json={"start_date": "2027-03-21", "start_time": "18:00", "weeks": 2})
    assert unknown.status_code == 404
