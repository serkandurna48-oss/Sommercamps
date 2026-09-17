"""
CampsPilot SaaS API — FastAPI entrypoint.

CP-S403: DB pool, tenant resolution, /health.
CP-S404: read-only, tenant-scoped Organization and Camp endpoints.
CP-S405: the first write endpoint — public camp registration.
CP-S406: waitlist + registration lifecycle.
CP-S407: staging-ready CORS baseline (see README.md "CORS"); deployment
config lives in backend_saas/render.yaml.
No admin CRUD, auth, payments, or email yet — see README.md.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import db
from .config import get_settings
from .routers import camps_router, organizations_router, registrations_router

logger = logging.getLogger(__name__)

# Evaluated at import time so a misconfigured deployment fails immediately
# with a readable error (see config.get_settings) rather than on first
# request. Does not touch the database — only env/settings parsing.
settings = get_settings()

logging.basicConfig(level=settings.log_level)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    db.init_pool()
    logger.info("%s started (env=%s)", settings.app_name, settings.app_env)
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(organizations_router)
app.include_router(camps_router)
app.include_router(registrations_router)


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
            content={"status": "ok", "database": "ok", "service": "campspilot-saas-api"},
        )
    except Exception:
        logger.exception("Health check failed: database unreachable")
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unreachable", "service": "campspilot-saas-api"},
        )
