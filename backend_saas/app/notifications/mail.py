"""
Mail provider abstraction for registration notifications.

Provider is built once (lazy singleton) from env vars:
  NOTIFICATION_PROVIDER   "brevo" | "fake" | missing/unknown → see below
  BREVO_API_KEY           required when NOTIFICATION_PROVIDER=brevo
  NOTIFICATION_FROM_EMAIL sender address (default noreply@campspilot.app)
  NOTIFICATION_FROM_NAME  sender display name (default CampsPilot)

FakeProvider: only when NOTIFICATION_PROVIDER is explicitly "fake".
  delivers=False — email_sent_at is never set, so sends remain retry-able.

Missing or unknown value:
  local/test (APP_ENV in "local"/"test"): logs warning, skips send silently.
  production: logs error, raises — causes email_error to be recorded.

Non-production recipient guard (CTO 29.10.2026):
  Whenever APP_ENV is not exactly "production", the Brevo provider is wrapped
  in RecipientGuardProvider. Only recipients listed in
  NOTIFICATION_ALLOWED_RECIPIENTS (comma-separated; full addresses or
  "@domain" entries) are delivered. Everything else is blocked and raises, so
  email_error is recorded and no real parent or club inbox gets staging mail.
  Empty/unset allowlist outside production = block every recipient.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional, Protocol, runtime_checkable

import httpx

logger = logging.getLogger(__name__)


@dataclass
class MailMessage:
    to_email: str
    subject: str
    html_content: str
    reply_to: Optional[str] = None
    sender_name: Optional[str] = None  # overrides provider default when set


@runtime_checkable
class MailProvider(Protocol):
    def send(self, message: MailMessage) -> None: ...


class FakeProvider:
    """Accumulates sent messages; never makes network calls.

    delivers=False: _do_send will not call _mark_sent, so email_sent_at stays
    NULL and the registration remains retry-able after a fake send.
    """

    delivers: bool = False

    def __init__(self) -> None:
        self.sent: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        logger.info("FakeProvider: would send — subject: %s", message.subject)
        self.sent.append(message)


class _LocalUnconfiguredProvider:
    """NOTIFICATION_PROVIDER missing/unknown in local/test env: warn and skip."""

    delivers: bool = False

    def send(self, message: MailMessage) -> None:
        logger.warning(
            "NOTIFICATION_PROVIDER not configured or unknown; skipping mail send (local/test env)"
        )


class _ProdUnconfiguredProvider:
    """NOTIFICATION_PROVIDER missing/unknown in production: log error and raise so email_error is recorded."""

    delivers: bool = False

    def send(self, message: MailMessage) -> None:
        logger.error(
            "NOTIFICATION_PROVIDER not configured or unknown; rejecting mail send (production env)"
        )
        raise RuntimeError(
            "NOTIFICATION_PROVIDER is not set or has an unrecognised value; "
            "set it to 'brevo' in production."
        )


class BrevoProvider:
    """Sends mail via Brevo API v3 using httpx. delivers=True."""

    delivers: bool = True

    def __init__(
        self,
        api_key: str,
        from_email: str,
        from_name: str,
        *,
        _http_client: Optional[httpx.Client] = None,
    ) -> None:
        self._api_key = api_key
        self._from_email = from_email
        self._from_name = from_name
        self._client: httpx.Client = _http_client or httpx.Client(timeout=5.0)

    def send(self, message: MailMessage) -> None:
        to_entry: dict = {"email": message.to_email}
        payload: dict = {
            "sender": {"email": self._from_email, "name": message.sender_name or self._from_name},
            "to": [to_entry],
            "subject": message.subject,
            "htmlContent": message.html_content,
        }
        if message.reply_to:
            payload["replyTo"] = {"email": message.reply_to}

        resp = self._client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": self._api_key, "Content-Type": "application/json"},
            json=payload,
        )
        resp.raise_for_status()


class RecipientGuardProvider:
    """Outside production: deliver only to explicitly allowed test recipients."""

    def __init__(self, inner: MailProvider, allowed: list[str], app_env: str) -> None:
        self._inner = inner
        self._allowed = [entry.strip().lower() for entry in allowed if entry.strip()]
        self._app_env = app_env
        self.delivers = getattr(inner, "delivers", True)

    def is_allowed(self, email: str) -> bool:
        address = (email or "").strip().lower()
        if "@" not in address:
            return False
        domain = "@" + address.rsplit("@", 1)[1]
        return any(entry == address or (entry.startswith("@") and entry == domain) for entry in self._allowed)

    def send(self, message: MailMessage) -> None:
        if not self.is_allowed(message.to_email):
            # No address in the log: recipients may be real parents (PII).
            logger.warning(
                "Mail blocked by non-production recipient guard (APP_ENV=%s)", self._app_env
            )
            raise RuntimeError(
                "Blocked outside production: recipient not in NOTIFICATION_ALLOWED_RECIPIENTS"
            )
        self._inner.send(message)


def _allowed_recipients() -> list[str]:
    return (os.getenv("NOTIFICATION_ALLOWED_RECIPIENTS") or "").split(",")


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


def _app_env() -> str:
    """Same source as the app: process env first, else Settings (reads .env)."""
    value = os.getenv("APP_ENV")
    if not value:
        try:
            from ..config import get_settings

            value = get_settings().app_env
        except Exception:  # settings incomplete (e.g. isolated tests)
            value = "local"
    return (value or "local").lower()


def _build_provider() -> MailProvider:
    value = (os.getenv("NOTIFICATION_PROVIDER") or "").lower()
    if value == "brevo":
        brevo = BrevoProvider(
            api_key=os.getenv("BREVO_API_KEY", ""),
            from_email=os.getenv("NOTIFICATION_FROM_EMAIL", "noreply@campspilot.app"),
            from_name=os.getenv("NOTIFICATION_FROM_NAME", "CampsPilot"),
        )
        app_env = _app_env()
        if app_env != "production":
            return RecipientGuardProvider(brevo, _allowed_recipients(), app_env)
        return brevo
    if value == "fake":
        return FakeProvider()
    app_env = _app_env()
    if app_env in ("local", "test"):
        logger.warning(
            "NOTIFICATION_PROVIDER is %r — no mail will be sent in %s environment",
            os.getenv("NOTIFICATION_PROVIDER"),
            app_env,
        )
        return _LocalUnconfiguredProvider()
    logger.error(
        "NOTIFICATION_PROVIDER is %r — mail rejected; set it to 'brevo' in production",
        os.getenv("NOTIFICATION_PROVIDER"),
    )
    return _ProdUnconfiguredProvider()
