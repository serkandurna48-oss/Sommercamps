"""Flexible member CSV import: column mapping, extra fields, is_member on players.

Pure parser tests + real disposable Postgres; synthetic data only.
"""

from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.membership_csv import MembershipCsvError, parse_mapping, parse_membership_csv
from app.repositories import memberships, players
from .auth_helpers import org_admin_headers
from .test_review_postgres import local_database, real_db  # noqa: F401

CLUB_EXPORT = (
    "Mitgl.-Nr.;Name;Vorname;Geb.-Datum;Mannschaft;Telefon\n"
    "M-7;Muster;Anna;05.03.2015;U10;0123 SECRETPHONE\n"
    "M-8;Beispiel;Ben;2014-12-31;U11;\n"
)
MAPPING = {"0": "member_number", "1": "last_name", "2": "first_name", "3": "birth_date",
           "4": {"extra": "Mannschaft"}, "5": None}


def _errors(text, mapping):
    with pytest.raises(MembershipCsvError) as exc:
        parse_membership_csv(text, mapping)
    return exc.value.errors


# ---------- parser ----------

def test_mapping_ignores_header_names_and_collects_extra():
    rows = parse_membership_csv(CLUB_EXPORT, MAPPING)
    assert rows[0] == dict(first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5),
                           member_number="M-7", extra={"Mannschaft": "U10"})
    assert rows[1]["birth_date"] == date(2014, 12, 31)
    # Unmapped (None) phone column is never read into a row.
    assert all("SECRETPHONE" not in repr(r) for r in rows)


def test_without_mapping_old_exact_header_rule_still_applies():
    errs = _errors(CLUB_EXPORT, None)
    assert {e["code"] for e in errs} == {"missing_column"}


def test_extra_values_trimmed_and_empty_left_out():
    text = "a;b;c;d\nAnna;Muster;05.03.2015;  U10  \nBen;B;05.03.2015;   \n"
    rows = parse_membership_csv(text, {"0": "first_name", "1": "last_name", "2": "birth_date", "3": {"extra": " Team  A "}})
    assert rows[0]["extra"] == {"Team A": "U10"}
    assert rows[1]["extra"] == {}


@pytest.mark.parametrize("missing", ["first_name", "last_name", "birth_date"])
def test_missing_required_mapping(missing):
    mapping = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    mapping = {k: (None if v == missing else v) for k, v in mapping.items()}
    errs = _errors("a;b;c\nA;B;01.01.2015\n", mapping)
    field = {"first_name": "vorname", "last_name": "nachname", "birth_date": "geburtsdatum"}[missing]
    assert errs == [{"row": 1, "field": field, "code": "missing_mapping"}]


def test_duplicate_required_mapping():
    errs = _errors("a;b;c;d\nA;B;C;01.01.2015\n", {"0": "first_name", "1": "first_name", "2": "last_name", "3": "birth_date"})
    assert errs == [{"row": 1, "field": "vorname", "code": "duplicate_mapping"}]


def test_extra_field_limits():
    header = ";".join(f"c{i}" for i in range(14))
    row = ";".join(["A", "B", "01.01.2015"] + ["x"] * 11)
    mapping = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    mapping.update({str(i): {"extra": f"Feld {i}"} for i in range(3, 14)})  # 11 extras
    assert {"row": 1, "field": "extra", "code": "too_many_extra_fields"} in _errors(f"{header}\n{row}\n", mapping)
    del mapping["13"]
    assert len(parse_membership_csv(f"{header}\n{row}\n", mapping)[0]["extra"]) == 10

    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    text = "a;b;c;d\nA;B;01.01.2015;x\n"
    assert _errors(text, {**base, "3": {"extra": "L" * 41}}) == [{"row": 1, "field": "extra", "code": "invalid_label"}]
    assert _errors(text, {**base, "3": {"extra": "   "}}) == [{"row": 1, "field": "extra", "code": "invalid_label"}]
    assert parse_membership_csv(text, {**base, "3": {"extra": "L" * 40}})[0]["extra"] == {"L" * 40: "x"}
    long_value = "a;b;c;d\nA;B;01.01.2015;" + "V" * 201 + "\n"
    errs = _errors(long_value, {**base, "3": {"extra": "Team"}})
    assert errs == [{"row": 2, "field": "Team", "code": "too_long"}]
    assert "V" * 201 not in repr(errs)


