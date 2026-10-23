"""
Self-registration flow for new organizations (S1 Selbstregistrierung).

POST /public/signup — unauthenticated. Creates a Supabase Auth user and
an organization in draft/unpublished state. The organization must be reviewed
and approved by a platform owner before it becomes publicly visible.

POST /public/signup/resend — resend the confirmation email. Always returns
202; never reveals whether the email address is registered.

Rate-limited to 3 attempts per IP per hour (in-memory, single-process).
Both endpoints share the same bucket. A Redis-backed counter would be
needed for multi-instance deployments but adds infrastructure complexity
that is not justified at current scale.

IP extraction: controlled by TRUSTED_PROXY_HOPS env var (default 0).
  0: use request.client.host — never trust X-Forwarded-For; a client could
     forge it and bypass the limit.
  n>0: take the n-th entry from the END of X-Forwarded-For (the hop appended
       by the trusted proxy, which the client cannot control).
On Render with one load-balancer in front: set TRUSTED_PROXY_HOPS=1.
"""

from __future__ import annotations

import logging
import os
import re
import threading
import time
import unicodedata
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .. import supabase_auth
from ..notifications import sending as notifications_sending
from ..repositories import organizations as organizations_repo
from ..supabase_auth import SupabaseAuthError, SupabaseEmailConflictError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["Public"])

# ---------------------------------------------------------------------------
# Rate limiter (in-memory, single-process)
# ---------------------------------------------------------------------------

_rate_lock = threading.Lock()
_ip_timestamps: dict[str, list[float]] = {}
_RATE_WINDOW = 3600.0  # 1 hour
_RATE_MAX = 3


def _check_rate_limit(ip: str) -> bool:
    """Returns True if the IP may proceed, False if the limit is exceeded.
    Appends a new timestamp on True."""
    now = time.time()
    with _rate_lock:
        times = _ip_timestamps.get(ip, [])
        # Evict expired entries
        times = [t for t in times if now - t < _RATE_WINDOW]
        if len(times) >= _RATE_MAX:
            _ip_timestamps[ip] = times
            return False
        times.append(now)
        _ip_timestamps[ip] = times
        return True


def _get_client_ip(request: Request) -> str:
    """Returns the IP to use for rate limiting.

    With TRUSTED_PROXY_HOPS=0 (default): request.client.host.
    With TRUSTED_PROXY_HOPS=n: the n-th entry from the END of
    X-Forwarded-For (appended by the nth trusted proxy hop).
    Reading TRUSTED_PROXY_HOPS from os.environ at call time so tests can
    use monkeypatch.setenv without clearing the lru_cache'd Settings."""
    try:
        hops = int(os.environ.get("TRUSTED_PROXY_HOPS", "0") or "0")
    except (TypeError, ValueError):
        hops = 0
    if hops > 0:
        xff = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    if request.client:
        return request.client.host
    return "unknown"


# ---------------------------------------------------------------------------
# Reserved slugs — never allowed regardless of DB state
# ---------------------------------------------------------------------------

_RESERVED_SLUGS = frozenset({
    "ksv-baunatal",
    "jk-performance-academy",
    "admin",
    "platform",
    "pilot",
    "api",
    "campspilot",
    "www",
    "demo",
    "login",
    "hilfe",
})

# Mirrors the DB check constraint ^[a-z0-9]+(-[a-z0-9]+)*$
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

_UMLAUT_MAP = str.maketrans({
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    "Ä": "ae", "Ö": "oe", "Ü": "ue",
})


def _derive_slug(name: str) -> str:
    """Derives a URL-safe slug from an organization name, handling German
    umlauts and other non-ASCII characters."""
    s = name.translate(_UMLAUT_MAP)
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    s = re.sub(r"-+", "-", s)
    return s or "verein"


def _pick_slug(base: str) -> Optional[str]:
    """Tries base, base-2, base-3, … up to base-10. Returns the first
    available slug, or None if all are taken. Reserved slugs are excluded from
    the suffix loop (only the base is checked against the reserved list before
    this is called)."""
    candidate = base
    for suffix in [None] + list(range(2, 11)):
        if suffix is not None:
            candidate = f"{base}-{suffix}"
        existing = organizations_repo.get_organization_by_slug(candidate)
        if existing is None:
            return candidate
    return None


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    organization_name: str = Field(min_length=3, max_length=80)
    contact_person_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=10)
    accepted_terms: bool

    @field_validator("accepted_terms")
    @classmethod
    def _must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Nutzungsbedingungen müssen akzeptiert werden (accepted_terms muss true sein)")
        return value


