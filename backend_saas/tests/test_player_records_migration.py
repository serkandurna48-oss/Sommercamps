"""Upgrade probe: player_records migration on a populated database, plus proof that the
SQL name normalisation equals normalize_match_key. Synthetic data only."""

from datetime import date
from uuid import uuid4

import psycopg2
import pytest
from psycopg2.extras import RealDictCursor

from app.repositories.memberships import _normalize_part, normalize_match_key
from .test_schema_upgrade_populated import (  # noqa: F401
    _MIGRATIONS, _REG_STABLE_COLS, _bootstrap, _disposable_db, _insert_data,
    _reg_snapshot, pg_config,
)
from .test_review_postgres import local_database, real_db  # noqa: F401

_MIGRATION = _MIGRATIONS / "20261106100000_player_records.sql"
_BASELINE = sorted(p for p in _MIGRATIONS.glob("*.sql") if p.name < _MIGRATION.name)

_VARIANTS = [
    "Müller", "MÜLLER", "müller", "Mueller", "MUELLER", "Müller", "  Müller  ", "Weiß", "WEISS",
    "weiss", "Straße", "Äpfel", "Über", "Öl", "Jörg", "Anna-Lena", "Anna‐Lena", "Anna‑Lena",
    "Anna‒Lena", "Anna–Lena", "Anna—Lena", "Anna−Lena", "Anna   Lena", "Anna -  Lena",
    "\tAnna\nLena\r", "Anna Lena", "Anna Lena", "　Anna　", "-Anna-", " - ", "Meier-  Schmidt",
    "Ñandú", "ÉMILE", "Émile", "Çelik", "Åsa", "Łukasz", "O'Brien", "van der Berg", "Zoë", "Ægir", "Søren",
    "Dvořák", "Šimon", "Ünal-Öztürk", "Nguyễn", " x᠎", "a\x1cb\x85c",
]


def _sql_parts(cur, values):
    cur.execute("select v, public.normalize_match_part(v) as k from unnest(%s::text[]) as v", (values,))
    return {r["v"]: r["k"] for r in cur.fetchall()}


def test_sql_normalisation_equals_python_for_variants(real_db):
    cursor, _, _ = real_db
    with cursor() as cur:
        got = _sql_parts(cur, _VARIANTS)
    for v in _VARIANTS:
        assert got[v] == _normalize_part(v), repr(v)


def test_sql_normalisation_equals_python_across_whitespace_hyphen_and_latin_ranges(real_db):
    cursor, _, _ = real_db
    # every code point of the ranges German-speaking club data realistically contains, embedded in
    # a word so trim and collapse rules are both exercised
    # documented exceptions (casefold expands them, see migration comment): U+0130, U+0149, U+01F0, U+1E96-1E9B
    known = {0x130, 0x149, 0x1F0, *range(0x1E96, 0x1E9C)}
    points = [c for c in list(range(0x00, 0x250)) + list(range(0x1E00, 0x1F00)) + list(range(0x2000, 0x2070))
              + [0x3000, 0x1680, 0x180E, 0x2212, 0xFE63, 0xFF0D, 0x3C2] if c not in known]
    values = [f"x{chr(c)}y" for c in points if not 0xD800 <= c < 0xE000 and c != 0] + \
             [f"{chr(c)}ab{chr(c)}" for c in points if c != 0]
    with cursor() as cur:
        got = _sql_parts(cur, values)
    bad = [(hex(ord(v[1] if v[0] == "x" else v[0])), got[v], _normalize_part(v)) for v in values
           if got[v] != _normalize_part(v)]
    assert not bad, bad[:10]


def test_sql_full_key_equals_normalize_match_key(real_db):
    cursor, _, _ = real_db
    pairs = [("Jörg", "Größe"), ("Anna Maria", "Lee"), ("Anna", "Maria Lee"), ("Anna-Lena", "Meier-  Schmidt")]
    with cursor() as cur:
        for first, last in pairs:
            cur.execute("select public.normalize_match_part(%s) || '|' || public.normalize_match_part(%s) k",
                        (first, last))
            assert cur.fetchone()["k"] == normalize_match_key(first, last)


