"""
Platform-admin auth — password login + JWT bearer verification.

Deliberately minimal: a single, platform-wide admin (whoever knows
ADMIN_PASSWORD), not a per-tenant identity. There is no `organization_members`
table yet, so a token here grants access to every organization — see
app/routers/admin.py for what that access actually allows. Ports the
existing, already-proven pattern from backend/main.py (verify_session_token
+ POST /admin/login) rather than inventing a new one, per
docs/saas/architecture.md section 2.3 ("Auth-Mechanismus wird wiederverwendet
... nicht neu erfunden").
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

_bearer = HTTPBearer(auto_error=False)


def verify_admin_password(password: str) -> bool:
    """Timing-safe comparison against ADMIN_PASSWORD — avoids leaking how
    many leading characters matched via response-time differences."""
    settings = get_settings()
    return secrets.compare_digest(password.encode(), settings.admin_password.encode())


def create_admin_token() -> str:
    """Signs a short-lived (TOKEN_EXPIRE_HOURS) HS256 JWT. No per-user claim
    beyond `sub: "platform_admin"` — there is only one admin identity."""
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": "platform_admin",
            "iat": now,
            "exp": now + timedelta(hours=settings.token_expire_hours),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def require_platform_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Route dependency — raises 401 on a missing/expired/invalid bearer
    token, otherwise returns None (a pure gate, same shape as backend/
    main.py's verify_session_token; no admin identity is passed into the
    handler since there's only one)."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    settings = get_settings()
    try:
        jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
