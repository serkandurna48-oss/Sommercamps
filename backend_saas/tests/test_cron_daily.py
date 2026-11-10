"""Section L: POST /internal/cron/daily (CRON_SECRET) and the health-data retention job.

The auth tests need no database. The retention tests run against the disposable local
Postgres (REVIEW_POSTGRES_PORT) with synthetic data only.
"""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import retention
from app.main import app
from app.routers import internal
from .selfservice_helpers import make_camp, make_other_org, make_reg
from .test_review_postgres import local_database, real_db  # noqa: F401

SECRET = "s3cret-for-tests-only"
TODAY = date(2027, 3, 1)


def _settings(secret=SECRET, apply=False):
    return SimpleNamespace(cron_secret=secret, retention_apply=apply)


@pytest.fixture
def jobs(monkeypatch):
    """Replaces the three jobs so the HTTP layer can be tested without a database."""
    calls = []
    monkeypatch.setattr(internal, "get_settings", lambda: _settings())
    monkeypatch.setattr(
        internal.retention, "health_data_retention",
        lambda apply, today, organization_id=None: calls.append(("health", apply)) or {"rows": 4, "applied": apply},
    )
    monkeypatch.setattr(internal.retention, "general_review_rows", lambda today, organization_id=None: 7)
    return calls


def _post(headers=None):
    with TestClient(app) as client:
        return client.post("/internal/cron/daily", headers=headers or {})


# ---------- auth ----------

def test_cron_without_configured_secret_is_503(monkeypatch, jobs):
    monkeypatch.setattr(internal, "get_settings", lambda: _settings(secret=None))
    r = _post({"Authorization": f"Bearer {SECRET}"})
    assert r.status_code == 503
    assert jobs == []


def test_cron_blank_secret_counts_as_unset(monkeypatch, jobs):
    monkeypatch.setattr(internal, "get_settings", lambda: _settings(secret="   "))
    assert _post({"Authorization": "Bearer    "}).status_code == 503
    assert jobs == []


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer wrong", f"Basic {SECRET}", SECRET, f"bearer {SECRET}x"])
def test_cron_wrong_or_missing_secret_is_401(jobs, header):
    r = _post({"Authorization": header} if header is not None else {})
    assert r.status_code == 401
    assert jobs == []  # no job ran


def test_cron_correct_secret_returns_counts_only(jobs):
    r = _post({"Authorization": f"Bearer {SECRET}"})
    assert r.status_code == 200
    body = r.json()
    assert body == {
        "health_data_rows": 4, "health_data_applied": False, "general_review_rows": 7,
    }
    assert all(isinstance(v, (int, bool)) for v in body.values())


def test_cron_passes_retention_apply_flag(monkeypatch, jobs):
    monkeypatch.setattr(internal, "get_settings", lambda: _settings(apply=True))
    body = _post({"Authorization": f"Bearer {SECRET}"}).json()
    assert ("health", True) in jobs and body["health_data_applied"] is True


def test_cron_uses_constant_time_comparison(monkeypatch, jobs):
    seen = []
    real = internal.hmac.compare_digest
    monkeypatch.setattr(internal.hmac, "compare_digest", lambda a, b: seen.append(1) or real(a, b))
    _post({"Authorization": f"Bearer {SECRET}"})
    assert seen


def test_cron_failing_job_does_not_stop_the_others_and_returns_500(monkeypatch, jobs):
    def boom(apply, today, organization_id=None):
        raise RuntimeError("db down with secret details")

    monkeypatch.setattr(internal.retention, "health_data_retention", boom)
    r = _post({"Authorization": f"Bearer {SECRET}"})
    assert r.status_code == 500
    body = r.json()
    assert body["failed_jobs"] == ["health_data"]
    assert body["general_review_rows"] == 7  # the other jobs still ran
    assert "secret" not in r.text


