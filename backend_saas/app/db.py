"""
PostgreSQL connection layer for the CampsPilot SaaS API.

Conceptually follows backend/main.py's pool/cursor pattern (ThreadedConnectionPool,
RealDictCursor, commit-on-success/rollback-on-exception), but is a fresh,
independent implementation — no imports from backend/, no shared state.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from contextlib import contextmanager
from typing import Generator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
import psycopg2.extensions
import psycopg2.extras
import psycopg2.pool

from .config import get_settings

logger = logging.getLogger(__name__)


class DatabaseBusy(Exception):
    """All pool connections are in use and the wait timeout expired."""


_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_sem: threading.BoundedSemaphore | None = None

_LOCAL_HOSTNAMES = {"127.0.0.1", "localhost", "::1"}
_KEEPALIVE_PARAMS = {"keepalives": "1", "keepalives_idle": "30", "keepalives_interval": "10", "keepalives_count": "3"}

# Supabase's "Direct connection" hostname (db.<project-ref>.supabase.co)
# resolves IPv6-only unless the IPv4 add-on is purchased. Hit for real on
# CP-S407: Render (like many PaaS free tiers) has no outbound IPv6 route,
# so connecting to this host fails with "Network is unreachable" — not a
# credentials or firewall problem. The "Transaction pooler" hostname
# (aws-<n>-<region>.pooler.supabase.com) is IPv4-compatible and is what
# should be used instead on a platform like this. See README.md
# "Deployment" for the exact host format.
_SUPABASE_DIRECT_CONNECTION_HOST_RE = re.compile(r"^db\.[a-z0-9]+\.supabase\.co$", re.IGNORECASE)

# Without this, psycopg2 reads a `uuid` column back as a plain str (not a
# uuid.UUID) and — the sharper edge — can't adapt an actual uuid.UUID
# object as a query parameter at all ("can't adapt type 'UUID'"). That was
# latent and harmless through CP-S405 (every UUID-typed value in this
# codebase originated from a previous psycopg2 read, i.e. was already a
# str, and Pydantic coerces str -> UUID at the API boundary regardless).
# CP-S406 introduces internal functions meant for a future admin endpoint
# (cancel_registration_and_promote_next(tenant, registration_id: UUID)) —
# FastAPI parses a `UUID`-typed path parameter into a real uuid.UUID
# object, which would hit exactly this gap. Registering the adapter once,
# globally, here makes every uuid.UUID <-> `uuid` column round-trip work
# consistently, matching the type hints already used throughout (
# TenantContext.organization_id, RegistrationTarget.id, etc.).
psycopg2.extras.register_uuid()


def _dsn_with_sslmode(database_url: str) -> str:
    """
    Adds sslmode=require for non-local connections, without breaking a
    DATABASE_URL that already has query parameters (unlike a naive
    `url + "?sslmode=require"` concatenation, which produces an invalid URL
    when `url` already contains a `?`).

    Local Supabase/Postgres (127.0.0.1/localhost) is left untouched — the
    local stack has no SSL listener, so forcing sslmode=require would break
    every local connection. Cloud connections default to sslmode=require
    unless the URL already specifies one, mirroring backend/main.py's
    reasoning for the (KSV) Supabase pooler.
    """
    parts = urlsplit(database_url)
    query = dict(parse_qsl(parts.query))

    if parts.hostname not in _LOCAL_HOSTNAMES:
        if "sslmode" not in query:
            query["sslmode"] = "require"
        # Pooled connections now stay open between requests: TCP keepalive
        # stops NAT/load balancers from silently dropping them while idle
        # (libpq parameters; explicit values in DATABASE_URL win).
        for name, value in _KEEPALIVE_PARAMS.items():
            query.setdefault(name, value)

    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _warn_if_ipv6_only_supabase_host(database_url: str) -> None:
    hostname = urlsplit(database_url).hostname or ""
    if _SUPABASE_DIRECT_CONNECTION_HOST_RE.match(hostname):
        logger.warning(
            "DATABASE_URL uses Supabase's direct-connection host (%s), which is "
            "IPv6-only unless the IPv4 add-on is purchased. If the connection "
            "below fails with 'Network is unreachable', switch to the "
            "Transaction Pooler connection string instead (Supabase Dashboard -> "
            "Settings -> Database -> Connection string -> Transaction pooler).",
            hostname,
        )


class RetainingConnectionPool(psycopg2.pool.ThreadedConnectionPool):
    """
    ThreadedConnectionPool that keeps idle connections up to maxconn.

    Stock psycopg2 (2.9, pool.py `_putconn`) only keeps a returned connection
    while fewer than `minconn` are idle and closes every other one. With
    minconn=1 almost every concurrent request paid a fresh connect (TCP + TLS
    + SCRAM against the Supabase pooler): measured 62 new Postgres sessions for
    one load of the payments page. Here `minconn` only controls how many
    connections are opened at startup; afterwards up to `maxconn` stay open.

    Health: a connection that is closed or whose server link is lost
    (transaction status UNKNOWN) is discarded on borrow. One that sat idle for
    `ping_after` seconds or longer gets a `select 1` (autocommit, one round
    trip) first and is replaced if that fails, so a connection the pooler or
    the network dropped while idle never reaches a request.

    Supabase transaction pooler (port 6543): psycopg2 never uses server-side
    prepared statements and this module sets no session state (SET, temp
    tables, advisory session locks), so reusing connections is safe there.
    """

    def __init__(self, minconn: int, maxconn: int, *args, ping_after: float = 30.0, **kwargs):
        self._ping_after = float(ping_after)
        self._idle_since: dict[int, float] = {}
        # Own lock: psycopg2's self._lock is a plain Lock held inside super() calls.
        self._idle_lock = threading.Lock()
        super().__init__(minconn, maxconn, *args, **kwargs)
        # psycopg2 keeps a returned connection only while len(idle) < minconn.
        self.minconn = self.maxconn

    def getconn(self, key=None):
        # Bounded: each discarded idle connection shrinks the idle list; the
        # last attempt opens a fresh connection.
        for _ in range(self.maxconn + 1):
            conn = super().getconn(key)
            with self._idle_lock:
                idle_since = self._idle_since.pop(id(conn), None)
            if self._usable(conn, idle_since):
                return conn
            logger.info("Discarding stale pooled database connection")
            super().putconn(conn, close=True)
            # One dead idle connection usually means all of them died
            # (pooler restart, network blip): check the rest before use.
            self.mark_idle_suspect()
        raise psycopg2.OperationalError("No usable database connection")

    def putconn(self, conn=None, key=None, close=False):
        with self._idle_lock:
            if not close and conn is not None:
                self._idle_since[id(conn)] = time.monotonic()
            else:
                self._idle_since.pop(id(conn), None)
        super().putconn(conn, key, close)
        if conn is not None and conn.closed:
            # psycopg2 closes a lost connection itself (status UNKNOWN).
            with self._idle_lock:
                self._idle_since.pop(id(conn), None)

    def mark_idle_suspect(self) -> None:
        """Ping every currently idle connection on its next checkout. Called
        when a connection turned out to be broken: without it, each of up to
        maxconn recently used (so unpinged) dead connections would fail one
        request in turn."""
        with self._idle_lock:
            for key in list(self._idle_since):
                self._idle_since[key] = float("-inf")

    def _usable(self, conn, idle_since: float | None) -> bool:
        if conn.closed:
            return False
        if conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_UNKNOWN:
            return False
        if idle_since is None or time.monotonic() - idle_since < self._ping_after:
            return True
        try:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("select 1")
            conn.autocommit = False
            return True
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            return False


def init_pool() -> None:
    """Creates the connection pool. Called once from the FastAPI lifespan."""
    global _pool, _sem
    settings = get_settings()
    pool_max = settings.db_pool_max
    pool_min = min(settings.db_pool_min, pool_max)
    _warn_if_ipv6_only_supabase_host(settings.database_url)
    dsn = _dsn_with_sslmode(settings.database_url)
    _pool = RetainingConnectionPool(
        minconn=pool_min,
        maxconn=pool_max,
        dsn=dsn,
        cursor_factory=psycopg2.extras.RealDictCursor,
        ping_after=settings.db_pool_ping_after_seconds,
    )
    _sem = threading.BoundedSemaphore(pool_max)
    logger.info("Database connection pool initialized (open=%d, max=%d, kept idle up to max)", pool_min, pool_max)


def close_pool() -> None:
    """Closes all pooled connections. Called once from the FastAPI lifespan."""
    global _pool, _sem
    if _pool is not None:
        _pool.closeall()
        _pool = None
    _sem = None
    logger.info("Database connection pool closed")


@contextmanager
def get_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Borrows a connection from the pool and returns it afterwards.

    Blocks up to DB_POOL_WAIT_SECONDS for a free slot rather than throwing
    immediately; raises DatabaseBusy (→ 503) if the timeout expires.
    The BoundedSemaphore guards capacity so psycopg2's pool never sees more
    concurrent getconn() calls than maxconn — eliminating the PoolError.

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    if _pool is None or _sem is None:
        raise RuntimeError(
            "Database pool not initialized — init_pool() must run during app startup "
            "(see main.py's lifespan)."
        )
    _acquire_slot()
    conn = None
    try:
        conn = _pool.getconn()
        yield conn
    except BaseException as exc:
        if conn is not None:
            # A business exception (e.g. HTTPException raised inside a
            # cursor block) leaves a healthy connection: psycopg2's putconn
            # rolls back any open transaction and keeps it. Only a broken
            # link is closed.
            _return_connection(conn, broken=_is_broken(conn, exc))
            conn = None
        raise
    finally:
        if conn is not None:
            _return_connection(conn, broken=False)
        _sem.release()


def _acquire_slot() -> None:
    assert _sem is not None
    wait = get_settings().db_pool_wait_seconds
    if not _sem.acquire(timeout=wait):
        logger.warning("Database connection pool exhausted (waited %ss)", wait)
        raise DatabaseBusy()


def _is_broken(conn, exc: BaseException) -> bool:
    """Broken = the link is gone, not merely "an OperationalError happened":
    QueryCanceled (statement timeout) is an OperationalError on a healthy
    connection, which putconn rolls back and keeps."""
    if getattr(conn, "closed", False):
        return True
    try:
        return conn.info.transaction_status == psycopg2.extensions.TRANSACTION_STATUS_UNKNOWN
    except Exception:
        return isinstance(exc, (psycopg2.OperationalError, psycopg2.InterfaceError))


def _return_connection(conn: psycopg2.extensions.connection, *, broken: bool) -> None:
    """Never leaks a pool slot: if returning fails (e.g. the rollback inside
    putconn hits a dead connection), the connection is closed instead. A
    broken connection makes the pool check its idle connections before use."""
    assert _pool is not None
    broken = broken or bool(getattr(conn, "closed", False))
    try:
        _pool.putconn(conn, close=broken)
    except Exception:
        broken = True
        logger.warning("Returning a database connection failed; closing it", exc_info=True)
        try:
            _pool.putconn(conn, close=True)
        except Exception:
            logger.exception("Could not discard database connection")
    if broken and isinstance(_pool, RetainingConnectionPool):
        _pool.mark_idle_suspect()


@contextmanager
def get_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Borrows a connection, opens a cursor, commits on success, rolls back on
    exception. Connections are reused across requests (and sit behind the
    Supabase transaction pooler): only `SET LOCAL`, never session-level `SET`.

        with get_cursor() as cur:
            cur.execute("SELECT * FROM organizations WHERE slug = %s", (slug,))
            row = cur.fetchone()
    """
    with get_connection() as conn:
        try:
            with conn.cursor() as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise


