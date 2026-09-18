"""
PostgreSQL connection layer for the CampsPilot SaaS API.

Conceptually follows backend/main.py's pool/cursor pattern (ThreadedConnectionPool,
RealDictCursor, commit-on-success/rollback-on-exception), but is a fresh,
independent implementation — no imports from backend/, no shared state.
"""

from __future__ import annotations

import logging
import re
from contextlib import contextmanager
from typing import Generator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg2
import psycopg2.extensions
import psycopg2.extras
import psycopg2.pool

from .config import get_settings

logger = logging.getLogger(__name__)

_pool: psycopg2.pool.ThreadedConnectionPool | None = None

_LOCAL_HOSTNAMES = {"127.0.0.1", "localhost", "::1"}

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

    if parts.hostname not in _LOCAL_HOSTNAMES and "sslmode" not in query:
        query["sslmode"] = "require"

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


def init_pool() -> None:
    """Creates the connection pool. Called once from the FastAPI lifespan."""
    global _pool
    settings = get_settings()
    _warn_if_ipv6_only_supabase_host(settings.database_url)
    dsn = _dsn_with_sslmode(settings.database_url)
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        dsn=dsn,
        cursor_factory=psycopg2.extras.RealDictCursor,
    )
    logger.info("Database connection pool initialized")


def close_pool() -> None:
    """Closes all pooled connections. Called once from the FastAPI lifespan."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
        logger.info("Database connection pool closed")


@contextmanager
def get_connection() -> Generator[psycopg2.extensions.connection, None, None]:
    """
    Borrows a connection from the pool and returns it afterwards.

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    """
    if _pool is None:
        raise RuntimeError(
            "Database pool not initialized — init_pool() must run during app startup "
            "(see main.py's lifespan)."
        )
    conn = _pool.getconn()
    try:
        yield conn
    finally:
        _pool.putconn(conn)


@contextmanager
def get_cursor() -> Generator[psycopg2.extras.RealDictCursor, None, None]:
    """
    Borrows a connection, opens a cursor, commits on success, rolls back on
    exception.

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
