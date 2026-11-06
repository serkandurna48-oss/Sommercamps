"""Admin membership API + atomic CSV import (Stufe 1, Task 2).

Real disposable Postgres; synthetic data only. Auth by dependency override.
"""

from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import memberships
from .auth_helpers import org_admin_headers
from .test_review_postgres import local_database, real_db  # noqa: F401

HEADER = "vorname;nachname;geburtsdatum;mitgliedsnummer\n"


@pytest.fixture
def ctx(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    actor = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (actor,))  # audit_log.actor_user_id FK
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email,modules) "
            "VALUES (%s,%s,'Other','o@example.com','{camps,members}')",
            (other, f"other-{other.hex}"),
        )
    with TestClient(app) as client:
        yield dict(
            client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug,
            other=other, other_slug=f"other-{other.hex}", headers=org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )


def _base(c, slug=None):
    return f"/admin/organizations/{slug or c['slug']}/club-members"


def _count(c, org=None):
    with c["cursor"]() as cur:
        cur.execute("select count(*) n from organization_memberships where organization_id=%s", (org or c["org"],))
        return cur.fetchone()["n"]


def _audit(c):
    with c["cursor"]() as cur:
        cur.execute("select * from audit_log where organization_id=%s order by created_at", (c["org"],))
        return cur.fetchall()


def _import(c, csv_text, slug=None):
    return c["client"].post(_base(c, slug) + "/import", headers=c["headers"], json={"csv": csv_text})


# ---------- access ----------

def test_anonymous_rejected(ctx):
    c = ctx
    app.dependency_overrides.clear()
    assert c["client"].get(_base(c)).status_code == 401
    assert c["client"].post(_base(c) + "/import", json={"csv": "x"}).status_code == 401


def test_admin_of_other_org_cannot_touch_this_org(ctx):
    c = ctx
    m = memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    headers = org_admin_headers(str(c["other"]))
    cl = c["client"]
    assert cl.get(_base(c), headers=headers).status_code == 403
    assert cl.post(_base(c), headers=headers, json={"first_name": "A", "last_name": "B", "birth_date": "2015-01-01"}).status_code == 403
    assert cl.patch(f"{_base(c)}/{m['id']}", headers=headers, json={"active": False}).status_code == 403
    assert cl.post(_base(c) + "/import", headers=headers, json={"csv": HEADER + "A;B;01.01.2015;1\n"}).status_code == 403
    assert _count(c) == 1


def test_member_of_org_b_cannot_be_modified_via_org_a_path(ctx):
    """Admin of A uses A's slug with a member id that belongs to B -> 404, B unchanged."""
    c = ctx
    foreign = memberships.create_member(c["other"], first_name="Bea", last_name="Fremd", birth_date=date(2014, 1, 1))
    r = c["client"].patch(f"{_base(c)}/{foreign['id']}", headers=c["headers"], json={"active": False})
    assert r.status_code == 404
    assert memberships.list_members(c["other"], active_only=True)


def test_lists_are_tenant_scoped(ctx):
    c = ctx
    memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    memberships.create_member(c["other"], first_name="Bea", last_name="Fremd", birth_date=date(2014, 1, 1))
    names = [m["last_name"] for m in c["client"].get(_base(c), headers=c["headers"]).json()]
    assert names == ["Muster"]


# ---------- list / create / toggle ----------

def test_create_list_search_toggle(ctx):
    c, cl = ctx, ctx["client"]
    r = cl.post(_base(c), headers=c["headers"], json={"first_name": "Anna", "last_name": "Müller", "birth_date": "2015-03-05", "member_number": "7"})
    assert r.status_code == 201
    body = r.json()
    assert set(body) == {"id", "first_name", "last_name", "birth_date", "member_number", "active", "source", "extra", "created_at"}
    assert body["source"] == "manual" and body["active"] is True
    cl.post(_base(c), headers=c["headers"], json={"first_name": "Ben", "last_name": "Beispiel", "birth_date": "2014-01-01"})
    assert len(cl.get(_base(c), headers=c["headers"]).json()) == 2
    assert [m["first_name"] for m in cl.get(_base(c) + "?q=mueller", headers=c["headers"]).json()] == ["Anna"]
    assert [m["first_name"] for m in cl.get(_base(c) + "?q=7", headers=c["headers"]).json()] == ["Anna"]

    off = cl.patch(f"{_base(c)}/{body['id']}", headers=c["headers"], json={"active": False})
    assert off.status_code == 200 and off.json()["active"] is False
    assert [m["first_name"] for m in cl.get(_base(c) + "?active=true", headers=c["headers"]).json()] == ["Ben"]
    assert [m["first_name"] for m in cl.get(_base(c) + "?active=false", headers=c["headers"]).json()] == ["Anna"]
    on = cl.patch(f"{_base(c)}/{body['id']}", headers=c["headers"], json={"active": True})
    assert on.json()["active"] is True