@contextmanager
def get_read_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Cursor for single-statement reads: autocommit, so psycopg2 sends no
    BEGIN/COMMIT. One query = one round trip instead of three (measured:
    a typical admin request did ~18 DB round trips, mostly BEGIN/COMMIT
    around one-row lookups). Same isolation as get_cursor() for a single
    SELECT (one statement = one snapshot). Never use it for writes or for
    several statements that must see one consistent state.

    Without an initialized pool (unit tests and scripts that substitute
    get_cursor) it delegates to get_cursor(), looked up at call time.
    """
    if _pool is None or _sem is None:
        with get_cursor() as cur:
            yield cur
        return
    _acquire_slot()
    holder: dict = {"conn": None}

    def open_cursor():
        holder["conn"] = conn = _pool.getconn()
        conn.autocommit = True
        return conn.cursor()

    def reopen():
        dead, holder["conn"] = holder["conn"], None
        _release_read_connection(dead, broken=True)
        return open_cursor()

    try:
        cur = _ReadRetryCursor(open_cursor(), reopen)
        try:
            yield cur
        finally:
            cur.close()
    except BaseException as exc:
        conn, holder["conn"] = holder["conn"], None
        if conn is not None:
            _release_read_connection(conn, broken=_is_broken(conn, exc))
        raise
    finally:
        conn, holder["conn"] = holder["conn"], None
        if conn is not None:
            _release_read_connection(conn, broken=False)
        _sem.release()


def _release_read_connection(conn, *, broken: bool) -> None:
    if not broken and not conn.closed:
        try:
            conn.autocommit = False
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            broken = True
    _return_connection(conn, broken=broken)


class _ReadRetryCursor:
    """Cursor proxy for get_read_cursor: if the FIRST execute fails because
    the connection is dead (server/pooler closed it), it is retried once on a
    fresh connection. Safe only because a read cursor runs one SELECT with no
    side effects; errors on a live connection (SQL errors, statement timeout)
    are never retried. get_cursor() (writes, transactions) never retries."""

    __slots__ = ("_cur", "_reopen", "_executed")

    def __init__(self, cur, reopen):
        self._cur = cur
        self._reopen = reopen
        self._executed = False

    def execute(self, query, vars=None):
        if self._executed:
            return self._cur.execute(query, vars)
        self._executed = True
        try:
            return self._cur.execute(query, vars)
        except (psycopg2.OperationalError, psycopg2.InterfaceError):
            if not self._cur.connection.closed:
                raise
            logger.warning("Read query hit a closed database connection; retrying once on a fresh one")
            self._cur = self._reopen()
            return self._cur.execute(query, vars)

    def close(self):
        try:
            self._cur.close()
        except Exception:
            pass

    def __iter__(self):
        return iter(self._cur)

    def __getattr__(self, name):
        return getattr(self._cur, name)
