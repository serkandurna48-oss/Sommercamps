"""
FastAPI dependencies enforcing the platform-foundation role model:
platform_owner (every organization) and org_admin (exactly the
organizations they have an organization_members row for). This is the
*only* place request handlers should check "am I allowed to do this" —
see app/routers/admin.py and app/routers/exports.py for the routes that
use require_platform_owner/require_org_access instead of the old, now
removed require_platform_admin.

Enforcement is server-side and unconditional: a route with
Depends(require_platform_owner) or Depends(require_org_access) 403s/401s
before the handler body runs, regardless of what the frontend does or does
not render. The frontend hiding a button is never the security boundary.
"""

from __future__ import annotations

import logging

from fastapi import Depends, Header, HTTPException, status

from . import admin_resolve, supabase_auth
from .repositories import platform_roles

logger = logging.getLogger(__name__)


class AuthContext:
    """Resolved identity + role for one request. `is_owner=True` means
    every organization-scoped check passes regardless of
    `admin_organization_ids` — see require_org_access below."""

    __slots__ = ("user_id", "email", "is_owner", "admin_organization_ids")

    def __init__(self, user_id: str, email: str | None, is_owner: bool, admin_organization_ids: set[str]):
        self.user_id = user_id
        self.email = email
        self.is_owner = is_owner
        self.admin_organization_ids = admin_organization_ids


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return authorization[len("bearer "):].strip()


def get_auth_context(authorization: str | None = Header(default=None)) -> AuthContext:
    """Verifies the bearer token against Supabase Auth, then looks up this
    user's platform role. A user who is neither a platform_owner nor an
    org_admin for anything still authenticates successfully here (a valid
    account with zero permissions) — every route-level dependency below
    is what actually turns that into a 403."""
    token = _extract_bearer_token(authorization)
    try:
        user = supabase_auth.verify_access_token(token)
    except supabase_auth.SupabaseAuthError as exc:
        logger.info("Rejected admin request: token verification failed (%s)", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated") from exc

    is_owner = platform_roles.is_platform_owner(user.id)
    admin_org_ids = set() if is_owner else set(platform_roles.get_admin_organization_ids(user.id))
    return AuthContext(user_id=user.id, email=user.email, is_owner=is_owner, admin_organization_ids=admin_org_ids)


def require_platform_owner(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    """Gate for platform-wide actions: creating organizations, the CEO
    console's global stats/registrations/audit-log views, assigning
    org_admins. An org_admin (even for many orgs) never satisfies this."""
    if not auth.is_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform owner required")
    return auth


def require_org_access(organization_slug: str, auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    """Gate for one organization's own admin surface (camps, registrations,
    branding, publish toggle): a platform_owner always passes; an
    org_admin passes only for the specific organization_id their
    membership row names — resolved server-side from the slug, never
    trusted from a client-supplied organization_id (there is none in this
    request shape to begin with)."""
    if auth.is_owner:
        return auth

    organization = admin_resolve.require_organization(organization_slug)
    if str(organization["id"]) not in auth.admin_organization_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this organization")
    return auth
