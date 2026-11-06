"""Admin API Spielerakte (Stufe 2+3, Task 2). Real local Postgres, synthetic data only."""

from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import players
from .auth_helpers import org_admin_headers
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_api import OFFER, _admin, _book, _new_offer, _new_session

BIRTH = "2015-03-04"
SECRET = "GEHEIMTEXT-Mentalnotiz-4711"


@pytest.fixture
def ctx(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    actor = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (actor,))
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email,site_published,plan_status,modules) "
            "VALUES (%s,%s,'Other','o@example.com',true,'active','{camps,players}')",
            (other, f"other-{other.hex}"),
        )
    with TestClient(app) as client:
        yield dict(
            client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug,
            other=other, other_slug=f"other-{other.hex}", actor=actor,
            headers=org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )


def _base(c, slug=None):
    return f"/admin/organizations/{slug or c['slug']}/players"


def _pid(c, org=None, first="Lena", last="Mustermann", birth=BIRTH):
    from datetime import date
    return str(players.find_or_create_player_id(org or c["org"], first, last, date.fromisoformat(birth)))


def _audit(c, org=None):
    with c["cursor"]() as cur:
        cur.execute("select * from audit_log where organization_id=%s order by created_at", (org or c["org"],))
        return cur.fetchall()


def _note(c, pid, **over):
    body = {"note_date": "2027-01-10", "body": "Gute Technik", "focus": ["technik"], **over}
    return c["client"].post(f"{_base(c)}/{pid}/notes", headers=c["headers"], json=body)


# ---------- access / tenant ----------

def test_anonymous_rejected(ctx):
    c = ctx
    app.dependency_overrides.clear()
    pid = _pid(c)
    assert c["client"].get(_base(c)).status_code == 401
    assert c["client"].get(f"{_base(c)}/{pid}").status_code == 401
    assert c["client"].post(f"{_base(c)}/{pid}/notes", json={}).status_code == 401


def test_admin_of_other_org_is_forbidden_everywhere(ctx):
    c = ctx
    pid = _pid(c)
    nid = _note(c, pid).json()["id"]
    h = org_admin_headers(str(c["other"]))
    cl, b = c["client"], _base(c)
    assert cl.get(b, headers=h).status_code == 403
    assert cl.get(f"{b}/{pid}", headers=h).status_code == 403
    assert cl.post(f"{b}/{pid}/notes", headers=h, json={"note_date": "2027-01-01", "body": "x"}).status_code == 403
    assert cl.patch(f"{b}/{pid}/notes/{nid}", headers=h, json={"body": "y"}).status_code == 403
    assert cl.delete(f"{b}/{pid}/notes/{nid}", headers=h).status_code == 403
    assert len(players.list_notes(c["org"], pid)) == 1


def test_foreign_org_ids_under_own_slug_are_404(ctx):
    """Admin of A, A's slug, ids of org B -> 404 for read/write/delete; B unchanged."""
    c = ctx
    foreign = _pid(c, org=c["other"], first="Bea", last="Fremd")
    fnote = players.create_note(c["other"], foreign, note_date=__import__("datetime").date(2027, 1, 1), body="fremd")
    fgoal = players.create_goal(c["other"], foreign, title="fremd", area="technik")
    fmeas = players.create_measurement(c["other"], foreign, measured_on=__import__("datetime").date(2027, 1, 1),
                                       metric="sprint_10m", value=2.1)
    cl, b, h = c["client"], _base(c), c["headers"]
    assert cl.get(f"{b}/{foreign}", headers=h).status_code == 404
    assert _note(c, foreign).status_code == 404
    assert cl.post(f"{b}/{foreign}/goals", headers=h, json={"title": "t", "area": "technik"}).status_code == 404
    assert cl.post(f"{b}/{foreign}/measurements", headers=h,
                   json={"measured_on": "2027-01-01", "metric": "sprint_10m", "value": 2}).status_code == 404
    for kind, rec in (("notes", fnote), ("goals", fgoal), ("measurements", fmeas)):
        url = f"{b}/{foreign}/{kind}/{rec['id']}"
        assert cl.patch(url, headers=h, json={}).status_code == 404
        assert cl.delete(url, headers=h).status_code == 404
    assert [p["first_name"] for p in cl.get(b, headers=h).json()] == []
    assert players.get_note(c["other"], foreign, fnote["id"])["body"] == "fremd"
    assert players.get_goal(c["other"], foreign, fgoal["id"]) and players.get_measurement(c["other"], foreign, fmeas["id"])


