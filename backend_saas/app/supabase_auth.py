"""
Supabase Auth verification — replaces the previous single-password
ADMIN_PASSWORD/JWT scheme (see app/admin_auth.py's git history) with real
per-person accounts. This module only verifies who is calling; it decides
nothing about what they're allowed to do — that's app/auth_deps.py
(platform_owner / org_admin) plus app/repositories/platform_roles.py.

Deliberately verifies tokens by calling Supabase's own `/auth/v1/user`
endpoint rather than decoding the JWT locally: Supabase does the signature
check, expiry check, and revocation check for us. Successful verifications
are cached in this process for at most 60 seconds, never beyond JWT exp.
Revocations can therefore take up to 60 seconds to propagate. Roles are
not cached here: auth_deps still resolves authorization for every request.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import math
import threading
import time
from collections import OrderedDict

import httpx

from .config import get_settings

_client: httpx.Client | None = None
_client_lock = threading.Lock()

_TOKEN_CACHE_TTL = 60.0
_TOKEN_CACHE_MAX_SIZE = 512
# Store token hashes, never bearer credentials. Values are immutable identity
# fields plus monotonic TTL and wall-clock exp boundaries.
_token_cache: OrderedDict[str, tuple[str, str | None, float, float]] = OrderedDict()
_token_cache_lock = threading.Lock()


def _token_expiry(access_token: str) -> float | None:
    """Read exp only as a cache upper bound, never as proof of authenticity."""
    try:
        parts = access_token.split(".")
        if len(parts) != 3 or len(access_token) > 16384:
            return None
        payload = base64.b64decode(parts[1] + "=" * (-len(parts[1]) % 4), altchars=b"-_", validate=True)
        claims = json.loads(payload)
        expiry = claims.get("exp") if isinstance(claims, dict) else None
        if isinstance(expiry, bool) or not isinstance(expiry, (int, float)):
            return None
        expiry = float(expiry)
        return expiry if math.isfinite(expiry) else None
    except (ValueError, OverflowError, UnicodeError, binascii.Error):
        return None


def get_client() -> httpx.Client:
    """One client for the whole process instead of httpx.get's implicit
    per-call client. Constructing a client loads the certifi CA bundle into
    a fresh SSL context, measured at ~216 ms on the reference machine —
    more than the Supabase round-trip and the database query together, and
    previously paid on every authenticated request. Reusing the client also
    keeps the TLS connection to Supabase alive between requests. This
    reuses transport for cache misses; only a previously verified identity
    inside the bounded token-cache lifetime can skip the network request."""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client(timeout=5.0)
    return _client


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
    cache_key = hashlib.sha256(
        f"{settings.supabase_url}\0{settings.supabase_anon_key}\0{access_token}".encode()
    ).hexdigest()
    with _token_cache_lock:
        cached = _token_cache.get(cache_key)
        if cached is not None:
            user_id, email, deadline, expiry = cached
            if time.monotonic() < deadline and time.time() < expiry:
                _token_cache.move_to_end(cache_key)
                return SupabaseUser(id=user_id, email=email)
            del _token_cache[cache_key]
    verification_started = time.monotonic()
    try:
        response = get_client().get(
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

    try:
        body = response.json()
    except ValueError as exc:
        raise SupabaseAuthError("Invalid Supabase Auth response") from exc
    user_id = body.get("id") if isinstance(body, dict) else None
    if not isinstance(user_id, str) or not user_id.strip():
        raise SupabaseAuthError("Supabase Auth response missing user id")
    email = body.get("email")
    if email is not None and not isinstance(email, str):
        raise SupabaseAuthError("Invalid Supabase Auth email")
    expiry = _token_expiry(access_token)
    now = time.time()
    if expiry is not None:
        if expiry <= now:
            raise SupabaseAuthError("Access token expired")
        deadline = min(verification_started + _TOKEN_CACHE_TTL, time.monotonic() + expiry - now)
        with _token_cache_lock:
            # Bound both the lifetime and memory use even for many users.
            for key, entry in list(_token_cache.items()):
                if entry[2] <= time.monotonic() or entry[3] <= now:
                    del _token_cache[key]
            if deadline > time.monotonic():
                _token_cache[cache_key] = (user_id, email, deadline, expiry)
                _token_cache.move_to_end(cache_key)
                while len(_token_cache) > _TOKEN_CACHE_MAX_SIZE:
                    _token_cache.popitem(last=False)
    return SupabaseUser(id=user_id, email=email)


class SupabaseEmailConflictError(SupabaseAuthError):
    """A user with this email address already exists in Supabase Auth."""


def create_user(email: str, password: str) -> SupabaseUser:
    """Creates a new Supabase Auth user via the admin API. The user is created
    without email confirmation (email_confirm=false), meaning they need to
    confirm their address before they can sign in. Raises
    SupabaseEmailConflictError if the email is already registered, and
    SupabaseAuthError for any other failure."""
    settings = get_settings()
    if not settings.supabase_service_role_key:
        raise SupabaseAuthError("SUPABASE_SERVICE_ROLE_KEY not configured")

    try:
        response = get_client().post(
            f"{settings.supabase_url}/auth/v1/admin/users",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            json={"email": email, "password": password, "email_confirm": False},
            timeout=10.0,
        )
    except httpx.HTTPError as exc:
        raise SupabaseAuthError("Supabase Auth admin API unreachable") from exc

    if response.status_code in (422, 400):
        # Supabase returns 422 for duplicate emails with a message body
        try:
            msg = response.json().get("msg", "") or response.json().get("message", "")
        except Exception:
            msg = ""
        if "already" in msg.lower() or "registered" in msg.lower() or "exists" in msg.lower():
            raise SupabaseEmailConflictError(f"Email already registered: {email}")
        raise SupabaseAuthError(f"Supabase Auth rejected user creation (status={response.status_code}): {msg}")

    if response.status_code not in (200, 201):
        raise SupabaseAuthError(f"Supabase Auth user creation failed (status={response.status_code})")

    try:
        body = response.json()
    except ValueError as exc:
        raise SupabaseAuthError("Invalid Supabase Auth response") from exc

    user_id = body.get("id") if isinstance(body, dict) else None
    if not isinstance(user_id, str) or not user_id.strip():
        raise SupabaseAuthError("Supabase Auth response missing user id")

    return SupabaseUser(id=user_id, email=email)


def delete_user(user_id: str) -> None:
    """Deletes a Supabase Auth user via the admin API. Used to clean up after
    a failed self-signup DB transaction so orphaned auth users don't persist.
    Failures are logged but not re-raised — a leaked auth user is better than
    masking the original DB error."""
    import logging as _logging

    _logger = _logging.getLogger(__name__)
    settings = get_settings()
    if not settings.supabase_service_role_key:
        _logger.warning("Cannot delete auth user %s: SUPABASE_SERVICE_ROLE_KEY not configured", user_id)
        return

    try:
        response = get_client().delete(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers={
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "apikey": settings.supabase_service_role_key,
            },
            timeout=10.0,
        )
        if response.status_code not in (200, 204):
            _logger.warning(
                "Auth user cleanup failed (user_id=%s, status=%s)", user_id, response.status_code
            )
    except httpx.HTTPError:
        _logger.exception("Auth user cleanup failed (user_id=%s): HTTP error", user_id)


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
        response = get_client().get(
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
