"""Player records (Stufe 2+3, Task 1): players, notes, goals, measurements,
registration linking. Real local Postgres, synthetic data only."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import psycopg2.errors
import pytest

from app.repositories import players, training
from app.repositories import registrations as repo
from app.schemas import RegistrationCreate
from .test_registrations_api import _target, _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401

BIRTH = date(2015, 3, 4)


def _org(cursor):
    oid = uuid4()
    with cursor() as cur:
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email) VALUES (%s,%s,'Org','t@example.com')",
            (oid, f"t-{oid.hex}"),
        )
    return oid


def _player(org, first="Lena", last="Muster", birth=BIRTH):
    return players.find_or_create_player_id(org, first, last, birth)


def _camp(cursor, org, slug=None):
    cid = uuid4()
    with cursor() as cur:
        cur.execute(
            "INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,"
            "capacity,price_cents,status) VALUES (%s,%s,%s,'Camp','2027-07-05','2027-07-09',6,12,20,1000,'published')",
            (cid, org, slug or f"c-{cid.hex[:8]}"),
        )
    return cid


# ---------- find_or_create / dedupe ----------

def test_find_or_create_dedupes_spelling_variants(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    base = _player(org, "Jörg", "Größe")
    for first, last in [("JOERG", "GROESSE"), ("  jörg ", "Grösse"), ("Joerg", "Groesse"),
                        ("Jörg", "Größe")]:
        assert _player(org, first, last) == base
    assert _player(org, "Jörg", "Größe", date(2015, 3, 5)) != base
    assert _player(org, "Anna-Lena", "Lee") == _player(org, "Anna Lena", "Lee")
    assert _player(org, "Anna Maria", "Lee") != _player(org, "Anna", "Maria Lee")


def test_find_or_create_is_per_organization(real_db):
    cursor, tenant, _ = real_db
    other = _org(cursor)
    assert _player(tenant.organization_id) != _player(other)


def test_find_or_create_concurrent_same_child_yields_one_player(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    with ThreadPoolExecutor(max_workers=8) as ex:
        ids = list(ex.map(lambda i: _player(org, "Conny", f"Race{i % 1}"), range(8)))
    assert len(set(ids)) == 1
    assert len(players.list_players(org)) == 1


# ---------- registration linking ----------

def test_camp_registration_links_player(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    r1 = repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload(child_first_name="Müller")))
    r2 = repo.create_registration(
        tenant, camp, RegistrationCreate(**_valid_payload(child_first_name="MUELLER", parent_email="b@example.com")))
    # same child twice in the same camp is a duplicate only for identical spelling; both link to one player
    with cursor() as cur:
        cur.execute("select player_id from camp_registrations where registration_token in (%s,%s)",
                    (r1["registration_token"], r2["registration_token"]))
        ids = {r["player_id"] for r in cur.fetchall()}
    assert len(ids) == 1 and None not in ids
    assert len(players.list_players(org)) == 1


def test_training_registration_links_player_across_camp_and_training(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    offer = training.create_offer(
        org, slug="e-1", title="E", kind="einzel", duration_minutes=60,
        price_member_cents=1, price_nonmember_cents=2, status="published")
    session = training.create_session(org, offer["id"], datetime.now(timezone.utc) + timedelta(days=5),
                                    status="published")
    target = _target(
        organization_id=org, id=session["id"], slug=session["slug"], age_min=4, age_max=18,
        offer_id=session["offer_id"], starts_at=session["starts_at"], capacity=1,
        start_date=session["start_date"], end_date=session["end_date"])
    payload = _valid_payload(child_birth_date=BIRTH.isoformat(), payment_method="ueberweisung")
    repo.create_registration(tenant, camp, RegistrationCreate(**{**payload, "child_birth_date": "2017-05-10"}))
    repo.create_training_registration(tenant, target, RegistrationCreate(**{**payload, "child_birth_date": "2017-05-10"}))
    with cursor() as cur:
        cur.execute("select count(distinct player_id) n, count(player_id) c, count(*) t "
                    "from camp_registrations where organization_id=%s", (org,))
        row = cur.fetchone()
    assert (row["n"], row["c"], row["t"]) == (1, 2, 2)


def test_failed_registration_does_not_leave_player(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    data = RegistrationCreate(**_valid_payload())
    repo.create_registration(tenant, camp, data)
    with pytest.raises(repo.DuplicateRegistrationError):
        repo.create_registration(tenant, camp, data)
    assert len(players.list_players(org)) == 1


# ---------- list / summary ----------

def test_list_players_summary(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    pid = players.list_players(org)[0]["id"]
    players.create_note(org, pid, note_date=date(2027, 1, 2), body="x", focus=["technik"])
    players.create_note(org, pid, note_date=date(2027, 1, 3), body="y")
    players.create_goal(org, pid, title="g1", area="technik")
    g2 = players.create_goal(org, pid, title="g2", area="mental")
    players.update_goal(org, pid, g2["id"], status="erreicht")
    row = players.list_players(org)[0]
    assert row["note_count"] == 2 and row["open_goal_count"] == 1
    assert row["last_booking_date"] == date(2027, 7, 5)
    assert row["age"] >= 8
    assert "match_key" not in row
    assert players.list_players(org)[0]["id"] == pid


def test_last_booking_ignores_cancelled(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    r = repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    with cursor() as cur:
        cur.execute("update camp_registrations set status='cancelled' where registration_token=%s",
                    (r["registration_token"],))
    assert players.list_players(org)[0]["last_booking_date"] is None


def test_player_without_data_has_zero_counts(real_db):
    _, tenant, _ = real_db
    pid = _player(tenant.organization_id)
    row = players.list_players(tenant.organization_id)[0]
    assert (row["note_count"], row["open_goal_count"], row["last_booking_date"]) == (0, 0, None)
    assert players.get_player(tenant.organization_id, pid)["first_name"] == "Lena"


def test_player_bookings_list(real_db):
    _, tenant, camp = real_db
    org = tenant.organization_id
    repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    pid = players.list_players(org)[0]["id"]
    rows = players.list_player_bookings(org, pid)
    assert len(rows) == 1 and rows[0]["camp_title"] == "Review"
    assert "registration_token" not in rows[0] and "parent_email" not in rows[0]


# ---------- notes ----------

def test_note_crud_and_defaults(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    camp_id = _camp(cursor, org)
    n = players.create_note(
        org, pid, note_date=date(2027, 2, 1), body="Gute Einheit", focus=["technik", "mental"],
        rating=4, next_steps="Passspiel", video_url="https://example.com/v/1", camp_id=camp_id)
    assert n["focus"] == ["technik", "mental"] and n["rating"] == 4 and n["camp_id"] == camp_id
    bare = players.create_note(org, pid, note_date=date(2027, 2, 2), body="Kurz")
    assert bare["focus"] == [] and bare["rating"] is None and bare["video_url"] is None
    upd = players.update_note(org, pid, n["id"], rating=None, body="Neu", focus=["video"])
    assert upd["rating"] is None and upd["body"] == "Neu" and upd["focus"] == ["video"]
    assert upd["next_steps"] == "Passspiel"
    notes = players.list_notes(org, pid)
    assert [x["id"] for x in notes] == [bare["id"], n["id"]]  # newest date first
    assert players.delete_note(org, pid, n["id"]) is True
    assert players.delete_note(org, pid, n["id"]) is False
    assert players.get_note(org, pid, n["id"]) is None


@pytest.mark.parametrize("over", [
    dict(focus=["technik", "zauber"]), dict(focus="technik"), dict(rating=0), dict(rating=6),
    dict(rating=True), dict(rating="3"), dict(video_url="http://example.com/v"),
    dict(video_url="javascript:alert(1)"), dict(video_url="https://"), dict(video_url="https://a b"),
    dict(video_url="ftp://x.de/a"), dict(body="  "), dict(body=""),
])
def test_note_validation_rejects(real_db, over):
    _, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    kw = dict(note_date=date(2027, 2, 1), body="ok")
    kw.update(over)
    with pytest.raises(players.PlayerValidationError):
        players.create_note(org, pid, **kw)


def test_note_validation_on_update(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    n = players.create_note(org, pid, note_date=date(2027, 2, 1), body="ok")
    with pytest.raises(players.PlayerValidationError):
        players.update_note(org, pid, n["id"], rating=9)
    with pytest.raises(players.PlayerValidationError):
        players.update_note(org, pid, n["id"], not_a_field=1)  # unknown field


def test_note_db_constraints_hold_without_python(real_db):
    cursor, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    base = "insert into player_notes (organization_id, player_id, note_date, body, {c}) values (%s,%s,'2027-01-01','b',%s)"
    for col, val in [("rating", 7), ("rating", 0), ("video_url", "http://x.de"), ("focus", ["boese"])]:
        with pytest.raises(psycopg2.errors.CheckViolation):
            with cursor() as cur:
                cur.execute(base.format(c=col), (org, pid, val))
    with pytest.raises(psycopg2.errors.CheckViolation):
        with cursor() as cur:
            cur.execute("insert into player_notes (organization_id, player_id, note_date, body)"
                        " values (%s,%s,'2027-01-01','  ')", (org, pid))


# ---------- goals ----------

def test_goal_crud_and_validation(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    g = players.create_goal(org, pid, title="Linker Fuß", area="technik", target_date=date(2027, 6, 1))
    assert g["status"] == "offen" and g["target_date"] == date(2027, 6, 1)
    u = players.update_goal(org, pid, g["id"], status="verworfen", target_date=None)
    assert u["status"] == "verworfen" and u["target_date"] is None
    assert [x["id"] for x in players.list_goals(org, pid)] == [g["id"]]
    assert [x["id"] for x in players.list_goals(org, pid, status="offen")] == []
    for kw in [dict(area="magie"), dict(title=" "), dict(status="fertig")]:
        with pytest.raises(players.PlayerValidationError):
            players.create_goal(org, pid, **{**dict(title="t", area="technik"), **kw})
    with pytest.raises(players.PlayerValidationError):
        players.update_goal(org, pid, g["id"], status="x")
    assert players.delete_goal(org, pid, g["id"]) is True
    assert players.get_goal(org, pid, g["id"]) is None


def test_goal_db_constraints(real_db):
    cursor, tenant, _ = real_db
    pid = _player(tenant.organization_id)
    for area, status in [("magie", "offen"), ("technik", "fertig")]:
        with pytest.raises(psycopg2.errors.CheckViolation):
            with cursor() as cur:
                cur.execute("insert into player_goals (organization_id, player_id, title, area, status)"
                            " values (%s,%s,'t',%s,%s)", (tenant.organization_id, pid, area, status))


# ---------- measurements ----------

def test_standard_metrics_constant():
    assert players.STANDARD_METRICS == {
        "sprint_10m": "s", "sprint_30m": "s", "standweitsprung": "cm", "jonglieren": "Anzahl"}


def test_measurement_standard_and_free_metric(real_db):
    _, tenant, _ = real_db
    org = tenant.organization_id
    pid = _player(org)
    m = players.create_measurement(org, pid, measured_on=date(2027, 3, 1), metric="sprint_10m", value=Decimal("2.05"))
    assert m["unit"] == "s" and m["value"] == Decimal("2.05")
    free = players.create_measurement(org, pid, measured_on=date(2027, 3, 2), metric="Ballkontakte 30s",
                                      value=41, unit="Anzahl", note="Test")
    assert free["metric"] == "Ballkontakte 30s" and free["note"] == "Test"
    for kw in [dict(metric="sprint_10m", unit="cm"), dict(metric="frei"), dict(metric=" ", unit="s"),
               dict(metric="sprint_30m", value=float("nan")), dict(metric="sprint_30m", value=float("inf")),
               dict(metric="sprint_30m", value="abc"), dict(metric="sprint_30m", value=True)]:
        with pytest.raises(players.PlayerValidationError):
            players.create_measurement(org, pid, **{**dict(measured_on=date(2027, 3, 1), value=1), **kw})
    rows = players.list_measurements(org, pid)
    assert [r["metric"] for r in rows] == ["Ballkontakte 30s", "sprint_10m"]  # newest first
    assert [r["metric"] for r in players.list_measurements(org, pid, metric="sprint_10m")] == ["sprint_10m"]
    up = players.update_measurement(org, pid, m["id"], value=Decimal("1.99"))
    assert up["value"] == Decimal("1.99")
    assert players.delete_measurement(org, pid, m["id"]) is True
    assert players.get_measurement(org, pid, m["id"]) is None


def test_measurement_db_rejects_nan(real_db):
    cursor, tenant, _ = real_db
    pid = _player(tenant.organization_id)
    with pytest.raises(psycopg2.errors.CheckViolation):
        with cursor() as cur:
            cur.execute("insert into player_measurements (organization_id, player_id, measured_on, metric, value, unit)"
                        " values (%s,%s,'2027-01-01','x','NaN','s')", (tenant.organization_id, pid))


# ---------- tenant boundary ----------

def test_tenant_isolation_for_all_record_types(real_db):
    cursor, tenant, _ = real_db
    a, b = tenant.organization_id, _org(cursor)
    pb = _player(b)
    nb = players.create_note(b, pb, note_date=date(2027, 1, 1), body="geheim")
    gb = players.create_goal(b, pb, title="g", area="technik")
    mb = players.create_measurement(b, pb, measured_on=date(2027, 1, 1), metric="sprint_10m", value=2)
    # reading / modifying with the wrong organization finds nothing
    assert players.get_player(a, pb) is None
    assert players.list_players(a) == []
    assert players.list_notes(a, pb) == [] and players.list_goals(a, pb) == []
    assert players.list_measurements(a, pb) == [] and players.list_player_bookings(a, pb) == []
    assert players.get_note(a, pb, nb["id"]) is None
    assert players.update_note(a, pb, nb["id"], body="x") is None
    assert players.update_goal(a, pb, gb["id"], status="erreicht") is None
    assert players.update_measurement(a, pb, mb["id"], value=1) is None
    assert not players.delete_note(a, pb, nb["id"]) and not players.delete_goal(a, pb, gb["id"])
    assert not players.delete_measurement(a, pb, mb["id"])
    # right org but wrong player in the path does not reach the record either
    pa = _player(a)
    assert players.get_note(a, pa, nb["id"]) is None
    assert players.update_note(b, pa, nb["id"], body="x") is None
    # creating records for a foreign player is refused
    for fn, kw in [(players.create_note, dict(note_date=date(2027, 1, 1), body="x")),
                   (players.create_goal, dict(title="t", area="technik")),
                   (players.create_measurement, dict(measured_on=date(2027, 1, 1), metric="sprint_10m", value=1))]:
        with pytest.raises(players.PlayerNotFoundError):
            fn(a, pb, **kw)
    assert players.get_note(b, pb, nb["id"])["body"] == "geheim"


def test_note_camp_must_belong_to_same_organization(real_db):
    cursor, tenant, _ = real_db
    a, b = tenant.organization_id, _org(cursor)
    foreign_camp = _camp(cursor, b)
    pid = _player(a)
    with pytest.raises(players.PlayerReferenceError):
        players.create_note(a, pid, note_date=date(2027, 1, 1), body="x", camp_id=foreign_camp)
    # DB layer too (composite FK), bypassing the repository
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):
        with cursor() as cur:
            cur.execute("insert into player_notes (organization_id, player_id, camp_id, note_date, body)"
                        " values (%s,%s,%s,'2027-01-01','x')", (a, pid, foreign_camp))
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):  # player of another org
        with cursor() as cur:
            cur.execute("insert into player_goals (organization_id, player_id, title, area) values (%s,%s,'t','technik')",
                        (b, pid))
    with pytest.raises(psycopg2.errors.ForeignKeyViolation):  # registration linked to a foreign player
        with cursor() as cur:
            cur.execute("update camp_registrations set player_id=%s where organization_id=%s", (pid, b))
            cur.execute("insert into camp_registrations (organization_id,camp_id,parent_first_name,parent_last_name,"
                        "parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,"
                        "privacy_accepted,player_id) values (%s,%s,'P','P','p@example.com','1','C','C','2016-01-01',"
                        "true,true,%s)", (b, foreign_camp, pid))


# ---------- schema hardening ----------

def test_new_tables_have_rls_and_no_policies(real_db):
    cursor, _, _ = real_db
    with cursor() as cur:
        for table in ("players", "player_notes", "player_goals", "player_measurements"):
            cur.execute("select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",))
            assert cur.fetchone()["relrowsecurity"] is True
            cur.execute("select count(*) n from pg_policies where tablename = %s", (table,))
            assert cur.fetchone()["n"] == 0  # no policy: backend-only (privileges: migration test)


def test_documentation_consent_column_defaults_null(real_db):
    cursor, tenant, camp = real_db
    repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload()))
    with cursor() as cur:
        cur.execute("select documentation_consent from camp_registrations where organization_id=%s",
                    (tenant.organization_id,))
        assert cur.fetchone()["documentation_consent"] is None


def test_updated_at_trigger_on_players_tables(real_db):
    cursor, tenant, _ = real_db
    pid = _player(tenant.organization_id)
    with cursor() as cur:
        cur.execute("select updated_at from players where id=%s", (pid,))
        old = cur.fetchone()["updated_at"]
    with cursor() as cur:  # separate transaction: now() differs
        cur.execute("update players set first_name='Lena' where id=%s returning updated_at", (pid,))
        assert cur.fetchone()["updated_at"] > old


# ---------- review fixes: relink function, Infinity, name correction, same-child wait ----------

def _insert_unlinked(cursor, org, camp_id, first, last, birth="2016-01-01", n=0):
    with cursor() as cur:
        cur.execute(
            "insert into camp_registrations(organization_id,camp_id,parent_first_name,parent_last_name,parent_email,"
            "parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,privacy_accepted)"
            " values (%s,%s,'P','Q',%s,'1',%s,%s,%s,true,true) returning registration_token",
            (org, camp_id, f"u{n}-{uuid4().hex[:6]}@example.com", first, last, birth))
        return cur.fetchone()["registration_token"]


def test_link_unlinked_registrations_links_and_is_idempotent(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    t1 = _insert_unlinked(cursor, org, camp.id, "Jörg", "Größe")
    t2 = _insert_unlinked(cursor, org, camp.id, "JOERG", "GROESSE", n=1)
    assert players.link_unlinked_registrations() >= 2
    with cursor() as cur:
        cur.execute("select player_id from camp_registrations where registration_token in (%s,%s)", (t1, t2))
        ids = {r["player_id"] for r in cur.fetchall()}
    assert len(ids) == 1 and None not in ids
    assert players.link_unlinked_registrations() == 0
    assert len(players.list_players(org)) == 1


def test_link_function_and_normaliser_are_not_callable_by_anon(real_db):
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("select proname, provolatile, prosecdef from pg_proc "
                    "where proname in ('link_unlinked_registrations','normalize_match_part') order by 1")
        rows = {r["proname"]: r for r in cur.fetchall()}
    assert rows["normalize_match_part"]["provolatile"] == "s"
    assert not rows["link_unlinked_registrations"]["prosecdef"]


def test_measurement_rejects_infinity(real_db):
    cursor, tenant, _ = real_db
    pid = _player(tenant.organization_id)
    for v in (float("inf"), float("-inf"), Decimal("Infinity")):
        with pytest.raises(players.PlayerValidationError):
            players.create_measurement(tenant.organization_id, pid, measured_on=date(2027, 1, 1),
                                       metric="sprint_10m", value=v)
    for lit in ("Infinity", "-Infinity"):
        with pytest.raises(psycopg2.errors.CheckViolation):
            with cursor() as cur:
                cur.execute("insert into player_measurements (organization_id, player_id, measured_on, metric, value, unit)"
                            " values (%s,%s,'2027-01-01','x',%s::numeric,'s')", (tenant.organization_id, pid, lit))


def test_name_correction_relinks_player(real_db):
    cursor, tenant, camp = real_db
    org = tenant.organization_id
    r = repo.create_registration(tenant, camp, RegistrationCreate(**_valid_payload(child_first_name="Lenna")))
    wrong = players.list_players(org)[0]["id"]
    repo.update_registration_details(org, camp.id, r["registration_token"], "Lena", "Mustermann", None, None, None)
    with cursor() as cur:
        cur.execute("select player_id from camp_registrations where registration_token=%s", (r["registration_token"],))
        fixed = cur.fetchone()["player_id"]
    assert fixed != wrong
    assert fixed == _player(org, "Lena", "Mustermann", date.fromisoformat("2017-05-10"))


def test_same_child_in_other_camp_waits_for_first_transaction_then_shares_player(real_db, monkeypatch):
    from contextlib import contextmanager
    from threading import Event
    from app import db

    cursor, tenant, camp = real_db
    org = tenant.organization_id
    other = _target(organization_id=org, slug="other2")
    with cursor() as cur:
        cur.execute("INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,age_min,age_max,capacity,"
                    "price_cents,status) VALUES (%s,%s,'other2','Other','2027-07-05','2027-07-09',6,12,20,1000,'published')",
                    (other.id, org))
    inserted, release = Event(), Event()

    @contextmanager
    def held_cursor():
        with cursor() as cur:
            yield cur
            if cur.query and b"insert into camp_registrations" in cur.query.lower():
                inserted.set()
                assert release.wait(8)

    monkeypatch.setattr(db, "get_cursor", held_cursor)
    data = RegistrationCreate(**_valid_payload())
    with ThreadPoolExecutor(max_workers=2) as ex:
        first = ex.submit(repo.create_registration, tenant, camp, data)
        try:
            assert inserted.wait(5)
            monkeypatch.setattr(db, "get_cursor", cursor)
            second = ex.submit(repo.create_registration, tenant, other, data)
            with pytest.raises(Exception):  # still waiting on the uncommitted player row
                second.result(timeout=1)
        finally:
            release.set()
        a = first.result(timeout=10)
        b = second.result(timeout=10)
    assert a["status"] == b["status"] == "registered"
    with cursor() as cur:
        cur.execute("select count(distinct player_id) n, count(player_id) c from camp_registrations where organization_id=%s", (org,))
        row = cur.fetchone()
    assert (row["n"], row["c"]) == (1, 2)


def test_startup_linking_is_best_effort_and_logs_no_names(monkeypatch, caplog):
    from app import main

    monkeypatch.setattr(players, "link_unlinked_registrations", lambda: 3)
    with caplog.at_level("INFO"):
        main._link_unlinked_registrations_best_effort()
    assert "Linked 3 registrations" in caplog.text

    def boom():
        raise RuntimeError("Lena Mustermann secret")

    monkeypatch.setattr(players, "link_unlinked_registrations", boom)
    caplog.clear()
    main._link_unlinked_registrations_best_effort()  # must not raise
    assert "RuntimeError" in caplog.text and "Lena" not in caplog.text
