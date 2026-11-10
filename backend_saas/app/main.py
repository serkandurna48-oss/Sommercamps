"""
CampsPilot SaaS API — FastAPI entrypoint.

CP-S403: DB pool, tenant resolution, /health.
CP-S404: read-only, tenant-scoped Organization and Camp endpoints.
CP-S405: the first write endpoint — public camp registration.
CP-S406: waitlist + registration lifecycle.
CP-S407: staging-ready CORS baseline (see README.md "CORS"); deployment
config lives in backend_saas/render.yaml.
Platform-admin auth + organization/camp CRUD (see app/routers/admin.py) —
still no payments or email. See README.md.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .admin_resolve import RequestMemoMiddleware
from .db import DatabaseBusy
from .config import get_settings
from .log_redact import install_access_log_filter
from .routers.training import admin_router as training_admin_router, public_router as training_public_router
from .routers import admin_router, camps_router, exports_router, memberships_router, organizations_router, players_router, pilot_request_router, registrations_router, signup_router, payments_router, billing_router, invoices_router, internal_router, booking_router

logger = logging.getLogger(__name__)

# Evaluated at import time so a misconfigured deployment fails immediately
# with a readable error (see config.get_settings) rather than on first
# request. Does not touch the database — only env/settings parsing.
settings = get_settings()

logging.basicConfig(level=settings.log_level)
install_access_log_filter()


def _link_unlinked_registrations_best_effort() -> None:
    """Links registrations written between the player_records migration and this deploy.
    Never blocks startup; logs only the count or the error type (no personal data)."""
    from .repositories import players

    try:
        linked = players.link_unlinked_registrations()
        if linked:
            logger.info("Linked %d registrations to player records", linked)
    except Exception as exc:  # noqa: BLE001 - best effort
        logger.warning("Player linking at startup skipped (%s)", type(exc).__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init_pool()
    logger.info("%s started (env=%s)", settings.app_name, settings.app_env)
    if not settings.frontend_base_is_usable():
        # Signup/review mails with login links are refused until this is set
        # (see Settings.login_url); registrations and the parent flow keep working.
        logger.error(
            "FRONTEND_BASE_URL is %s in env=%s - signup and review mails are blocked "
            "until it is set to the deployed frontend origin",
            settings.frontend_base_url,
            settings.app_env,
        )
    if settings.app_env != "test":  # tests assert that no request/startup path touches the DB unmocked
        _link_unlinked_registrations_best_effort()
    try:
        yield
    finally:
        db.close_pool()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

# No wildcard, no allow_credentials (this API has no cookie/session auth to
# protect against CSRF via CORS anyway) — just an explicit, staging-safe
# origin list. See config.Settings.cors_origins / README.md "CORS" for the
# reasoning and how to add a real frontend origin later.
# PATCH added for the admin organization-update endpoint (app/routers/
# admin.py) — GET/POST alone were sufficient before it existed.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)
# Per-request memo for admin organization lookups (app/admin_resolve.py).
app.add_middleware(RequestMemoMiddleware)

app.include_router(organizations_router)
app.include_router(camps_router)
app.include_router(registrations_router)
app.include_router(admin_router)
app.include_router(exports_router)
app.include_router(memberships_router)
app.include_router(players_router)
app.include_router(training_admin_router)
app.include_router(training_public_router)
app.include_router(signup_router)
app.include_router(pilot_request_router)
app.include_router(payments_router)
app.include_router(billing_router)
app.include_router(invoices_router)
app.include_router(internal_router)
app.include_router(booking_router)


@app.exception_handler(DatabaseBusy)
async def _database_busy_handler(_request: Request, _exc: DatabaseBusy) -> JSONResponse:
    # One warning line — no traceback, no connection details.
    logger.warning("Request rejected: database pool exhausted")
    return JSONResponse(
        status_code=503,
        content={"detail": "Server ausgelastet, bitte erneut versuchen"},
        headers={"Retry-After": "2"},
    )


@app.get("/health", tags=["System"])
def health() -> JSONResponse:
    """
    Runs `SELECT 1` against the database. Returns 503 (not an unhandled
    500) if the database is unreachable, and never exposes the connection
    string or raw driver exception to the client — only a server-side log.
    Reads no application data, so there is nothing personally identifiable
    to leak here regardless.
    """
    try:
        with db.get_cursor() as cur:
            cur.execute("SELECT 1")
        return JSONResponse(
            status_code=200,
            content={"status": "ok", "database": "ok", "service": "campspilot-saas-api", "version": app.version, "env": settings.app_env},
        )
    except Exception:
        logger.exception("Health check failed: database unreachable")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unreachable", "service": "campspilot-saas-api", "env": settings.app_env},
        )
