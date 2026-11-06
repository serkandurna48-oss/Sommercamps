"""Connection pool behaviour against a disposable LOCAL PostgreSQL (opt-in via
REVIEW_POSTGRES_PORT, like test_review_postgres). Only the `postgres`
maintenance database is used, read-only (select 1 / pg_backend_pid); the
terminate test kills only a backend this test opened itself."""

from __future__ import annotations

import os
import threading
from concurrent.futures import ThreadPoolExecutor

import psycopg2
import psycopg2.extras
import pytest
from fastapi import HTTPException

from app import db


@pytest.fixture
def pool(monkeypatch):
    port = os.environ.get("REVIEW_POSTGRES_PORT")
    if not port:
        pytest.skip("Set REVIEW_POSTGRES_PORT to opt into disposable local DB tests")
    dsn = f"host=127.0.0.1 port={int(port)} user=postgres dbname=postgres connect_timeout=5 application_name=cp_pool_test"
    connects = []
    real_connect = psycopg2.connect

    def counting_connect(*args, **kwargs):
        connects.append(1)
        return real_connect(*args, **kwargs)

    monkeypatch.setattr(psycopg2, "connect", counting_connect)
    p = db.RetainingConnectionPool(1, 5, dsn=dsn, cursor_factory=psycopg2.extras.RealDictCursor, ping_after=30)
    monkeypatch.setattr(db, "_pool", p)
    monkeypatch.setattr(db, "_sem", threading.BoundedSemaphore(5))
    p.connects = connects
    yield p
    p.closeall()


def _pid() -> int:
    with db.get_read_cursor() as cur:
        cur.execute("select pg_backend_pid() as pid")
        return cur.fetchone()["pid"]


def _parallel_pids(n: int) -> set[int]:
    barrier = threading.Barrier(n)

    def work(_):
        with db.get_connection() as conn:
            barrier.wait(timeout=5)  # all n connections are borrowed at the same time
            with conn.cursor() as cur:
                cur.execute("select pg_backend_pid() as pid")
                pid = cur.fetchone()["pid"]
            conn.rollback()
            return pid

    with ThreadPoolExecutor(n) as ex:
        return set(ex.map(work, range(n)))


def test_pool_keeps_connections_up_to_max_and_reuses_them(pool):
    first = _parallel_pids(5)
    assert len(first) == 5
    opened = len(pool.connects)
    assert opened == 5  # 1 at startup + 4 on demand
    second = _parallel_pids(5)
    assert second == first  # stock psycopg2 would have closed 4 of them (len(idle) < minconn)
    assert len(pool.connects) == opened  # no new connection for the second burst
    assert len(pool._pool) == 5 and not pool._used


def test_business_exception_keeps_a_healthy_connection(pool):
    pid = _pid()
    with pytest.raises(HTTPException):
        with db.get_cursor() as cur:
            cur.execute("select 1")
            raise HTTPException(status_code=404)
    assert _pid() == pid
    assert len(pool.connects) == 1 and not pool._used


def test_read_cursor_sends_no_transaction_and_restores_autocommit(pool):
    with db.get_read_cursor() as cur:
        cur.execute("select 1 as one")
        assert cur.fetchone()["one"] == 1
        conn = cur.connection
        assert conn.autocommit is True
        # no BEGIN was sent: the connection is not inside a transaction block
        assert conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_IDLE
    assert conn.autocommit is False
    with db.get_cursor() as cur:
        assert cur.connection is conn
        cur.execute("select 1")
        assert conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_INTRANS


def test_connection_killed_while_idle_is_replaced_before_use(pool):
    victim = _pid()
    pool._ping_after = 0  # ping every borrowed idle connection
    killer = psycopg2.connect(host="127.0.0.1", port=int(os.environ["REVIEW_POSTGRES_PORT"]),
                              user="postgres", dbname="postgres")
    killer.autocommit = True
    with killer.cursor() as cur:
        cur.execute("select pg_terminate_backend(%s)", (victim,))
    killer.close()
    replacement = _pid()  # would raise OperationalError without the health check
    assert replacement != victim
    assert not pool._used


def test_broken_connection_during_request_is_closed_not_returned(pool):
    with pytest.raises(psycopg2.OperationalError):
        with db.get_connection() as conn:
            conn.close()  # simulate a dropped link mid-request
            raise psycopg2.OperationalError("link lost")
    assert not pool._used and all(not c.closed for c in pool._pool)
    assert isinstance(_pid(), int)


def test_read_cursor_without_pool_delegates_to_get_cursor(monkeypatch):
    from contextlib import contextmanager

    monkeypatch.setattr(db, "_pool", None)
    used = []

    @contextmanager
    def fake_cursor():
        used.append(True)
        yield "cursor"

    monkeypatch.setattr(db, "get_cursor", fake_cursor)
    with db.get_read_cursor() as cur:
        assert cur == "cursor"
    assert used == [True]


def test_dsn_adds_tcp_keepalive_for_cloud_hosts_only():
    cloud = db._dsn_with_sslmode("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?keepalives_idle=60")
    assert "keepalives=1" in cloud and "keepalives_idle=60" in cloud and "keepalives_count=3" in cloud
    assert "keepalives" not in db._dsn_with_sslmode("postgresql://postgres@127.0.0.1:54322/postgres")
