"""
Mail provider abstraction for registration notifications.

Provider is built once (lazy singleton) from env vars:
  NOTIFICATION_PROVIDER   "brevo" | anything else → FakeProvider
  BREVO_API_KEY           required when NOTIFICATION_PROVIDER=brevo
  NOTIFICATION_FROM_EMAIL sender address (default noreply@campspilot.app)
  NOTIFICATION_FROM_NAME  sender display name (default CampsPilot)

FakeProvider logs and collects sent messages — used in tests and when
NOTIFICATION_PROVIDER is unset (local dev / CI). No real mail is sent.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass
class MailMessage:
    to_email: str
    to_name: str
    subject: str
    html_content: str
    reply_to: Optional[str] = None


@runtime_checkable
class MailProvider(Protocol):
    def send(self, message: MailMessage) -> None: ...


class FakeProvider:
    """Accumulates sent messages; never makes network calls."""

    def __init__(self) -> None:
        self.sent: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        logger.info("FakeProvider: would send — subject: %s", message.subject)
        self.sent.append(message)


class BrevoProvider:
    def __init__(self, api_key: str, from_email: str, from_name: str) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name

    def send(self, message: MailMessage) -> None:
        import requests

        payload: dict = {
            "sender": {"email": self._from_email, "name": self._from_name},
            "to": [{"email": message.to_email, "name": message.to_name}],
            "subject": message.subject,
            "htmlContent": message.html_content,
        }
        if message.reply_to:
            payload["replyTo"] = {"email": message.reply_to}

        resp = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": self._api_key, "Content-Type": "application/json"},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()


_provider: Optional[MailProvider] = None


def get_provider() -> MailProvider:
    global _provider
    if _provider is None:
        _provider = _build_provider()
    return _provider


def reset_provider_for_testing(provider: Optional[MailProvider]) -> None:
    """Replace the singleton — call with None to restore lazy build."""
    global _provider
    _provider = provider


def _build_provider() -> MailProvider:
    if os.getenv("NOTIFICATION_PROVIDER") == "brevo":
        return BrevoProvider(
            api_key=os.getenv("BREVO_API_KEY", ""),
            from_email=os.getenv("NOTIFICATION_FROM_EMAIL", "noreply@campspilot.app"),
            from_name=os.getenv("NOTIFICATION_FROM_NAME", "CampsPilot"),
        )
    return FakeProvider()
