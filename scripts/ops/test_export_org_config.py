"""Tests for export_org_config.py against throwaway local databases.

Needs a disposable local Postgres (default 127.0.0.1:55443, override EXPORT_TEST_PG_PORT).
Creates two scratch databases (source/target), applies all migrations, seeds synthetic
data, exports, applies the SQL twice to the target and drops both databases again.

  backend_saas/.venv/bin/python -m pytest scripts/ops/test_export_org_config.py -q
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import psycopg2
import pytest
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import export_org_config as exporter  # noqa: E402

PORT = int(os.environ.get("EXPORT_TEST_PG_PORT", "55443"))
BASE = dict(host="127.0.0.1", port=PORT, user="postgres", connect_timeout=3)
SRC, TGT = "ops_export_test_src", "ops_export_test_tgt"

BOOTSTRAP = """
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
"""

SEED = """
UPDATE organizations SET intro_heading = 'Training mit Plan', iban = 'DE89370400440532013000',
  registration_questions = '[{"id": "verein", "label": "Verein?", "type": "text"}]'::jsonb,
  logo_url = 'https://asowsktznpiioaxerlta.supabase.co/storage/v1/object/public/logo.png'
WHERE slug = 'jk-academy-demo';
INSERT INTO organization_billing_profiles (organization_id, legal_name, street, postal_code, city, tax_status,
  tax_number, invoice_number_prefix, invoice_email)
SELECT id, 'JK Demo GmbH', 'Teststraße 1', '34225', 'Baunatal', 'kleinunternehmer', '012/345/67890', 'JK',
  'rechnung@example.com' FROM organizations WHERE slug = 'jk-academy-demo';
INSERT INTO training_offers (organization_id, slug, title, kind, duration_minutes, price_member_cents,
  price_nonmember_cents, status, category)
SELECT id, 'einzel-60', 'Einzeltraining 60', 'einzel', 60, 4000, 5000, 'published', 'fussball'
FROM organizations WHERE slug = 'jk-academy-demo';
INSERT INTO camps (organization_id, offer_id, slug, title, start_date, end_date, age_min, age_max, capacity,
  price_cents, price_member_cents, status, starts_at, ends_at)
SELECT o.organization_id, o.id, 'einzel-60-2027-01-10', 'Einzeltraining 60', date '2027-01-10', date '2027-01-10',
  6, 18, 1, 5000, 4000, 'published', timestamptz '2027-01-10 10:00+01', timestamptz '2027-01-10 11:00+01'
FROM training_offers o WHERE o.slug = 'einzel-60';
INSERT INTO camp_registrations (organization_id, camp_id, parent_first_name, parent_last_name, parent_email,
  parent_phone, child_first_name, child_last_name, child_birth_date, terms_accepted, privacy_accepted)
SELECT organization_id, id, 'Petra', 'Geheim', 'eltern@example.com', '0123', 'Kalle', 'Kindername',
  date '2015-05-05', true, true FROM camps WHERE slug = 'demo-camp';