def test_duplicate_extra_labels_and_bad_targets():
    text = "a;b;c;d;e\nA;B;01.01.2015;x;y\n"
    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    assert _errors(text, {**base, "3": {"extra": "Team"}, "4": {"extra": "team"}}) == [
        {"row": 1, "field": "team", "code": "duplicate_label"}]
    assert _errors(text, {**base, "3": "password"})[0]["code"] == "invalid_target"
    assert _errors(text, {**base, "9": {"extra": "X"}})[0]["code"] == "invalid_column"
    assert _errors(text, {**base, "-1": None})[0]["code"] == "invalid_column"
    assert _errors(text, {**base, "abc": None})[0]["code"] == "invalid_column"
    with pytest.raises(MembershipCsvError):
        parse_mapping(["first_name"], 3)


def test_mapping_row_errors_do_not_echo_values():
    errs = _errors("a;b;c\nGeheimname;Kind;kaputt\n", {"0": "first_name", "1": "last_name", "2": "birth_date"})
    assert errs == [{"row": 2, "field": "geburtsdatum", "code": "invalid_date"}]
    assert "Geheimname" not in repr(errs)


# ---------- API ----------

@pytest.fixture
def ctx(real_db):
    cursor, tenant, _ = real_db
    other = uuid4()
    actor = uuid4()
    with cursor() as cur:
        cur.execute("INSERT INTO auth.users(id) VALUES (%s)", (actor,))
        cur.execute(
            "INSERT INTO organizations(id,slug,name,contact_email,modules) "
            "VALUES (%s,%s,'Other','o@example.com','{camps,members,players}')",
            (other, f"other-{other.hex}"),
        )
    with TestClient(app) as client:
        yield dict(
            client=client, cursor=cursor, org=tenant.organization_id, slug=tenant.slug,
            other=other, other_slug=f"other-{other.hex}",
            actor=actor, headers=org_admin_headers(str(tenant.organization_id), user_id=str(actor)),
        )


def _as_other(c) -> dict:
    """Auth is a global dependency override: switch identity to an admin of the other org."""
    return org_admin_headers(str(c["other"]))


def _as_admin(c) -> dict:
    return org_admin_headers(str(c["org"]), user_id=str(c["actor"]))


def _members(c, slug=None, headers=None):
    return f"/admin/organizations/{slug or c['slug']}/club-members"


def _import(c, csv_text, mapping, slug=None, headers=None):
    body = {"csv": csv_text} if mapping is None else {"csv": csv_text, "mapping": mapping}
    return c["client"].post(_members(c, slug) + "/import", headers=headers or c["headers"], json=body)


def _list(c, slug=None, headers=None):
    r = c["client"].get(_members(c, slug), headers=headers or c["headers"])
    assert r.status_code == 200
    return {m["first_name"]: m for m in r.json()}


def test_api_mapping_import_with_aliases_and_extra(ctx):
    c = ctx
    r = _import(c, CLUB_EXPORT, MAPPING)
    assert r.status_code == 200, r.text
    assert r.json() == {"rows": 2, "created": 2, "updated": 0, "merged_in_file": 0}
    listed = _list(c)
    assert listed["Anna"]["extra"] == {"Mannschaft": "U10"}
    assert listed["Anna"]["member_number"] == "M-7"
    assert listed["Ben"]["extra"] == {"Mannschaft": "U11"}
    with c["cursor"]() as cur:
        cur.execute("select metadata from audit_log where organization_id=%s and action='memberships.imported'", (c["org"],))
        meta = cur.fetchone()["metadata"]
    assert meta["extra_fields"] == 1 and "Mannschaft" not in repr(meta) and "Anna" not in repr(meta)


def test_api_missing_required_mapping_is_422_and_saves_nothing(ctx):
    c = ctx
    r = _import(c, CLUB_EXPORT, {**MAPPING, "3": None})
    assert r.status_code == 422
    assert r.json()["detail"] == {"code": "import_invalid", "errors": [{"row": 1, "field": "geburtsdatum", "code": "missing_mapping"}]}
    assert "Anna" not in r.text
    assert _list(c) == {}


def test_api_non_dict_mapping_is_422(ctx):
    c = ctx
    r = _import(c, CLUB_EXPORT, ["first_name"])
    assert r.status_code == 422


