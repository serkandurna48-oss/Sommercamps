"""
Pilot request form — unauthenticated contact endpoint for prospective customers.

POST /public/pilot-request — sends a notification email to PLATFORM_CONTACT_EMAIL.
No database writes. Honeypot: website field must be empty (⇒ 204, no mail).
Rate-limited using the same bucket and helper functions as POST /public/signup
(3 per IP per hour). No personal data logged — only "pilot-request sent" / "failed".

PLATFORM_CONTACT_EMAIL is read from os.environ at call time (not via get_settings())
so monkeypatch.setenv works in tests without clearing the lru_cache'd Settings.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from html import escape
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..notifications.mail import MailMessage, get_provider
from .signup import _check_rate_limit, _get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["Public"])


class PilotRequestBody(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    verein: str = Field(min_length=2, max_length=120)
    email: EmailStr
    telefon: Optional[str] = Field(default=None, max_length=40)
    nachricht: Optional[str] = Field(default=None, max_length=1000)
    website: str = Field(default="")  # honeypot — must be empty


@router.post("/pilot-request")
def pilot_request(data: PilotRequestBody, request: Request) -> Response:
    """Contact form for prospective pilot customers.

    Honeypot: if `website` is non-empty, silently return 204 without sending mail.
    Rate limit: 3 requests per IP per hour (shared bucket with /public/signup).
    Mail: sends to PLATFORM_CONTACT_EMAIL with Reply-To set to the requester's address.
    """
    if data.website:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    client_ip = _get_client_ip(request)
    if not _check_rate_limit(client_ip):
        logger.info("pilot-request rate limit exceeded (ip=%s)", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.",
        )

    contact_email = (os.environ.get("PLATFORM_CONTACT_EMAIL") or "").strip()
    if not contact_email:
        logger.error("pilot-request: PLATFORM_CONTACT_EMAIL not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="pilot_request_unavailable",
        )

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    parts = [
        f"<p><strong>Verein:</strong> {escape(data.verein)}</p>",
        f"<p><strong>E-Mail:</strong> {escape(str(data.email))}</p>",
    ]
    if data.telefon:
        parts.append(f"<p><strong>Telefon:</strong> {escape(data.telefon)}</p>")
    if data.nachricht:
        parts.append(
            f"<p><strong>Nachricht:</strong><br>"
            f"{escape(data.nachricht).replace(chr(10), '<br>')}</p>"
        )
    parts.append(f"<p><em>Eingegangen: {ts}</em></p>")

    msg = MailMessage(
        to_email=contact_email,
        subject=f"Pilotanfrage: {data.verein}",
        html_content="".join(parts),
        reply_to=str(data.email),
    )

    try:
        get_provider().send(msg)
        logger.info("pilot-request sent")
    except Exception as exc:
        logger.error("pilot-request failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="pilot_request_unavailable",
        ) from exc

    return Response(status_code=status.HTTP_200_OK)