INSERT INTO organization_memberships (organization_id, first_name, last_name, birth_date, source, match_key)
SELECT id, 'Mitglied', 'Vertraulich', date '2014-04-04', 'manual', 'mitglied|vertraulich'
FROM organizations WHERE slug = 'jk-academy-demo';
"""


def _admin():
    conn = psycopg2.connect(dbname="postgres", **BASE)
    conn.autocommit = True
    return conn


def _dsn(db):
    return f"host=127.0.0.1 port={PORT} user=postgres dbname={db}"


def _fresh(admin, name, seed: bool):
    with admin.cursor() as cur:
        cur.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))
        cur.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
    conn = psycopg2.connect(dbname=name, **BASE)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(BOOTSTRAP)
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            cur.execute(path.read_text(encoding="utf-8-sig"))
        if seed:
            cur.execute((ROOT / "scripts/dev/demo.sql").read_text(encoding="utf-8"))
            cur.execute(SEED)
    conn.close()


@pytest.fixture(scope="module")
def dbs():
    try:
        admin = _admin()
    except psycopg2.OperationalError as exc:
        pytest.fail(f"local test Postgres on 127.0.0.1:{PORT} not reachable: {exc}")
    _fresh(admin, SRC, seed=True)
    _fresh(admin, TGT, seed=False)
    yield
    with admin.cursor() as cur:
        for name in (SRC, TGT):
            cur.execute(sql.SQL("drop database if exists {} with (force)").format(sql.Identifier(name)))
    admin.close()


def _run(*args):
    return subprocess.run([sys.executable, str(Path(exporter.__file__)), *args],
                          capture_output=True, text=True, timeout=60)


def _psql_apply(text):
    conn = psycopg2.connect(dbname=TGT, **BASE)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(text)
        rows = cur.fetchall()
    conn.close()
    return rows


def _target(query):
    conn = psycopg2.connect(dbname=TGT, **BASE)
    with conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()
    conn.close()
    return rows


def test_refuses_the_production_project():
    result = _run("--source-dsn", "postgresql://postgres@db.wkmckfbzhmihyfwiekct.supabase.co:5432/postgres",
                  "--org", "x", "--sql-out", "-")
    assert result.returncode == 2
    assert "Produktionsdatenbank" in result.stderr
    assert result.stdout == ""


def test_dry_run_prints_a_summary_and_no_sql(dbs):
    result = _run("--source-dsn", _dsn(SRC), "--org", "jk-academy-demo")
    assert result.returncode == 0, result.stderr
    assert "Dry Run" in result.stdout
    assert "Trainingsangebote: 1 (einzel-60)" in result.stdout
    assert "camp_registrations=1" in result.stdout
    assert "insert into" not in result.stdout.lower()


def test_source_connection_is_read_only(dbs):
    conn = exporter.connect_read_only(_dsn(SRC))
    with conn.cursor() as cur, pytest.raises(psycopg2.errors.ReadOnlySqlTransaction):
        cur.execute("update organizations set name = 'x'")
    conn.close()


def test_export_applies_twice_and_carries_no_personal_data(dbs, tmp_path):
    out = tmp_path / "jk.sql"
    result = _run("--source-dsn", _dsn(SRC), "--org", "jk-academy-demo", "--target-slug", "jk-prod",
                  "--sql-out", str(out))
    assert result.returncode == 0, result.stderr
    text = out.read_text(encoding="utf-8")
    for secret in ("Kalle", "Kindername", "Petra", "Geheim", "Vertraulich", "2015-05-05"):
        assert secret not in text
    assert "WARNUNG: organizations.logo_url verweist auf Staging" in text

    first = _psql_apply(text)
    second = _psql_apply(text)  # idempotent: second run inserts nothing new
    assert first == second == [("jk-prod", False, False, ["camps", "trainings", "members", "players"], 1, 1, 1, 1)]

    assert _target("select count(*) from camp_registrations") == [(0,)]
    assert _target("select count(*) from organization_memberships") == [(0,)]
    assert _target("select count(*) from players") == [(0,)]
    session = _target(
        "select c.price_member_cents, c.starts_at is not null, t.slug from camps c"
        " join training_offers t on t.id = c.offer_id and t.organization_id = c.organization_id")
    assert session == [(4000, True, "einzel-60")]
    assert _target("select registration_questions->0->>'id', iban, intro_heading from organizations"
                   " where slug = 'jk-prod'") == [("verein", "DE89370400440532013000", "Training mit Plan")]
    assert _target("select legal_name, invoice_number_prefix from organization_billing_profiles") == [
        ("JK Demo GmbH", "JK")]


def test_default_mode_never_overwrites_target_changes(dbs, tmp_path):
    out = tmp_path / "jk.sql"
    assert _run("--source-dsn", _dsn(SRC), "--org", "jk-academy-demo", "--target-slug", "jk-prod",
                "--sql-out", str(out)).returncode == 0
    conn = psycopg2.connect(dbname=TGT, **BASE)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("update camps set price_cents = 7777 where slug = 'demo-camp'")
    conn.close()
    _psql_apply(out.read_text(encoding="utf-8"))
    assert _target("select price_cents from camps where slug = 'demo-camp'") == [(7777,)]

    assert _run("--source-dsn", _dsn(SRC), "--org", "jk-academy-demo", "--target-slug", "jk-prod",
                "--on-conflict", "update", "--sql-out", str(out)).returncode == 0
    _psql_apply(out.read_text(encoding="utf-8"))
    assert _target("select price_cents from camps where slug = 'demo-camp'") == [(14900,)]


def test_unknown_org_fails_cleanly(dbs):
    result = _run("--source-dsn", _dsn(SRC), "--org", "gibt-es-nicht")
    assert result.returncode == 2
    assert "gibt es in der Quelle nicht" in result.stderr
