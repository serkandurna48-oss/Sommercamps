"""Aggregate admin endpoints (Ladezeit): training payments and offer overview.

Real disposable Postgres; synthetic data only. Each aggregate must equal what
the frontend assembled before from 1 + offers + sessions (payments) or
2 + N (offer detail) requests, and must stay inside one organization.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.main import app
from app.repositories import organizations, training
from .auth_helpers import org_admin_headers, owner_headers
from .test_training_api import OFFER, _admin, _book, _new_offer, _new_session, ctx, fake_provider  # noqa: F401
from .test_review_postgres import local_database, real_db  # noqa: F401

_EXCLUDED_PII = {"allergies", "medical_notes", "child_birth_date", "emergency_contact_name",
                 "emergency_contact_phone", "parent_phone", "extra_answers", "pickup_authorized"}


def _payments(c, slug=None, headers=None):
    return c["client"].get(f"/admin/organizations/{slug or c['slug']}/training-payments",
                           headers=c["headers"] if headers is None else headers)


def _cancel(c, session_slug, token):
    r = c["client"].post(
        f"/admin/organizations/{c['slug']}/camps/{session_slug}/registrations/{token}/cancel", headers=c["headers"])
    assert r.status_code == 200, r.text


def test_training_payments_groups_sessions_with_payment_fields(ctx):
    c = ctx
    a = _new_offer(c, slug="a-einzel", title="A Einzel", status="published")
    b = _new_offer(c, slug="b-gruppe", title="B Gruppe", kind="gruppe", status="published")
    a1 = _new_session(c, a, date="2030-05-06", start_time="18:00").json()  # CEST
    a2 = _new_session(c, a, date="2030-11-04", start_time="09:30").json()  # CET
    _new_session(c, a, date="2030-05-08").json()  # no bookings: not listed
    b1 = _new_session(c, b, capacity=3).json()
    t1 = _book(c, a1["slug"], payment_method="bar").json()["registration_token"]
    t2 = _book(c, a2["slug"]).json()["registration_token"]
    _cancel(c, a2["slug"], t2)  # cancelled history stays visible (payment may be due/refunded)
    _book(c, b1["slug"], child_first_name="Mia")
    _book(c, b1["slug"], child_first_name="Ole", parent_email="ole@example.com")

    r = _payments(c)
    assert r.status_code == 200, r.text
    groups = r.json()
    assert [(g["offer"]["title"], g["session"]["local_date"], g["session"]["local_time"]) for g in groups] == [
        ("A Einzel", "2030-05-06", "18:00"), ("A Einzel", "2030-11-04", "09:30"), ("B Gruppe", "2030-05-06", "18:00")]
    assert [(g["session"]["booked_count"], g["session"]["free_spots"], len(g["registrations"])) for g in groups] == [
        (1, 0, 1), (0, 1, 1), (2, 1, 2)]
    assert groups[0]["offer"] == {"id": a["id"], "title": "A Einzel", "kind": "einzel", "status": "published"}
    (reg,) = groups[0]["registrations"]
    assert reg["registration_token"] == t1
    assert (reg["applied_price_cents"], reg["payment_method"], reg["member_match"], reg["status"]) == (
        4500, "bar", False, "registered")
    assert groups[1]["registrations"][0]["status"] == "cancelled"
    for group in groups:
        for row in group["registrations"]:
            assert not (_EXCLUDED_PII & row.keys()), row.keys()

    # Same rows, prices and payment references as the per-session endpoint it replaces.
    for g in groups:
        old = c["client"].get(f"{_admin(c)}/{g['offer']['id']}/sessions/{g['session']['id']}/registrations",
                              headers=c["headers"]).json()
        assert [(o["registration_token"], o["payment_reference"], o["applied_price_cents"], o["payment_status"])
                for o in old] == [(n["registration_token"], n["payment_reference"], n["applied_price_cents"],
                                   n["payment_status"]) for n in g["registrations"]]
        sessions = c["client"].get(f"{_admin(c)}/{g['offer']['id']}/sessions", headers=c["headers"]).json()
        assert g["session"] == next(s for s in sessions if s["id"] == g["session"]["id"])


def test_training_payments_skips_draft_session_without_active_booking(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    token = _book(c, s["slug"]).json()["registration_token"]
    _cancel(c, s["slug"], token)
    with c["cursor"]() as cur:
        cur.execute("UPDATE camps SET status='draft' WHERE id=%s", (s["id"],))
    assert _payments(c).json() == []
    with c["cursor"]() as cur:
        cur.execute("UPDATE camps SET status='published' WHERE id=%s", (s["id"],))
    assert len(_payments(c).json()) == 1


def test_training_payments_tenant_isolation(ctx):
    c = ctx
    own = _new_offer(c, status="published")
    _book(c, _new_session(c, own).json()["slug"])
    # Org B has its own offer, session and booking (written directly, B's ids).
    foreign = training.create_offer(c["other"], **{**OFFER, "status": "published"})
    fsession = training.create_session(c["other"], foreign["id"], datetime(2030, 5, 6, 16, tzinfo=timezone.utc),
                                       status="published")
    with c["cursor"]() as cur:
        cur.execute(
            "INSERT INTO camp_registrations (organization_id, camp_id, parent_first_name, parent_last_name, "
            "parent_email, parent_phone, child_first_name, child_last_name, child_birth_date, terms_accepted, "
            "privacy_accepted) VALUES (%s,%s,'B','B','b@example.com','1','Fremd','Kind','2015-01-01',true,true)",
            (c["other"], fsession["id"]),
        )
    groups = _payments(c).json()
    assert [g["offer"]["id"] for g in groups] == [own["id"]]
    assert all(r["child_first_name"] != "Fremd" for g in groups for r in g["registrations"])
    # Admin of A asking for B: 403. Unknown org: 404. Anonymous: 401.
    assert _payments(c, slug=c["other_slug"]).status_code == 403
    assert _payments(c, slug="does-not-exist").status_code == 404
    app.dependency_overrides.clear()
    assert _payments(c, headers={}).status_code == 401
    # Admin of B sees only B.
    b_groups = _payments(c, slug=c["other_slug"], headers=org_admin_headers(str(c["other"]))).json()
    assert [g["session"]["id"] for g in b_groups] == [str(fsession["id"])]
    # Owner may read any org.
    assert _payments(c, headers=owner_headers()).status_code == 200


def test_offer_overview_equals_the_requests_it_replaces(ctx):
    c = ctx
    offer = _new_offer(c, status="published", kind="gruppe")
    s1 = _new_session(c, offer, date="2030-05-06", capacity=3).json()
    s2 = _new_session(c, offer, date="2030-05-07", capacity=2).json()
    _book(c, s1["slug"], payment_method="bar")
    _book(c, s1["slug"], child_first_name="Ole")
    other_offer = _new_offer(c, slug="andere", status="published")
    _book(c, _new_session(c, other_offer).json()["slug"], child_first_name="Nicht")

    base = f"{_admin(c)}/{offer['id']}"
    r = c["client"].get(base + "/overview", headers=c["headers"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["offer"] == c["client"].get(base, headers=c["headers"]).json()
    sessions = c["client"].get(base + "/sessions", headers=c["headers"]).json()
    assert [{k: v for k, v in s.items() if k != "registrations"} for s in body["sessions"]] == sessions
    for s in body["sessions"]:
        old = c["client"].get(f"{base}/sessions/{s['id']}/registrations", headers=c["headers"]).json()
        assert s["registrations"] == old
    assert [len(s["registrations"]) for s in body["sessions"]] == [2, 0]
    assert {s["id"] for s in body["sessions"]} == {s1["id"], s2["id"]}


def test_offer_overview_tenant_isolation(ctx):
    c = ctx
    offer = _new_offer(c)
    foreign = training.create_offer(c["other"], **OFFER)
    own_path = f"{_admin(c)}/{offer['id']}/overview"
    assert c["client"].get(f"{_admin(c)}/{foreign['id']}/overview", headers=c["headers"]).status_code == 404
    assert c["client"].get(f"{_admin(c)}/{uuid4()}/overview", headers=c["headers"]).status_code == 404
    assert c["client"].get(own_path, headers=org_admin_headers(str(c["other"]))).status_code == 403
    app.dependency_overrides.clear()
    assert c["client"].get(own_path).status_code == 401


def test_org_admin_request_resolves_organization_once(ctx, monkeypatch):
    """require_org_access and the handler share one lookup per request."""
    c = ctx
    offer = _new_offer(c)
    calls = []
    original = organizations.get_organization_by_slug

    def counting(slug):
        calls.append(slug)
        return original(slug)

    monkeypatch.setattr(organizations, "get_organization_by_slug", counting)
    assert c["client"].get(f"{_admin(c)}/{offer['id']}/overview", headers=c["headers"]).status_code == 200
    assert calls == [c["slug"]]
    calls.clear()
    assert _payments(c).status_code == 200
    assert _payments(c).status_code == 200
    assert calls == [c["slug"], c["slug"]]  # memo is per request, never shared between requests
