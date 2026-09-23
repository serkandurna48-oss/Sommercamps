"""
Supabase Auth verification — replaces the previous single-password
ADMIN_PASSWORD/JWT scheme (see app/admin_auth.py's git history) with real
per-person accounts. This module only verifies who is calling; it decides
nothing about what they're allowed to do — that's app/auth_deps.py
(platform_owner / org_admin) plus app/repositories/platform_roles.py.

Deliberately verifies tokens by calling Supabase's own `/auth/v1/user`
endpoint rather than decoding the JWT locally: Supabase does the signature
check, expiry check, and revocation check for us, so this module never
needs to hold or rotate a JWT-signing secret. The tradeoff is one extra
network round-trip per authenticated request — acceptable at this
service's scale, and it keeps "is this token still valid" as a single
source of truth (Supabase's own session store) instead of a second,
locally-duplicated notion of validity.
"""

from __future__ import annotations

import httpx

from .config import get_settings


class SupabaseAuthError(Exception):
    """Token missing, malformed, expired, or Supabase Auth unreachable —
    app/auth_deps.py maps every variant of this to the same 401, so the
    distinction here is for logging, not for the client response."""


class SupabaseUser:
    __slots__ = ("id", "email")

    def __init__(self, id: str, email: str | None):
        self.id = id
        self.email = email


def verify_access_token(access_token: str) -> SupabaseUser:
    """Resolves a Supabase Auth access token (the JWT a client gets back
    from supabase-js's signInWithPassword) to the user it belongs to.
    Raises SupabaseAuthError for anything that isn't a clean 200 — an
    expired/invalid token and a network failure are both "can't verify
    this," and the caller (app/auth_deps.py) treats both as 401 rather
    than leaking which one happened to the client."""
    settings = get_settings()
    try:
        response = httpx.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "apikey": settings.supabase_anon_key,
            },
            timeout=5.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError("Supabase Auth unreachable") from exc

    if response.status_code != 200:
        raise SupabaseAuthError(f"Token rejected by Supabase Auth (status={response.status_code})")

    body = response.json()
    user_id = body.get("id")
    if not user_id:
        raise SupabaseAuthError("Supabase Auth response missing user id")
    return SupabaseUser(id=user_id, email=body.get("email"))


def find_user_by_email(email: str) -> SupabaseUser | None:
    """Admin-API lookup (Supabase's GoTrue `/auth/v1/admin/users`) — used
    only by the org_admin-assignment endpoint, which must resolve an email
    address to an existing Supabase Auth user without ever sending that
    user an invite email (explicitly out of scope for this sprint: no
    email sending). Requires the service-role key; raises SupabaseAuthError
    if it isn't configured so the caller can turn that into a clear 503
    rather than a confusing 401/500."""
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise SupabaseAuthError("SUPABASE_SERVICE_ROLE_KEY not configured")

    try:
        response = httpx.get(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            params={"email": email},
            timeout=5.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError("Supabase Auth admin API unreachable") from exc

    if response.status_code != 200:
        raise SupabaseAuthError(f"Supabase Auth admin lookup failed (status={response.status_code})")

    users = response.json().get("users", [])
    for candidate in users:
        if candidate.get("email", "").lower() == email.lower():
            return SupabaseUser(id=candidate["id"], email=candidate.get("email"))
    return None
