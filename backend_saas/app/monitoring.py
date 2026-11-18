"""Error monitoring (Sentry) without personal data.

This API processes children's data (GDPR Art. 9). Sentry must only ever see
technical facts: exception type, stack frames (file, function, line), HTTP
method, route and status. Everything that can carry form content is removed
here, in addition to the SDK switches set in init_sentry():

- request bodies, cookies, query strings and all but two harmless headers
- local variables of stack frames
- exception messages (database errors such as "Failing row contains (...)"
  quote whole rows, so the text is dropped and only the type is kept)
- user context, extra data, tags and all breadcrumbs (log lines and outgoing
  HTTP calls become breadcrumbs, and those quote mail addresses and IPs)
- the text of logged errors, unless it is a %-template whose values were removed
- UUIDs (registration tokens) and mail addresses in any remaining text

No tracing, no trace headers on outgoing calls, no session counting. Only the
integrations listed in build_options() run.

Sentry stays off without SENTRY_DSN and always in APP_ENV=test.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from .log_redact import UUID_RE

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_ALLOWED_HEADERS = {"user-agent", "content-type"}
_MAX_TEXT = 300
REMOVED = "[removed]"


def mask_text(value: str) -> str:
    """Replaces UUIDs and mail addresses and caps the length."""
    masked = EMAIL_RE.sub("[mail]", UUID_RE.sub("[id]", value))
    return masked if len(masked) <= _MAX_TEXT else masked[:_MAX_TEXT] + "…"


def _strip_url(url: str) -> str:
    return mask_text(url.split("?", 1)[0].split("#", 1)[0])


def _scrub_frames(stacktrace: Any) -> None:
    if not isinstance(stacktrace, dict):
        return
    for frame in stacktrace.get("frames") or []:
        if isinstance(frame, dict):
            # Local variables and source context can hold request models.
            for key in ("vars", "pre_context", "context_line", "post_context"):
                frame.pop(key, None)


def scrub_event(event: dict, hint: Optional[dict] = None) -> Optional[dict]:
    """before_send hook. Returns the event reduced to technical facts."""
    try:
        request = event.get("request")
        if isinstance(request, dict):
            for key in ("data", "cookies", "query_string", "env"):
                request.pop(key, None)
            headers = request.get("headers")
            if isinstance(headers, dict):
                request["headers"] = {
                    k: mask_text(str(v)) for k, v in headers.items() if str(k).lower() in _ALLOWED_HEADERS
                }
            if isinstance(request.get("url"), str):
                request["url"] = _strip_url(request["url"])

        for key in ("user", "extra", "tags", "breadcrumbs"):
            event.pop(key, None)

        for values_key in ("exception", "threads"):
            container = event.get(values_key)
            for item in (container.get("values") if isinstance(container, dict) else None) or []:
                if not isinstance(item, dict):
                    continue
                if values_key == "exception":
                    item["value"] = REMOVED
                _scrub_frames(item.get("stacktrace"))

        if isinstance(event.get("transaction"), str):
            event["transaction"] = mask_text(event["transaction"])
        if isinstance(event.get("message"), str):
            event["message"] = REMOVED
        logentry = event.get("logentry")
        if isinstance(logentry, dict):
            # Kept only for our own loggers (app.*) and only when it is a
            # %-template whose values were removed. Already-formatted text and
            # third-party loggers may quote anything, so their text is dropped.
            own = str(event.get("logger") or "").split(".")[0] == "app"
            template = logentry.get("message") if own and logentry.get("params") else None
            event["logentry"] = {"message": mask_text(template) if isinstance(template, str) else REMOVED}
        return event
    except Exception:  # noqa: BLE001 - never send an event that could not be cleaned
        return None


def drop_breadcrumb(crumb: dict, hint: Optional[dict] = None) -> None:
    """before_breadcrumb hook: the backend records no breadcrumbs at all."""
    return None


def build_options(dsn: str, environment: str, release: Optional[str]) -> dict:
    """All privacy switches in one place; tests initialise the SDK with exactly these."""
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    return dict(
        dsn=dsn,
        environment=environment,
        release=release,
        send_default_pii=False,
        include_local_variables=False,
        include_source_context=False,
        max_request_body_size="never",
        max_breadcrumbs=0,
        auto_session_tracking=False,
        # No tracing: no sample rate, and no sentry-trace/baggage headers on
        # outgoing calls (Supabase, Brevo, Stripe).
        trace_propagation_targets=[],
        # Explicit list instead of whatever the SDK version auto-detects.
        auto_enabling_integrations=False,
        integrations=[
            StarletteIntegration(),
            FastApiIntegration(),
            # logger.error(...) becomes an event; lower levels are not recorded.
            LoggingIntegration(level=None, event_level=logging.ERROR),
        ],
        before_send=scrub_event,
        before_breadcrumb=drop_breadcrumb,
    )


def init_sentry(settings: Any) -> bool:
    """Starts Sentry when a DSN is configured. Returns True if it is active.
    Never raises: a wrong DSN must not stop the API from booting."""
    dsn = (getattr(settings, "sentry_dsn", "") or "").strip()
    if not dsn or settings.app_env.strip().lower() == "test":
        return False
    try:
        import sentry_sdk

        environment = (settings.sentry_environment or settings.app_env).strip().lower()
        sentry_sdk.init(**build_options(dsn, environment, settings.sentry_release or None))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Sentry error monitoring NOT active (%s)", type(exc).__name__)
        return False
    logger.info("Sentry error monitoring active (environment=%s)", environment)
    return True


class SentryTestError(RuntimeError):
    """Raised on purpose by POST /internal/sentry-test to prove delivery."""