def _extra_regs(conn):
    """Name variants for org A's first camp plus the same child in org B."""
    with conn.cursor() as cur:
        cur.execute("select id, organization_id from camps order by id")
        camps = cur.fetchall()
        org_a, camp_a = camps[0][1], camps[0][0]
        other = [c for c in camps if c[1] != org_a][0]
        rows = [
            (org_a, camp_a, "Jörg", "Größe", "2016-01-01", "registered"),
            (org_a, camp_a, "JOERG", "GROESSE", "2016-01-01", "registered"),
            (org_a, camp_a, " joerg ", "Grösse", "2016-01-01", "cancelled"),
            (org_a, camp_a, "Joerg", "Groesse", "2016-01-02", "registered"),     # other birth date
            (org_a, camp_a, "Anna-Lena", "Lee", "2016-01-01", "registered"),
            (org_a, camp_a, "Anna Lena", "Lee", "2016-01-01", "waitlist"),
            (other[1], other[0], "Jörg", "Größe", "2016-01-01", "registered"),   # other org
        ]
        for i, (org, camp, first, last, birth, status) in enumerate(rows):
            cur.execute(
                "insert into camp_registrations(organization_id,camp_id,parent_first_name,parent_last_name,"
                "parent_email,parent_phone,child_first_name,child_last_name,child_birth_date,terms_accepted,"
                "privacy_accepted,status,created_at) values (%s,%s,'P','Q',%s,'0049123',%s,%s,%s,true,true,%s,"
                "'2026-01-01 10:00:00+00'::timestamptz + %s * interval '1 minute')",
                (org, camp, f"x{i}@campspilot.example", first, last, birth, status, i),
            )


def test_player_records_migration_backfills_populated_db_and_is_idempotent(pg_config):
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE)
            _insert_data(conn)
            _extra_regs(conn)
        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                before = _reg_snapshot(cur)
        assert before[0] == 13

        sql_text = _MIGRATION.read_text(encoding="utf-8")
        for _ in range(2):  # second run proves idempotency
            with psycopg2.connect(**db_kw) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql_text)

        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # registrations untouched, including updated_at (backfill must not bump it)
                assert _reg_snapshot(cur) == before
                cur.execute("select count(*) n from camp_registrations where player_id is null")
                assert cur.fetchone()["n"] == 0
                cur.execute("select count(*) n from camp_registrations where documentation_consent is not null")
                assert cur.fetchone()["n"] == 0
                cur.execute("select organization_id, first_name, last_name, birth_date, match_key from players")
                rows = cur.fetchall()
                # 6 probe children (distinct first names) + Jörg(2016-01-01) + Jörg(2016-01-02)
                # + Anna Lena + Jörg in other org
                assert len(rows) == 10
                for r in rows:
                    assert r["match_key"] == normalize_match_key(r["first_name"], r["last_name"])
                joerg = [r for r in rows if r["match_key"] == "joerg|groesse"]
                assert len(joerg) == 3  # org A 01-01, org A 01-02, org B 01-01
                # representative spelling = earliest registration
                first_a = [r for r in joerg if r["birth_date"] == date(2016, 1, 1)]
                assert {r["first_name"] for r in first_a} == {"Jörg"}
                # all variants of one child share one player_id
                cur.execute(
                    "select count(distinct player_id) n from camp_registrations "
                    "where child_birth_date='2016-01-01' and organization_id=(select organization_id from camps order by id limit 1) "
                    "and child_first_name in ('Jörg','JOERG',' joerg ')")
                assert cur.fetchone()["n"] == 1
                cur.execute("select count(*) n from players")
                assert cur.fetchone()["n"] == 10
                # registrations point at players of their own organization
                cur.execute("select count(*) n from camp_registrations r join players p on p.id=r.player_id"
                            " where p.organization_id <> r.organization_id")
                assert cur.fetchone()["n"] == 0


def test_player_records_migration_applies_to_empty_schema_twice_and_revokes(pg_config):
    with _disposable_db(pg_config) as db_kw:
        with psycopg2.connect(**db_kw) as conn:
            _bootstrap(conn, _BASELINE + [_MIGRATION])  # bootstrap ends with GRANT ... ON ALL TABLES
        sql_text = _MIGRATION.read_text(encoding="utf-8")
        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                cur.execute(sql_text)  # second application must re-revoke and not fail
        with psycopg2.connect(**db_kw) as conn:
            with conn.cursor() as cur:
                for fn in ("public.link_unlinked_registrations()", "public.normalize_match_part(text)"):
                    for role in ("anon", "authenticated"):
                        cur.execute("select has_function_privilege(%s,%s,'EXECUTE')", (role, fn))
                        assert cur.fetchone()[0] is False, (fn, role)
                for t in ("players", "player_notes", "player_goals", "player_measurements"):
                    for role in ("anon", "authenticated"):
                        for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                            cur.execute("select has_table_privilege(%s,%s,%s)", (role, f"public.{t}", priv))
                            assert cur.fetchone()[0] is False, (t, role, priv)