def test_settings_defaults(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("CRON_SECRET", raising=False)
    monkeypatch.delenv("RETENTION_APPLY", raising=False)
    s = Settings(_env_file=None)
    assert s.cron_secret is None and s.retention_apply is False


# ---------- retention against Postgres ----------

def _camp(cur, org, end):
    return make_camp(cur, org, end)


def _reg(cur, org, camp, allergies="Nuesse", medical="Asthma"):
    return make_reg(cur, org, camp, allergies=allergies, medical=medical)


def _health(cur, token):
    cur.execute("select allergies, medical_notes, health_data_consent from camp_registrations where registration_token=%s", (token,))
    return cur.fetchone()


@pytest.fixture
def fresh(real_db):
    """real_db with no leftover registrations from earlier tests (the database is module-scoped)."""
    cursor, _, _ = real_db
    with cursor() as cur:
        cur.execute("delete from camp_registrations")
        cur.execute("delete from audit_log where action = 'retention.health_data'")
    return real_db


def _other_org(cur):
    return make_other_org(cur)[0]


@pytest.fixture
def audit_rows(fresh):
    cursor, tenant, _ = fresh

    def read():
        with cursor() as cur:
            cur.execute("select action, organization_id, target_id, actor_email, metadata from audit_log where action = 'retention.health_data' order by created_at")
            return cur.fetchall()
    return read


def test_retention_dry_run_changes_no_rows_but_counts(fresh, audit_rows):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        old = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=45)))
    result = retention.health_data_retention(apply=False, today=TODAY)
    assert result == {"rows": 1, "applied": False}
    with cursor() as cur:
        assert _health(cur, old) == {"allergies": "Nuesse", "medical_notes": "Asthma", "health_data_consent": True}
    (entry,) = audit_rows()
    assert entry["metadata"] == {"rows": 1, "mode": "dry_run"}


def test_retention_apply_nulls_only_health_columns(fresh, audit_rows):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        old = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=45)))
        only_allergy = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=60)), medical=None)
        already_clean = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=60)), allergies=None, medical=None)
    result = retention.health_data_retention(apply=True, today=TODAY)
    assert result == {"rows": 2, "applied": True}
    with cursor() as cur:
        assert _health(cur, old) == {"allergies": None, "medical_notes": None, "health_data_consent": True}
        assert _health(cur, only_allergy)["allergies"] is None
        assert _health(cur, already_clean)["health_data_consent"] is True
        cur.execute("select parent_email, child_first_name from camp_registrations where registration_token=%s", (old,))
        assert cur.fetchone() == {"parent_email": "p@example.com", "child_first_name": "Kim"}  # nothing else touched
    # idempotent: second run finds nothing
    assert retention.health_data_retention(apply=True, today=TODAY) == {"rows": 0, "applied": True}
    entries = audit_rows()
    assert entries[0]["metadata"] == {"rows": 2, "mode": "apply"}
    assert all(e["target_id"] is None and e["actor_email"] is None for e in entries)


def test_retention_never_touches_recent_camps(fresh):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        recent = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=29)))
        today_end = _reg(cur, org, _camp(cur, org, TODAY))
        future = _reg(cur, org, _camp(cur, org, TODAY + timedelta(days=10)))
        boundary = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=30)))
    assert retention.health_data_retention(apply=True, today=TODAY)["rows"] == 1
    with cursor() as cur:
        for token in (recent, today_end, future):
            assert _health(cur, token)["allergies"] == "Nuesse"
        assert _health(cur, boundary)["allergies"] is None  # exactly 30 days: due


def test_retention_scoped_run_never_touches_other_organizations(fresh):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        other = _other_org(cur)
        mine = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=90)))
        theirs = _reg(cur, other, _camp(cur, other, TODAY - timedelta(days=90)))
    assert retention.health_data_retention(apply=True, today=TODAY, organization_id=org)["rows"] == 1
    with cursor() as cur:
        assert _health(cur, mine)["allergies"] is None
        assert _health(cur, theirs)["allergies"] == "Nuesse"
    # unscoped (daily job) covers every organization
    assert retention.health_data_retention(apply=True, today=TODAY)["rows"] == 1
    with cursor() as cur:
        assert _health(cur, theirs)["allergies"] is None


def test_general_review_rows_only_counts(fresh):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        old = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=400)))
        recent = _reg(cur, org, _camp(cur, org, TODAY - timedelta(days=100)))
    assert retention.general_review_rows(TODAY) == 1
    with cursor() as cur:
        cur.execute("select count(*) as n from camp_registrations where registration_token in (%s,%s)", (old, recent))
        assert cur.fetchone()["n"] == 2  # nothing deleted


def test_daily_endpoint_end_to_end_apply_flag_off_changes_nothing(fresh, monkeypatch):
    cursor, tenant, _ = fresh
    org = tenant.organization_id
    with cursor() as cur:
        old = _reg(cur, org, _camp(cur, org, date.today() - timedelta(days=90)))
    monkeypatch.setattr(internal, "get_settings", lambda: _settings(apply=False))
    r = _post({"Authorization": f"Bearer {SECRET}"})
    assert r.status_code == 200 and r.json()["health_data_rows"] == 1 and r.json()["health_data_applied"] is False
    with cursor() as cur:
        assert _health(cur, old)["allergies"] == "Nuesse"
    monkeypatch.setattr(internal, "get_settings", lambda: _settings(apply=True))
    r = _post({"Authorization": f"Bearer {SECRET}"})
    assert r.json()["health_data_applied"] is True
    with cursor() as cur:
        assert _health(cur, old)["allergies"] is None