def test_create_duplicate_is_409(ctx):
    c, cl = ctx, ctx["client"]
    payload = {"first_name": "Anna", "last_name": "Müller", "birth_date": "2015-03-05"}
    assert cl.post(_base(c), headers=c["headers"], json=payload).status_code == 201
    r = cl.post(_base(c), headers=c["headers"], json={**payload, "first_name": " anna ", "last_name": "MUELLER"})
    assert r.status_code == 409
    assert _count(c) == 1


def test_patch_unknown_member_404(ctx):
    c = ctx
    assert c["client"].patch(f"{_base(c)}/{uuid4()}", headers=c["headers"], json={"active": False}).status_code == 404


# ---------- import ----------

def test_import_creates_and_audits_without_personal_data(ctx):
    c = ctx
    r = _import(c, HEADER + "Anna;Geheimname;05.03.2015;M-1\nBen;Beispiel;2014-12-31;M-2\n")
    assert r.status_code == 200
    assert r.json() == {"rows": 2, "created": 2, "updated": 0, "merged_in_file": 0}
    assert _count(c) == 2
    log = _audit(c)
    assert [e["action"] for e in log] == ["memberships.imported"]
    assert log[0]["metadata"] == {"rows": 2, "created": 2, "updated": 0, "merged_in_file": 0}
    assert "Geheimname" not in repr(log)


def test_import_bom_comma_and_iso(ctx):
    c = ctx
    r = _import(c, "﻿Vorname,Nachname,Geburtsdatum,Mitgliedsnummer\r\nAnna,Muster,2015-03-05,1\r\nBen,Beispiel,01.02.2014,2\r\n")
    assert r.status_code == 200 and r.json()["created"] == 2
    found = memberships.find_active_member(c["org"], "ben", "beispiel", date(2014, 2, 1))
    assert found and found["source"] == "csv"


def test_import_one_bad_row_saves_nothing_and_leaks_nothing(ctx):
    c = ctx
    r = _import(c, HEADER + "Anna;Geheimname;05.03.2015;1\nBen;Beispiel;kein-datum;2\nCleo;Gut;01.01.2013;3\n")
    assert r.status_code == 422
    assert r.json()["detail"] == {
        "code": "import_invalid",
        "errors": [{"row": 3, "field": "geburtsdatum", "code": "invalid_date"}],
    }
    assert "Geheimname" not in r.text and "kein-datum" not in r.text and "2015" not in r.text
    assert _count(c) == 0
    assert _audit(c) == []


def test_import_db_failure_midway_rolls_back_everything(ctx, monkeypatch):
    """Rows are valid for the parser; the DB rejects the last one -> nothing persisted."""
    c = ctx
    rows = [
        dict(first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5), member_number="1"),
        dict(first_name="Ben", last_name="Beispiel", birth_date=date(2014, 1, 1), member_number=None),
        dict(first_name="  ", last_name="Leer", birth_date=date(2014, 1, 1), member_number=None),  # violates names check
    ]
    with pytest.raises(Exception):
        memberships.import_members(c["org"], rows)
    assert _count(c) == 0


def test_import_unexpected_failure_is_500_and_saves_nothing(ctx, monkeypatch):
    c = ctx

    def boom(org, rows, **kwargs):
        raise RuntimeError("db down")

    monkeypatch.setattr(memberships, "import_members", boom)
    assert _import(c, HEADER + "Anna;Muster;05.03.2015;1\n").status_code == 500
    assert _count(c) == 0