def test_api_reimport_merges_extra_fields(ctx):
    c = ctx
    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    assert _import(c, "v;n;g;t;b\nAnna;Muster;05.03.2015;U10;Familie\n",
                   {**base, "3": {"extra": "Team"}, "4": {"extra": "Beitrag"}}).status_code == 200
    r = _import(c, "v;n;g;t;s\nanna;MUSTER;05.03.2015;U11;rechts\n", {**base, "3": {"extra": "Team"}, "4": {"extra": "Fuß"}})
    assert r.json()["updated"] == 1 and r.json()["created"] == 0
    assert _list(c)["Anna"]["extra"] == {"Team": "U11", "Beitrag": "Familie", "Fuß": "rechts"}
    # An empty cell keeps the stored value, an import without mapping keeps all extras.
    _import(c, "v;n;g;t\nAnna;Muster;05.03.2015;\n", {**base, "3": {"extra": "Team"}})
    _import(c, "vorname;nachname;geburtsdatum\nAnna;Muster;05.03.2015\n", None)
    assert _list(c)["Anna"]["extra"] == {"Team": "U11", "Beitrag": "Familie", "Fuß": "rechts"}


def test_api_duplicates_in_file_merge_extra(ctx):
    c = ctx
    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    r = _import(c, "v;n;g;t;b\nAnna;Muster;05.03.2015;U10;\nAnna;Muster;05.03.2015;;Familie\n",
                {**base, "3": {"extra": "Team"}, "4": {"extra": "Beitrag"}})
    assert r.json()["merged_in_file"] == 1
    assert _list(c)["Anna"]["extra"] == {"Team": "U10", "Beitrag": "Familie"}