class SignupResponse(BaseModel):
    organization_slug: str
    needs_email_confirmation: bool = True
    confirmation_email_sent: bool = True


class ResendRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    email: EmailStr


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/signup",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
)
def signup(data: SignupRequest, request: Request) -> SignupResponse:
    """Self-registration for new organizations. Creates a Supabase Auth user
    and an organization in draft/review state. The org becomes publicly visible
    only after a platform owner approves it.

    After successful creation, sends a confirmation email with a link generated
    via the Supabase Admin API. Email sending is best-effort: a failure does not
    roll back the registration; the response includes confirmation_email_sent to
    indicate whether the email was dispatched."""
    client_ip = _get_client_ip(request)

    if not _check_rate_limit(client_ip):
        logger.info("Signup rate limit exceeded (ip=%s)", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Zu viele Registrierungsversuche. Bitte warten Sie eine Stunde "
                "und versuchen Sie es erneut."
            ),
        )

    base_slug = _derive_slug(data.organization_name)

    if base_slug in _RESERVED_SLUGS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dieser Vereinsname ist nicht verfügbar. Bitte wählen Sie einen anderen Namen.",
        )

    slug = _pick_slug(base_slug)
    if slug is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Dieser Vereinsname ist nicht verfügbar. Bitte wählen Sie einen anderen Namen.",
        )

    # Create Supabase Auth user first. If DB fails afterward we roll back the
    # DB transaction and then delete the auth user so no orphan account remains.
    try:
        auth_user = supabase_auth.create_user(str(data.email), data.password)
    except SupabaseEmailConflictError:
        # Deliberately vague — do not reveal whether the email is registered.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Registrierung nicht möglich. "
                "Bitte melden Sie sich an oder setzen Sie Ihr Passwort zurück."
            ),
        )
    except SupabaseAuthError as exc:
        logger.error("Signup failed: Supabase Auth error (%s)", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registrierung momentan nicht möglich. Bitte versuchen Sie es später erneut.",
        ) from exc

    try:
        org = organizations_repo.create_signup_organization(
            slug=slug,
            name=data.organization_name,
            contact_email=str(data.email),
            contact_person_name=data.contact_person_name,
            user_id=auth_user.id,
        )
    except Exception as exc:
        logger.error("Signup DB transaction failed (slug=%s): %s", slug, exc)
        supabase_auth.delete_user(auth_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.",
        ) from exc

    logger.info("Signup successful (slug=%s)", org["slug"])

    # Generate confirmation link and send email — best-effort.
    confirmation_email_sent = _send_confirmation_email(
        email=str(data.email),
        org_name=data.organization_name,
        slug=org["slug"],
    )

    return SignupResponse(
        organization_slug=org["slug"],
        needs_email_confirmation=True,
        confirmation_email_sent=confirmation_email_sent,
    )


def _send_confirmation_email(*, email: str, org_name: str, slug: str) -> bool:
    """Generates a confirmation link via Supabase and sends the confirmation
    email. Returns True if the email was dispatched, False on any failure.
    Never raises."""
    try:
        link = supabase_auth.generate_confirmation_link(email)
    except Exception as exc:
        logger.warning(
            "Signup confirmation link generation failed (slug=%s): %s", slug, exc
        )
        return False
    sent = notifications_sending.send_signup_confirmation_email(
        to_email=email,
        org_name=org_name,
        confirmation_link=link,
    )
    if not sent:
        logger.warning("Signup confirmation email send failed (slug=%s)", slug)
    return sent


@router.post(
    "/signup/resend",
    status_code=status.HTTP_202_ACCEPTED,
)
def signup_resend(data: ResendRequest, request: Request) -> dict:
    """Resend the signup confirmation email.

    Always returns 202 — never reveals whether the email address exists or
    whether the email was actually sent. Uses the same rate limit bucket as
    POST /public/signup (3 attempts per IP per hour)."""
    client_ip = _get_client_ip(request)

    if not _check_rate_limit(client_ip):
        logger.info("Signup resend rate limit exceeded (ip=%s)", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Zu viele Versuche. Bitte warten Sie eine Stunde "
                "und versuchen Sie es erneut."
            ),
        )

    # Best-effort: never reveal success or failure to the caller.
    try:
        link = supabase_auth.generate_confirmation_link(str(data.email))
        notifications_sending.send_signup_confirmation_email(
            to_email=str(data.email),
            org_name="CampsPilot",
            confirmation_link=link,
        )
    except Exception:
        pass

    return {}