def test_import_duplicates_in_file_and_against_existing(ctx):
    c = ctx
    old = memberships.create_member(c["org"], first_name="Anna", last_name="Müller", birth_date=date(2015, 3, 5), member_number="OLD")
    memberships.deactivate_member(c["org"], old["id"])
    csv_text = (
        HEADER
        + "Anna;Mueller;05.03.2015;NEW\n"    # existing (normalised match), inactive -> reactivated
        + "Ben;Beispiel;01.01.2014;1\n"
        + "ben;BEISPIEL;2014-01-01;2\n"      # duplicate within file -> later row wins
    )
    r = _import(c, csv_text)
    assert r.status_code == 200
    assert r.json() == {"rows": 3, "created": 1, "updated": 1, "merged_in_file": 1}
    assert _count(c) == 2
    anna = memberships.find_active_member(c["org"], "Anna", "Müller", date(2015, 3, 5))
    assert anna["member_number"] == "NEW" and anna["id"] == old["id"] and anna["first_name"] == "Anna"
    ben = memberships.find_active_member(c["org"], "Ben", "Beispiel", date(2014, 1, 1))
    assert ben["member_number"] == "2"
    # re-import is idempotent
    r2 = _import(c, csv_text)
    assert r2.json() == {"rows": 3, "created": 0, "updated": 2, "merged_in_file": 1}
    assert _count(c) == 2


def test_import_blank_member_number_keeps_existing_number(ctx):
    c = ctx
    memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5), member_number="KEEP")
    assert _import(c, HEADER + "Anna;Muster;05.03.2015;\n").status_code == 200
    assert memberships.find_active_member(c["org"], "Anna", "Muster", date(2015, 3, 5))["member_number"] == "KEEP"


def test_import_does_not_touch_other_tenant(ctx):
    c = ctx
    memberships.create_member(c["other"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5), member_number="B")
    assert _import(c, HEADER + "Anna;Muster;05.03.2015;A\n").json()["created"] == 1
    assert memberships.find_active_member(c["other"], "Anna", "Muster", date(2015, 3, 5))["member_number"] == "B"
    assert _count(c) == 1 and _count(c, c["other"]) == 1


def test_import_too_many_rows(ctx):
    c = ctx
    body = HEADER + "".join(f"A{i};B;01.01.2015;\n" for i in range(2001))
    r = _import(c, body)
    assert r.status_code == 422
    assert r.json()["detail"]["errors"] == [{"row": 2002, "field": "file", "code": "too_many_rows"}]
    assert _count(c) == 0


def test_import_oversized_payload_rejected(ctx):
    c = ctx
    r = _import(c, "x" * (2 * 1024 * 1024))
    assert r.status_code == 413 or r.status_code == 422
    assert r.json()["detail"]["errors"][0]["code"] == "file_too_large"


def test_import_missing_csv_field_does_not_echo(ctx):
    c = ctx
    r = c["client"].post(_base(c) + "/import", headers=c["headers"], json={"csv": 123})
    assert r.status_code == 422


def test_import_db_error_logs_no_personal_data(ctx, monkeypatch, caplog):
    c = ctx

    def boom(org, rows, **kwargs):
        raise RuntimeError('Failing row contains (Geheimvorname, Geheimnachname, 2015-03-05)')

    monkeypatch.setattr(memberships, "import_members", boom)
    with caplog.at_level("DEBUG"):
        r = _import(c, HEADER + "Geheimvorname;Geheimnachname;05.03.2015;1\n")
    assert r.status_code == 500
    assert "Geheim" not in caplog.text and "2015" not in caplog.text and "Traceback" not in caplog.text
    assert "RuntimeError" in caplog.text


def test_import_database_busy_stays_503(ctx, monkeypatch):
    from app.db import DatabaseBusy
    c = ctx

    def busy(org, rows, **kwargs):
        raise DatabaseBusy()

    monkeypatch.setattr(memberships, "import_members", busy)
    assert _import(c, HEADER + "A;B;05.03.2015;1\n").status_code == 503


def test_owner_can_use_club_members(ctx):
    from .auth_helpers import owner_headers
    c = ctx
    memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    assert len(c["client"].get(_base(c), headers=owner_headers()).json()) == 1


def test_punctuation_only_search_matches_everything_not_by_accident(ctx):
    c = ctx
    memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    memberships.create_member(c["org"], first_name="Ben", last_name="Beispiel", birth_date=date(2014, 1, 1))
    assert len(memberships.list_members(c["org"], search="-")) == 2
    assert [m["first_name"] for m in memberships.list_members(c["org"], search="anna")] == ["Anna"]


def test_foreign_member_patch_leaves_state_and_audit_untouched(ctx):
    c = ctx
    foreign = memberships.create_member(c["other"], first_name="Bea", last_name="Fremd", birth_date=date(2014, 1, 1))
    assert c["client"].patch(f"{_base(c)}/{foreign['id']}", headers=c["headers"], json={"active": False}).status_code == 404
    assert memberships.list_members(c["other"])[0]["active"] is True
    assert _audit(c) == []
