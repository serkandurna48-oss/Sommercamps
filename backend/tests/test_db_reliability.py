from __future__ import annotations

import importlib
import json
import sys
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.pool
import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def main_module(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example.test:6543/postgres")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-test-password")
    monkeypatch.setenv("JWT_SECRET", "test-secret")
    monkeypatch.setenv("STRIPE_PRICE_CENTS", "14900")
    sys.modules.pop("main", None)
    module = importlib.import_module("main")
    module._pool = None
    return module


class FakeCursor:
    def __init__(self, conn: "FakeConnection", execute_error: BaseException | None = None):
        self.conn = conn
        self.execute_error = execute_error
        self.executed: list[tuple[str, Any]] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        return None

    def execute(self, sql: str, params: Any = None) -> None:
        self.executed.append((sql, params))
        self.conn.execute_count += 1
        if self.execute_error:
            raise self.execute_error

    def fetchone(self) -> dict[str, Any] | None:
        return self.conn.fetchone_result

    def fetchall(self) -> list[dict[str, Any]]:
        return self.conn.fetchall_result


class FakeConnection:
    def __init__(
        self,
        *,
        closed: bool = False,
        cursor_error: BaseException | None = None,
        execute_error: BaseException | None = None,
        commit_error: BaseException | None = None,
        rollback_error: BaseException | None = None,
        fetchone_result: dict[str, Any] | None = None,
    ):
        self.closed = int(closed)
        self.cursor_error = cursor_error
        self.execute_error = execute_error
        self.commit_error = commit_error
        self.rollback_error = rollback_error
        self.fetchone_result = fetchone_result
        self.fetchall_result: list[dict[str, Any]] = []
        self.commit_count = 0
        self.rollback_count = 0
        self.execute_count = 0

    def cursor(self) -> FakeCursor:
        if self.cursor_error:
            raise self.cursor_error
        return FakeCursor(self, self.execute_error)

    def commit(self) -> None:
        self.commit_count += 1
        if self.commit_error:
            raise self.commit_error

    def rollback(self) -> None:
        self.rollback_count += 1
        if self.rollback_error:
            raise self.rollback_error


class FakePool:
    def __init__(self, *connections: FakeConnection):
        self.connections = list(connections)
        self.puts: list[tuple[FakeConnection, bool]] = []
        self.get_count = 0
        self.closed_all = False

    def getconn(self) -> FakeConnection:
        self.get_count += 1
        if not self.connections:
            raise psycopg2.pool.PoolError("connection pool exhausted")
        return self.connections.pop(0)

    def putconn(self, conn: FakeConnection, close: bool = False) -> None:
        self.puts.append((conn, close))

    def closeall(self) -> None:
        self.closed_all = True


def test_database_url_without_query_gets_safe_defaults(main_module):
    dsn = main_module._build_database_dsn("postgresql://u:p@h:6543/postgres")

    assert "?sslmode=require" in dsn
    assert "connect_timeout=5" in dsn
    assert "keepalives=1" in dsn


def test_database_url_with_existing_query_uses_ampersand(main_module):
    dsn = main_module._build_database_dsn("postgresql://u:p@h:6543/postgres?application_name=camp")

    assert dsn.count("?") == 1
    assert "application_name=camp" in dsn
    assert "&sslmode=require" in dsn


def test_existing_sslmode_is_not_duplicated(main_module):
    dsn = main_module._build_database_dsn("postgresql://u:p@h/db?sslmode=verify-full")

    assert dsn.count("sslmode=") == 1
    assert "sslmode=verify-full" in dsn


def test_successful_checkout_returns_connection_normally(main_module):
    conn = FakeConnection()
    pool = FakePool(conn)
    main_module._pool = pool

    with main_module.db_cursor() as cur:
        cur.execute("SELECT 1")

    assert conn.commit_count == 1
    assert conn.rollback_count == 0
    assert pool.puts == [(conn, False)]


def test_closed_connection_at_checkout_is_discarded_and_retried_once(main_module):
    closed = FakeConnection(closed=True)
    healthy = FakeConnection()
    pool = FakePool(closed, healthy)
    main_module._pool = pool

    with main_module.db_cursor() as cur:
        cur.execute("SELECT 1")

    assert pool.get_count == 2
    assert pool.puts[0] == (closed, True)
    assert pool.puts[-1] == (healthy, False)


def test_checkout_does_not_retry_forever(main_module):
    pool = FakePool(FakeConnection(closed=True), FakeConnection(closed=True))
    main_module._pool = pool

    with pytest.raises(psycopg2.InterfaceError):
        with main_module.db_cursor():
            pass

    assert pool.get_count == 2
    assert [closed for _, closed in pool.puts] == [True, True]


def test_cursor_interface_error_discards_connection(main_module):
    conn = FakeConnection(cursor_error=psycopg2.InterfaceError("cursor failed"))
    pool = FakePool(conn)
    main_module._pool = pool

    with pytest.raises(psycopg2.InterfaceError):
        with main_module.db_cursor():
            pass

    assert conn.rollback_count == 1
    assert pool.puts == [(conn, True)]


def test_execute_operational_error_discards_connection(main_module):
    conn = FakeConnection(execute_error=psycopg2.OperationalError("socket closed"))
    pool = FakePool(conn)
    main_module._pool = pool

    with pytest.raises(psycopg2.OperationalError):
        with main_module.db_cursor() as cur:
            cur.execute("SELECT 1")

    assert conn.rollback_count == 1
    assert pool.puts == [(conn, True)]


