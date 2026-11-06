"""
Shared organization/camp resolve-or-404 helpers for platform-admin routes.

Deliberately resolves via organizations_repo/camps_repo directly, never
tenancy.resolve_tenant() — that helper 404s on a suspended/cancelled
organization, which is correct for the public API but wrong for admin
routes (an admin must still be able to see/edit a suspended organization).
Extracted from app/routers/admin.py and app/routers/exports.py, which had
repeated this identical lookup-or-404 pair independently (cleanup after
code review).
"""

from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from fastapi import HTTPException

from .repositories import camps as camps_repo
from .repositories import organizations as organizations_repo


# Per-request memo for require_organization(). auth_deps.require_org_access
# resolves the organization for an org_admin and the handler resolves it
# again for the same slug: one DB lookup instead of two. The dict is created
# by RequestMemoMiddleware (app/main.py) per HTTP request; FastAPI runs sync
# dependencies and handlers in worker threads with a *copy* of the request's
# context, and the copies share this one dict object. Outside a request
# (scripts, direct calls in tests) the memo is None and nothing is cached.
# Only the organization row is memoized, keyed by slug; nothing outlives
# the request.
_request_memo: ContextVar[dict[str, Any] | None] = ContextVar("admin_request_memo", default=None)


class RequestMemoMiddleware:
    """Pure ASGI middleware: a fresh, empty memo for every HTTP request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = _request_memo.set({})
        try:
            await self.app(scope, receive, send)
        finally:
            _request_memo.reset(token)


def forget_organization(organization_slug: str) -> None:
    """Drop a memoized row after a write to that organization."""
    memo = _request_memo.get()
    if memo is not None:
        memo.pop(("organization", organization_slug), None)


def require_organization(organization_slug: str) -> dict:
    memo = _request_memo.get()
    key = ("organization", organization_slug)
    if memo is not None and key in memo:
        return memo[key]
    organization = organizations_repo.get_organization_by_slug(organization_slug)
    if organization is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if memo is not None:
        memo[key] = organization
    return organization


def require_camp(organization: dict, camp_slug: str) -> dict:
    camp = camps_repo.get_camp_by_slug(organization["id"], camp_slug)
    if camp is None:
        raise HTTPException(status_code=404, detail="Camp not found")
    return camp