def test_api_mapping_import_is_tenant_isolated(ctx):
    c = ctx
    memberships.create_member(c["other"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    assert _import(c, CLUB_EXPORT, MAPPING).status_code == 200
    other = _list(c, slug=c["other_slug"], headers=_as_other(c))
    assert other["Anna"]["extra"] == {} and other["Anna"]["source"] == "manual"
    assert set(other) == {"Anna"}
    # Admin of the other org cannot import into this org.
    assert _import(c, CLUB_EXPORT, MAPPING, headers=_as_other(c)).status_code == 403


def test_api_patch_extra_fields(ctx):
    c = ctx
    m = memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    url = f"{_members(c)}/{m['id']}"
    r = c["client"].patch(url, headers=c["headers"], json={"extra": {" Team ": " U10 ", "Leer": "  "}})
    assert r.status_code == 200, r.text
    assert r.json()["extra"] == {"Team": "U10"} and r.json()["active"] is True
    r = c["client"].patch(url, headers=c["headers"], json={"active": False})
    assert r.json()["extra"] == {"Team": "U10"} and r.json()["active"] is False
    assert c["client"].patch(url, headers=c["headers"], json={"extra": {"T": "V" * 201}}).status_code == 422
    assert c["client"].patch(url, headers=c["headers"], json={"extra": {"L" * 41: "x"}}).status_code == 422
    assert c["client"].patch(url, headers=c["headers"], json={}).status_code == 422
    # Foreign org: forbidden; foreign member id under own slug: 404.
    assert c["client"].patch(url, headers=_as_other(c), json={"extra": {}}).status_code == 403
    foreign = memberships.create_member(c["other"], first_name="X", last_name="Y", birth_date=date(2015, 1, 1))
    assert c["client"].patch(f"{_members(c)}/{foreign['id']}", headers=_as_admin(c), json={"extra": {"a": "b"}}).status_code == 404
    with c["cursor"]() as cur:
        cur.execute("select extra from organization_memberships where id=%s", (foreign["id"],))
        assert cur.fetchone()["extra"] == {}
        cur.execute("select metadata from audit_log where organization_id=%s and action='membership.extra_changed'", (c["org"],))
        assert cur.fetchone()["metadata"] == {"fields": 1}


def test_extra_migration_idempotent_and_backend_only(ctx):
    """The harness grants all tables to anon/authenticated after migrations, so the
    revoke is asserted by re-running the migration; RLS stays on without policies."""
    from pathlib import Path
    c = ctx
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "20261106120000_membership_extra_fields.sql"
    memberships.create_member(c["org"], first_name="Anna", last_name="Muster", birth_date=date(2015, 3, 5))
    with c["cursor"]() as cur:
        cur.execute(migration.read_text(encoding="utf-8"))
        cur.execute(migration.read_text(encoding="utf-8"))
        for role in ("anon", "authenticated"):
            cur.execute("select has_table_privilege(%s,'public.organization_memberships','SELECT') p", (role,))
            assert cur.fetchone()["p"] is False
        cur.execute("select relrowsecurity from pg_class where oid='public.organization_memberships'::regclass")
        assert cur.fetchone()["relrowsecurity"] is True
        cur.execute("select count(*) n from pg_policies where tablename='organization_memberships'")
        assert cur.fetchone()["n"] == 0
        cur.execute("select column_default, is_nullable from information_schema.columns "
                    "where table_name='organization_memberships' and column_name='extra'")
        col = cur.fetchone()
        cur.execute("select extra from organization_memberships where organization_id=%s", (c["org"],))
        assert cur.fetchone()["extra"] == {}
    assert col["is_nullable"] == "NO" and "'{}'" in col["column_default"]
    with pytest.raises(Exception):
        with c["cursor"]() as cur:
            cur.execute("update organization_memberships set extra='[]'::jsonb where organization_id=%s", (c["org"],))


# ---------- is_member ----------

def _players(c, slug=None, headers=None):
    r = c["client"].get(f"/admin/organizations/{slug or c['slug']}/players", headers=headers or c["headers"])
    assert r.status_code == 200
    return {p["first_name"]: p for p in r.json()}


def test_is_member_on_players_list_and_detail(ctx):
    c = ctx
    born = date(2015, 3, 5)
    lena = players.find_or_create_player_id(c["org"], "Lena", "Müller", born)
    players.find_or_create_player_id(c["org"], "Tom", "Gast", born)
    players.find_or_create_player_id(c["org"], "Ina", "Alt", born)
    players.find_or_create_player_id(c["org"], "Kim", "Datum", born)
    # Same name spelled differently (normalised match), inactive member, other birth date.
    memberships.create_member(c["org"], first_name="lena", last_name="Mueller", birth_date=born)
    ina = memberships.create_member(c["org"], first_name="Ina", last_name="Alt", birth_date=born)
    memberships.set_member_active(c["org"], ina["id"], False)
    memberships.create_member(c["org"], first_name="Kim", last_name="Datum", birth_date=date(2015, 3, 6))
    # Member only in the other org must not count.
    memberships.create_member(c["other"], first_name="Tom", last_name="Gast", birth_date=born)

    listed = _players(c)
    assert {k: v["is_member"] for k, v in listed.items()} == {"Lena": True, "Tom": False, "Ina": False, "Kim": False}
    detail = c["client"].get(f"/admin/organizations/{c['slug']}/players/{lena}", headers=c["headers"]).json()
    assert detail["player"]["is_member"] is True


def test_is_member_is_org_filtered_for_other_tenant(ctx):
    c = ctx
    born = date(2015, 3, 5)
    players.find_or_create_player_id(c["other"], "Tom", "Gast", born)
    memberships.create_member(c["org"], first_name="Tom", last_name="Gast", birth_date=born)
    assert _players(c, slug=c["other_slug"], headers=_as_other(c))["Tom"]["is_member"] is False


# ---------- review fixes: org-wide label cap, remove field, key/label hardening ----------

def test_non_canonical_or_repeated_column_keys_rejected():
    text = "a;b;c;d\nA;B;01.01.2015;x\n"
    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    for key in (" 3", "03", "+3", "3.0"):
        assert {"row": 1, "field": "mapping", "code": "invalid_column"} in _errors(text, {**base, key: {"extra": "X"}})
    # "2" and "02" would point two targets at the same column.
    assert {"row": 1, "field": "mapping", "code": "invalid_column"} in _errors(text, {**base, "02": {"extra": "X"}})


@pytest.mark.parametrize("label", ["__proto__", "constructor", "Prototype"])
def test_js_prototype_labels_rejected(label):
    errs = _errors("a;b;c;d\nA;B;01.01.2015;x\n", {"0": "first_name", "1": "last_name", "2": "birth_date", "3": {"extra": label}})
    assert errs == [{"row": 1, "field": "extra", "code": "invalid_label"}]


def _wide_import(c, first, labels):
    header = ";".join(["v", "n", "g", *labels])
    row = ";".join([first, "Muster", "05.03.2015", *["x"] * len(labels)])
    mapping = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    mapping.update({str(i + 3): {"extra": label} for i, label in enumerate(labels)})
    return _import(c, f"{header}\n{row}\n", mapping)


def test_org_wide_extra_label_cap_rolls_back_whole_import(ctx):
    c = ctx
    assert _wide_import(c, "Anna", [f"A{i}" for i in range(10)]).status_code == 200
    assert _wide_import(c, "Ben", [f"B{i}" for i in range(10)]).status_code == 200  # 20 labels in the org
    r = _wide_import(c, "Cleo", ["C0"])
    assert r.status_code == 422
    assert r.json()["detail"] == {"code": "import_invalid", "errors": [{"row": 1, "field": "extra", "code": "too_many_org_extra_fields"}]}
    assert set(_list(c)) == {"Anna", "Ben"}  # Cleo rolled back
    # Known labels still import fine; other tenant has its own budget.
    assert _wide_import(c, "Cleo", ["A1", "B1"]).status_code == 200
    assert _import(c, "v;n;g\nX;Y;05.03.2015\n", {"0": "first_name", "1": "last_name", "2": "birth_date"},
                   headers=_as_other(c)).status_code == 403  # admin of other org on this slug
    other = _import(c, "v;n;g;t\nDora;D;05.03.2015;x\n", {"0": "first_name", "1": "last_name", "2": "birth_date", "3": {"extra": "Neu"}},
                    slug=c["other_slug"], headers=_as_other(c))
    assert other.status_code == 200


def test_patch_respects_org_wide_cap(ctx):
    c = ctx
    assert _wide_import(c, "Anna", [f"A{i}" for i in range(10)]).status_code == 200
    assert _wide_import(c, "Ben", [f"B{i}" for i in range(10)]).status_code == 200
    anna, ben = _list(c)["Anna"], _list(c)["Ben"]
    r = c["client"].patch(f"{_members(c)}/{anna['id']}", headers=c["headers"], json={"extra": {**anna["extra"], "Zu viel": "1"}})
    assert r.status_code == 422 and r.json()["detail"]["reason"] == "too_many_org_extra_fields"
    # Replacing Ben's B-labels with one new label keeps the org at 11 labels -> ok.
    r = c["client"].patch(f"{_members(c)}/{ben['id']}", headers=c["headers"], json={"extra": {"Neu": "1"}})
    assert r.status_code == 200 and r.json()["extra"] == {"Neu": "1"}
    assert "Zu viel" not in _list(c)["Anna"]["extra"]


def test_remove_extra_field_org_wide_and_isolated(ctx):
    c = ctx
    base = {"0": "first_name", "1": "last_name", "2": "birth_date"}
    csv_text = "v;n;g;t;p\nAnna;Muster;05.03.2015;U10;0123\nBen;B;05.03.2015;U11;0456\nCleo;C;05.03.2015;U12;\n"
    assert _import(c, csv_text, {**base, "3": {"extra": "Team"}, "4": {"extra": "Telefon"}}).status_code == 200
    _as_other(c)
    assert _import(c, csv_text, {**base, "4": {"extra": "Telefon"}}, slug=c["other_slug"], headers=_as_other(c)).status_code == 200
    url = _members(c) + "/extra-fields"
    # Admin of the other org cannot remove fields here.
    assert c["client"].delete(url, params={"label": "Telefon"}, headers=_as_other(c)).status_code == 403
    r = c["client"].delete(url, params={"label": " Telefon "}, headers=_as_admin(c))
    assert r.status_code == 200 and r.json() == {"members": 2}
    listed = _list(c)
    assert {k: v["extra"] for k, v in listed.items()} == {"Anna": {"Team": "U10"}, "Ben": {"Team": "U11"}, "Cleo": {"Team": "U12"}}
    assert c["client"].delete(url, params={"label": "Gibt es nicht"}, headers=c["headers"]).json() == {"members": 0}
    assert c["client"].delete(url, params={"label": "   "}, headers=c["headers"]).status_code == 422
    with c["cursor"]() as cur:
        cur.execute("select metadata from audit_log where organization_id=%s and action='memberships.extra_field_removed' "
                    "order by created_at", (c["org"],))
        metas = [r["metadata"] for r in cur.fetchall()]
    assert metas[0] == {"members": 2} and "Telefon" not in repr(metas)
    other = _list(c, slug=c["other_slug"], headers=_as_other(c))
    assert all(m["extra"].get("Telefon") for k, m in other.items() if k != "Cleo")