def test_commit_operational_error_discards_connection(main_module):
    conn = FakeConnection(commit_error=psycopg2.OperationalError("commit status unknown"))
    pool = FakePool(conn)
    main_module._pool = pool

    with pytest.raises(psycopg2.OperationalError):
        with main_module.db_cursor() as cur:
            cur.execute("UPDATE camp_registrations SET payment_status='paid'")

    assert conn.commit_count == 1
    assert conn.rollback_count == 1
    assert pool.puts == [(conn, True)]


def test_rollback_failure_discards_connection(main_module):
    original = ValueError("application error")
    conn = FakeConnection(rollback_error=psycopg2.InterfaceError("rollback failed"))
    pool = FakePool(conn)
    main_module._pool = pool

    with pytest.raises(ValueError):
        with main_module.db_cursor():
            raise original

    assert conn.rollback_count == 1
    assert pool.puts == [(conn, True)]


def test_healthy_connection_is_reusable(main_module):
    conn = FakeConnection()
    pool = FakePool(conn)
    main_module._pool = pool

    with main_module.get_db_connection() as checked_out:
        assert checked_out is conn

    assert pool.puts == [(conn, False)]


def test_pool_exhaustion_surfaces_controlled_pool_error(main_module):
    pool = FakePool()
    main_module._pool = pool

    with pytest.raises(psycopg2.pool.PoolError):
        with main_module.db_cursor():
            pass


def test_parallel_checkouts_do_not_double_return(main_module):
    conn1 = FakeConnection()
    conn2 = FakeConnection()
    pool = FakePool(conn1, conn2)
    main_module._pool = pool

    with main_module.get_db_connection() as first:
        with main_module.get_db_connection() as second:
            assert first is conn1
            assert second is conn2

    returned = [conn for conn, _ in pool.puts]
    assert returned.count(conn1) == 1
    assert returned.count(conn2) == 1


def test_health_success_returns_200_shape(main_module, monkeypatch: pytest.MonkeyPatch):
    @contextmanager
    def healthy_cursor():
        yield FakeCursor(FakeConnection())

    monkeypatch.setattr(main_module, "db_cursor", healthy_cursor)

    assert main_module.health() == {"status": "ok", "database": "reachable"}


def test_health_db_failure_returns_503_without_internal_detail(main_module, monkeypatch: pytest.MonkeyPatch):
    @contextmanager
    def broken_cursor():
        raise psycopg2.OperationalError("sensitive host detail")
        yield

    monkeypatch.setattr(main_module, "db_cursor", broken_cursor)

    response = main_module.health()
    body = json.loads(response.body.decode("utf-8"))

    assert response.status_code == 503
    assert body == {"status": "error", "database": "unavailable"}
    assert "sensitive" not in response.body.decode("utf-8")


def test_health_discards_broken_connection(main_module):
    conn = FakeConnection(execute_error=psycopg2.OperationalError("server closed connection"))
    pool = FakePool(conn)
    main_module._pool = pool

    response = main_module.health()

    assert response.status_code == 503
    assert pool.puts == [(conn, True)]


def test_missing_required_env_has_safe_startup_diagnosis(main_module, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(RuntimeError) as excinfo:
        main_module._require_env("DATABASE_URL")

    assert str(excinfo.value) == "Pflicht-Environment-Variable fehlt: DATABASE_URL"


def test_pool_reset_is_thread_safe(main_module, monkeypatch: pytest.MonkeyPatch):
    old_pool = FakePool(FakeConnection())
    new_pool = FakePool(FakeConnection())
    created: list[FakePool] = []
    main_module._pool = old_pool

    def fake_pool_factory(**kwargs: Any) -> FakePool:
        created.append(new_pool)
        return new_pool

    monkeypatch.setattr(main_module.psycopg2.pool, "ThreadedConnectionPool", fake_pool_factory)

    main_module.reset_db_pool("test")

    assert old_pool.closed_all is True
    assert main_module._pool is new_pool
    assert created == [new_pool]


def test_second_request_after_broken_connection_gets_fresh_connection(main_module):
    broken = FakeConnection(execute_error=psycopg2.OperationalError("network reset"))
    fresh = FakeConnection()
    pool = FakePool(broken, fresh)
    main_module._pool = pool

    with pytest.raises(psycopg2.OperationalError):
        with main_module.db_cursor() as cur:
            cur.execute("SELECT 1")

    with main_module.db_cursor() as cur:
        cur.execute("SELECT 1")

    assert pool.puts == [(broken, True), (fresh, False)]


def test_mutating_operation_is_not_blindly_retried_after_unclear_commit(main_module):
    conn = FakeConnection(commit_error=psycopg2.OperationalError("lost commit response"))
    pool = FakePool(conn, FakeConnection())
    main_module._pool = pool

    with pytest.raises(psycopg2.OperationalError):
        with main_module.db_cursor() as cur:
            cur.execute("INSERT INTO camp_registrations DEFAULT VALUES")

    assert conn.execute_count == 1
    assert pool.get_count == 1
    assert pool.puts == [(conn, True)]


def test_confirmation_email_idempotency_skips_send_when_already_marked(
    main_module,
    monkeypatch: pytest.MonkeyPatch,
):
    called = False

    def fake_post(*args: Any, **kwargs: Any) -> None:
        nonlocal called
        called = True

    monkeypatch.setattr(main_module.http_client, "post", fake_post)
    main_module._try_send_confirmation_email({"id": "safe-id", "email_sent_at": "2026-07-21T00:00:00Z"})

    assert called is False
