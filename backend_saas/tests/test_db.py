from __future__ import annotations

import logging
import threading
import time
from contextlib import contextmanager
from unittest.mock import MagicMock

import pytest

from app import db
from app.db import DatabaseBusy, _dsn_with_sslmode, _warn_if_ipv6_only_supabase_host


def test_dsn_with_sslmode_adds_sslmode_for_non_local_host():
    dsn = _dsn_with_sslmode("postgresql://user:pass@aws-0-eu-central-1.pooler.supabase.com:6543/postgres")
    assert "sslmode=require" in dsn


def test_dsn_with_sslmode_leaves_local_host_untouched():
    dsn = _dsn_with_sslmode("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    assert "sslmode" not in dsn


def test_dsn_with_sslmode_preserves_existing_query_params():
    dsn = _dsn_with_sslmode("postgresql://user:pass@example.supabase.com:5432/postgres?connect_timeout=10")
    assert "connect_timeout=10" in dsn
    assert "sslmode=require" in dsn


def test_dsn_with_sslmode_does_not_override_explicit_sslmode():
    dsn = _dsn_with_sslmode("postgresql://user:pass@example.supabase.com:5432/postgres?sslmode=disable")
    assert "sslmode=disable" in dsn
    assert dsn.count("sslmode=") == 1


def test_warns_on_supabase_direct_connection_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host(
            "postgresql://postgres:pw@db.wkmckfbzhmihyfwiekct.supabase.co:5432/postgres"
        )
    assert any("IPv6-only" in record.message for record in caplog.records)


def test_no_warning_for_transaction_pooler_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host(
            "postgresql://postgres.wkmckfbzhmihyfwiekct:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"
        )
    assert caplog.records == []


def test_no_warning_for_local_host(caplog):
    with caplog.at_level(logging.WARNING):
        _warn_if_ipv6_only_supabase_host("postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    assert caplog.records == []


# ---------------------------------------------------------------------------
# Pool + Semaphore tests (PF1b)
# ---------------------------------------------------------------------------

def _make_fake_pool(max_concurrent: int) -> MagicMock:
    """Returns a mock ThreadedConnectionPool with cooperative fake connections.

    At most `max_concurrent` connections may be held simultaneously; trying to
    exceed that raises PoolError — exactly what the real pool would do.  The
    BoundedSemaphore in get_connection() must prevent that from ever happening.
    """
    active_lock = threading.Lock()
    active: list[MagicMock] = []

    def fake_getconn() -> MagicMock:
        with active_lock:
            if len(active) >= max_concurrent:
                import psycopg2.pool
                raise psycopg2.pool.PoolError("pool exhausted (fake)")
            conn = MagicMock()
            active.append(conn)
            return conn

    def fake_putconn(conn: MagicMock, close: bool = False) -> None:
        with active_lock:
            if conn in active:
                active.remove(conn)

    pool = MagicMock()
    pool.getconn.side_effect = fake_getconn
    pool.putconn.side_effect = fake_putconn
    return pool


def test_pool_serves_all_threads_without_pool_error(monkeypatch):
    """20 gleichzeitige Threads, Pool-Max=3 → kein PoolError, alle 20 bedient.

    Mutation probe: Removing _sem.release() from the finally block in
    get_connection() causes the semaphore to never free slots; after the first
    3 threads complete their work, the remaining 17 timeout with DatabaseBusy
    and this assertion fails.
    """
    fake_pool = _make_fake_pool(max_concurrent=3)
    sem = threading.BoundedSemaphore(3)
    monkeypatch.setattr(db, "_pool", fake_pool)
    monkeypatch.setattr(db, "_sem", sem)
    monkeypatch.setattr(db, "get_settings", lambda: MagicMock(db_pool_wait_seconds=10))

    errors: list[str] = []
    successes: list[int] = []

    def do_work() -> None:
        try:
            with db.get_connection():
                time.sleep(0.01)
                successes.append(1)
        except Exception as exc:
            errors.append(type(exc).__name__)

    threads = [threading.Thread(target=do_work) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=15)

    assert errors == [], f"Unexpected errors: {errors}"
    assert len(successes) == 20


def test_database_busy_when_pool_permanently_exhausted(monkeypatch):
    """Wartezeit 0,1 s bei dauerhaft belegtem Pool → DatabaseBusy."""
    fake_pool = _make_fake_pool(max_concurrent=3)
    sem = threading.BoundedSemaphore(3)
    for _ in range(3):
        sem.acquire()  # exhaust all slots permanently for this test

    monkeypatch.setattr(db, "_pool", fake_pool)
    monkeypatch.setattr(db, "_sem", sem)
    monkeypatch.setattr(db, "get_settings", lambda: MagicMock(db_pool_wait_seconds=0.1))

    with pytest.raises(DatabaseBusy):
        with db.get_connection():
            pass  # pragma: no cover


def test_503_with_retry_after_on_database_busy(monkeypatch):
    """DatabaseBusy → 503 JSON mit Retry-After: 2."""
    from app.auth_deps import AuthContext, get_auth_context
    from app.main import app
    from fastapi.testclient import TestClient

    @contextmanager
    def _busy(_: object = None):
        raise DatabaseBusy()
        yield  # pragma: no cover

    monkeypatch.setattr(db, "get_connection", _busy)
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id="owner-test", email="owner@example.com", is_owner=True, admin_organization_ids=set()
    )
    try:
        with TestClient(app) as client:
            response = client.get(
                "/admin/organizations", headers={"Authorization": "Bearer test"}
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.headers.get("retry-after") == "2"
    assert "ausgelastet" in response.json()["detail"]


def test_semaphore_released_after_exception(monkeypatch):
    """Semaphore wird im finally freigegeben — auch wenn getconn wirft."""
    sem = threading.BoundedSemaphore(1)
    fake_pool = MagicMock()
    fake_pool.getconn.side_effect = RuntimeError("simulated getconn failure")
    monkeypatch.setattr(db, "_pool", fake_pool)
    monkeypatch.setattr(db, "_sem", sem)
    monkeypatch.setattr(db, "get_settings", lambda: MagicMock(db_pool_wait_seconds=0.1))

    with pytest.raises(RuntimeError):
        with db.get_connection():
            pass  # pragma: no cover

    # After the exception the semaphore slot must be free again.
    assert sem.acquire(blocking=False), "Semaphore was not released after exception"