def test_record_of_other_player_in_same_org_is_404(ctx):
    c = ctx
    p1, p2 = _pid(c), _pid(c, first="Max", last="Zweit")
    nid = _note(c, p1).json()["id"]
    cl, b, h = c["client"], _base(c), c["headers"]
    assert cl.patch(f"{b}/{p2}/notes/{nid}", headers=h, json={"body": "x"}).status_code == 404
    assert cl.delete(f"{b}/{p2}/notes/{nid}", headers=h).status_code == 404
    assert cl.delete(f"{b}/{p1}/notes/{nid}", headers=h).status_code == 204
    assert cl.delete(f"{b}/{p1}/notes/{nid}", headers=h).status_code == 404
    assert cl.get(f"{b}/{uuid4()}", headers=h).status_code == 404
    assert cl.get(f"{b}/not-a-uuid", headers=h).status_code == 422


def test_unknown_organization_is_404(ctx):
    c = ctx
    assert c["client"].get(_base(c, "gibts-nicht"), headers=c["headers"]).status_code in (403, 404)


# ---------- list ----------

def test_list_shape_and_counts(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert _book(c, s["slug"]).status_code == 201  # Lena Muster 2015-03-04 -> player
    pid = _pid(c)
    other = _pid(c, first="Zoe", last="Anders", birth="2012-01-01")
    _note(c, pid)
    _note(c, pid, body="zweite")
    cl, b, h = c["client"], _base(c), c["headers"]
    for payload in ({"title": "A", "area": "technik"}, {"title": "B", "area": "mental"},
                    {"title": "C", "area": "taktik", "status": "erreicht"}):
        assert cl.post(f"{b}/{pid}/goals", headers=h, json=payload).status_code == 201
    rows = cl.get(b, headers=h).json()
    assert [r["last_name"] for r in rows] == ["Anders", "Mustermann"]
    assert set(rows[0]) == {"id", "first_name", "last_name", "birth_date", "age", "last_booking_at",
                            "booking_count", "note_count", "open_goal_count", "is_member"}
    z, l = rows
    assert z["id"] == other and (z["booking_count"], z["note_count"], z["open_goal_count"], z["last_booking_at"]) == (0, 0, 0, None)
    assert l["id"] == pid and l["birth_date"] == BIRTH
    assert (l["booking_count"], l["note_count"], l["open_goal_count"]) == (1, 2, 2)
    assert l["last_booking_at"] == "2030-05-06"
    assert isinstance(l["age"], int)
    # cancelled bookings do not count
    with c["cursor"]() as cur:
        cur.execute("update camp_registrations set status='cancelled' where player_id=%s", (pid,))
    l = [r for r in cl.get(b, headers=h).json() if r["id"] == pid][0]
    assert l["booking_count"] == 0 and l["last_booking_at"] is None


def test_list_is_tenant_scoped(ctx):
    c = ctx
    _pid(c, first="Anna", last="Eigen")
    _pid(c, org=c["other"], first="Bea", last="Fremd")
    assert [r["first_name"] for r in c["client"].get(_base(c), headers=c["headers"]).json()] == ["Anna"]


# ---------- detail ----------

def test_detail_shape_and_ordering(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s1 = _new_session(c, offer, date="2030-05-06", start_time="18:00").json()
    s2 = _new_session(c, offer, date="2030-06-10", start_time="09:30").json()
    assert _book(c, s1["slug"], payment_method="bar").status_code == 201
    assert _book(c, s2["slug"]).status_code == 201
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    _note(c, pid, note_date="2027-01-10", body="alt")
    _note(c, pid, note_date="2027-03-01", body="neu")
    cl.post(f"{b}/{pid}/measurements", headers=h, json={"measured_on": "2027-01-01", "metric": "sprint_10m", "value": 2.2})
    cl.post(f"{b}/{pid}/measurements", headers=h, json={"measured_on": "2027-02-01", "metric": "sprint_10m", "value": "2.0"})
    cl.post(f"{b}/{pid}/goals", headers=h, json={"title": "Ziel", "area": "athletik", "target_date": "2027-06-01"})
    d = cl.get(f"{b}/{pid}", headers=h).json()
    assert set(d) == {"player", "bookings", "notes", "goals", "measurements", "metrics"}
    assert set(d["player"]) == {"id", "first_name", "last_name", "birth_date", "age", "is_member"}
    assert [n["body"] for n in d["notes"]] == ["neu", "alt"]
    assert set(d["notes"][0]) == {"id", "player_id", "camp_id", "note_date", "focus", "body", "rating",
                                  "next_steps", "video_url", "created_at", "updated_at"}
    assert [m["measured_on"] for m in d["measurements"]] == ["2027-02-01", "2027-01-01"]
    assert d["measurements"][0]["value"] == 2.0 and d["measurements"][0]["unit"] == "s"
    assert set(d["goals"][0]) == {"id", "player_id", "title", "area", "status", "target_date", "created_at", "updated_at"}
    assert d["goals"][0]["status"] == "offen"
    assert d["metrics"] == [{"metric": "sprint_10m", "unit": "s"}, {"metric": "sprint_30m", "unit": "s"},
                            {"metric": "standweitsprung", "unit": "cm"}, {"metric": "jonglieren", "unit": "Anzahl"}]
    assert [(x["local_date"], x["local_time"]) for x in d["bookings"]] == [("2030-06-10", "09:30"), ("2030-05-06", "18:00")]
    bk = d["bookings"][1]
    assert set(bk) == {"registration_id", "camp_id", "kind", "camp_title", "offer_title", "local_date", "local_time",
                       "status", "payment_status", "documentation_consent"}
    assert bk["kind"] == "training" and bk["offer_title"] == OFFER["title"]
    assert bk["status"] in ("registered", "confirmed") and bk["payment_status"] == "open"
    assert bk["documentation_consent"] is False  # Trainingsbuchung ohne Haken: false (Camps: NULL)
    assert "registration_token" not in str(d) and "parent" not in str(d)


def test_detail_camp_booking_has_no_time(ctx):
    c = ctx
    pid = _pid(c)
    with c["cursor"]() as cur:
        cur.execute("select id from camps where organization_id=%s limit 1", (c["org"],))
        camp = cur.fetchone()["id"]
        cur.execute("update camps set start_date='2027-07-05', offer_id=null, starts_at=null where id=%s", (camp,))
        cur.execute(
            """insert into camp_registrations (organization_id,camp_id,player_id,parent_first_name,parent_last_name,
               parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,photo_permission,
               terms_accepted,privacy_accepted,status) values (%s,%s,%s,'P','Q','p@example.com','1','Lena','Mustermann',%s,false,true,true,'registered')""",
            (c["org"], camp, pid, BIRTH),
        )
    (bk,) = c["client"].get(f"{_base(c)}/{pid}", headers=c["headers"]).json()["bookings"]
    assert (bk["kind"], bk["local_date"], bk["local_time"], bk["offer_title"]) == ("camp", "2027-07-05", None, None)


# ---------- notes ----------

def test_note_crud_and_audit_has_no_text(ctx):
    c = ctx
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    r = _note(c, pid, body=SECRET, next_steps=SECRET + "-next", rating=4, focus=["mental", "video"],
              video_url="https://example.com/v/1")
    assert r.status_code == 201, r.text
    n = r.json()
    assert (n["rating"], n["focus"], n["player_id"], n["camp_id"]) == (4, ["mental", "video"], pid, None)
    u = cl.patch(f"{b}/{pid}/notes/{n['id']}", headers=h, json={"rating": None, "body": SECRET + "2", "focus": ["taktik"]})
    assert u.status_code == 200 and u.json()["rating"] is None and u.json()["focus"] == ["taktik"]
    assert u.json()["next_steps"] == SECRET + "-next"  # untouched field stays
    assert cl.delete(f"{b}/{pid}/notes/{n['id']}", headers=h).status_code == 204
    log = _audit(c)
    assert [e["action"] for e in log] == ["player_note.created", "player_note.updated", "player_note.deleted"]
    assert all(e["target_id"] == n["id"] and e["target_type"] == "player_note" for e in log)
    dump = str(log)
    assert SECRET not in dump and "Lena" not in dump and "Muster" not in dump and "example.com/v" not in dump
    assert all(set(e["metadata"]) <= {"player_id"} for e in log)


@pytest.mark.parametrize("payload,field", [
    ({"rating": 0}, "rating"), ({"rating": 6}, "rating"), ({"rating": "3"}, "rating"), ({"rating": True}, "rating"),
    ({"video_url": "http://example.com/v"}, "video_url"), ({"video_url": "javascript:alert(1)"}, "video_url"),
    ({"video_url": "https://exa mple.com"}, "video_url"),
    ({"focus": ["unbekannt"]}, "focus"), ({"focus": "technik"}, "focus"),
    ({"body": "   "}, "body"), ({"body": 5}, "body"), ({"body": "x" * 10001}, "body"),
    ({"note_date": "2027-13-01"}, "note_date"), ({"note_date": "10.01.2027"}, "note_date"),
    ({"camp_id": "kaputt"}, "camp_id"), ({"unbekannt": 1}, "unbekannt"),
])
def test_note_validation_errors_do_not_echo_values(ctx, payload, field):
    c = ctx
    pid = _pid(c)
    r = _note(c, pid, **payload)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["field"] == field and r.json()["detail"]["code"] == "validation_error"
    assert "Gute Technik" not in r.text and "javascript" not in r.text and "x" * 50 not in r.text
    assert players.list_notes(c["org"], pid) == []


def test_note_missing_required_and_bad_body(ctx):
    c = ctx
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    r = cl.post(f"{b}/{pid}/notes", headers=h, json={"body": SECRET})
    assert r.status_code == 422 and r.json()["detail"]["field"] == "note_date" and SECRET not in r.text
    r = cl.post(f"{b}/{pid}/notes", headers=h, content=b'{"body": "' + SECRET.encode() + b'"', )
    assert r.status_code == 422 and SECRET not in r.text
    r = cl.post(f"{b}/{pid}/notes", headers=h, json=[SECRET])
    assert r.status_code == 422 and SECRET not in r.text


def test_unauthenticated_write_gets_401_before_body_validation(ctx):
    """Auth runs before the JSON body is parsed: no 422 for anonymous callers."""
    c = ctx
    app.dependency_overrides.clear()
    pid = _pid(c)
    cl, b = c["client"], _base(c)
    nid = "00000000-0000-0000-0000-000000000001"
    targets = (("post", f"{b}/{pid}/notes"), ("post", f"{b}/{pid}/goals"), ("post", f"{b}/{pid}/measurements"),
               ("patch", f"{b}/{pid}/notes/{nid}"), ("patch", f"{b}/{pid}/goals/{nid}"),
               ("patch", f"{b}/{pid}/measurements/{nid}"))
    for method, path in targets:  # anonymous first (org_admin_headers installs auth overrides)
        for kwargs in ({"content": b"{kaputt"}, {"json": [1]}, {"json": {}}):
            r = getattr(cl, method)(path, **kwargs)
            assert r.status_code == 401, (method, path, r.status_code)
    h = org_admin_headers(str(c["other"]))
    for method, path in targets:  # admin of a foreign org: 403, not 422
        assert getattr(cl, method)(path, headers=h, content=b"{kaputt").status_code == 403


def test_nul_character_in_text_fields_is_422_not_500(ctx):
    c = ctx
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    for path, payload, field in (
        (f"{b}/{pid}/notes", {"note_date": "2027-01-10", "body": "a\u0000b"}, "body"),
        (f"{b}/{pid}/notes", {"note_date": "2027-01-10", "body": "ok", "next_steps": "x\u0000"}, "next_steps"),
        (f"{b}/{pid}/goals", {"title": "Ti\u0000tel", "area": "technik"}, "title"),
        (f"{b}/{pid}/measurements", {"measured_on": "2027-01-10", "metric": "sprint_10m", "value": 2.1, "note": "n\u0000"}, "note"),
    ):
        r = cl.post(path, headers=h, json=payload)
        assert r.status_code == 422, (path, r.status_code)
        assert r.json()["detail"]["field"] == field and "\x00" not in r.text and "\\u0000" not in r.text
    assert players.list_notes(c["org"], pid) == []


def test_note_camp_id_rules(ctx):
    """camp_id: same organization required; a booking by this player is NOT required."""
    c = ctx
    pid = _pid(c)
    with c["cursor"]() as cur:
        cur.execute("select id from camps where organization_id=%s limit 1", (c["org"],))
        own_camp = str(cur.fetchone()["id"])
        fc = uuid4()
        cur.execute(
            "INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,price_cents,status) "
            "VALUES (%s,%s,'fremd','Fremd','2027-07-05','2027-07-09',6,12,20,1000,'published')", (fc, c["other"]))
    ok = _note(c, pid, camp_id=own_camp)
    assert ok.status_code == 201 and ok.json()["camp_id"] == own_camp  # player never booked it
    bad = _note(c, pid, camp_id=str(fc))
    assert bad.status_code == 422 and bad.json()["detail"] == {"code": "validation_error", "field": "camp_id",
                                                              "reason": "unknown reference"}
    nid = ok.json()["id"]
    up = c["client"].patch(f"{_base(c)}/{pid}/notes/{nid}", headers=c["headers"], json={"camp_id": str(fc)})
    assert up.status_code == 422
    assert players.get_note(c["org"], pid, nid)["camp_id"] == __import__("uuid").UUID(own_camp)
    assert c["client"].patch(f"{_base(c)}/{pid}/notes/{nid}", headers=c["headers"], json={"camp_id": None}).json()["camp_id"] is None


# ---------- goals ----------

def test_goal_crud_validation_and_audit(ctx):
    c = ctx
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    r = cl.post(f"{b}/{pid}/goals", headers=h, json={"title": SECRET, "area": "mental"})
    assert r.status_code == 201 and r.json()["status"] == "offen" and r.json()["target_date"] is None
    gid = r.json()["id"]
    u = cl.patch(f"{b}/{pid}/goals/{gid}", headers=h, json={"status": "erreicht", "target_date": "2027-05-01"})
    assert u.status_code == 200 and (u.json()["status"], u.json()["target_date"]) == ("erreicht", "2027-05-01")
    for bad, field in (({"status": "fertig"}, "status"), ({"area": "x"}, "area"), ({"title": ""}, "title"),
                       ({"target_date": "morgen"}, "target_date")):
        rr = cl.patch(f"{b}/{pid}/goals/{gid}", headers=h, json=bad)
        assert rr.status_code == 422 and rr.json()["detail"]["field"] == field
    assert cl.post(f"{b}/{pid}/goals", headers=h, json={"area": "technik"}).status_code == 422
    assert cl.delete(f"{b}/{pid}/goals/{gid}", headers=h).status_code == 204
    assert cl.delete(f"{b}/{pid}/goals/{gid}", headers=h).status_code == 404
    log = _audit(c)
    assert [e["action"] for e in log] == ["player_goal.created", "player_goal.updated", "player_goal.deleted"]
    assert SECRET not in str(log)


# ---------- measurements ----------

def test_measurement_crud_validation_and_audit(ctx):
    c = ctx
    pid = _pid(c)
    cl, b, h = c["client"], _base(c), c["headers"]
    r = cl.post(f"{b}/{pid}/measurements", headers=h,
                json={"measured_on": "2027-01-01", "metric": "sprint_10m", "value": 2.15, "note": SECRET})
    assert r.status_code == 201, r.text
    m = r.json()
    assert (m["unit"], m["value"], m["metric"]) == ("s", 2.15, "sprint_10m")
    free = cl.post(f"{b}/{pid}/measurements", headers=h,
                   json={"measured_on": "2027-01-02", "metric": "Liegestütze", "value": 12, "unit": "Anzahl"})
    assert free.status_code == 201 and free.json()["unit"] == "Anzahl"
    u = cl.patch(f"{b}/{pid}/measurements/{m['id']}", headers=h, json={"value": "2.05"})
    assert u.status_code == 200 and u.json()["value"] == 2.05
    assert cl.delete(f"{b}/{pid}/measurements/{m['id']}", headers=h).status_code == 204
    log = _audit(c)
    assert [e["action"] for e in log] == ["player_measurement.created", "player_measurement.created",
                                          "player_measurement.updated", "player_measurement.deleted"]
    assert SECRET not in str(log) and "Liegest" not in str(log)


@pytest.mark.parametrize("payload,field", [
    ({"value": "NaN"}, "value"), ({"value": "nan"}, "value"), ({"value": "Infinity"}, "value"),
    ({"value": True}, "value"), ({"value": "abc"}, "value"), ({"value": None}, "value"),
    ({"metric": "sprint_10m", "unit": "cm"}, "unit"), ({"metric": "frei", "unit": None}, "unit"),
    ({"metric": ""}, "metric"), ({"measured_on": "2027-02-30"}, "measured_on"),
])
def test_measurement_validation(ctx, payload, field):
    c = ctx
    pid = _pid(c)
    body = {"measured_on": "2027-01-01", "metric": "sprint_10m", "value": 2.0, **payload}
    r = c["client"].post(f"{_base(c)}/{pid}/measurements", headers=c["headers"], json=body)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]["field"] == field
    assert players.list_measurements(c["org"], pid) == []


def test_measurement_nan_literal_in_json_body(ctx):
    c = ctx
    pid = _pid(c)
    r = c["client"].post(f"{_base(c)}/{pid}/measurements", headers={**c["headers"], "content-type": "application/json"},
                         content=b'{"measured_on":"2027-01-01","metric":"sprint_10m","value":NaN}')
    assert r.status_code == 422 and players.list_measurements(c["org"], pid) == []


# ---------- session registrations include player_id ----------

def test_session_registrations_include_player_id(ctx):
    c = ctx
    offer = _new_offer(c, status="published")
    s = _new_session(c, offer).json()
    assert _book(c, s["slug"]).status_code == 201
    (row,) = c["client"].get(f"{_admin(c)}/{offer['id']}/sessions/{s['id']}/registrations", headers=c["headers"]).json()
    assert row["player_id"] == _pid(c)
    assert "documentation_consent" in row
    d = c["client"].get(f"{_base(c)}/{row['player_id']}", headers=c["headers"]).json()
    assert d["bookings"][0]["registration_id"] == row["id"]
