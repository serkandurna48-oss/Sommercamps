"""In-memory sliding-window rate limiting and client-IP resolution.

Single-process only (Render runs one uvicorn worker). A shared store such as
Redis is needed once the API runs with several instances.

Client IP sources, first match wins:
  1. TRUSTED_CLIENT_IP_HEADER (e.g. "true-client-ip"): a header the edge proxy
     overwrites, so the client cannot forge it.
  2. TRUSTED_PROXY_HOPS=n > 0: the n-th entry from the end of X-Forwarded-For.
  3. request.client.host. Behind a proxy this is the proxy's address, shared by
     every visitor, so it only counts as trusted in local/test/development.

Env vars are read at call time so tests can use monkeypatch.setenv.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Optional

from fastapi import Request

logger = logging.getLogger(__name__)

_LOCAL_ENVS = frozenset({"local", "test", "development"})
_warned_untrusted = False


def _proxy_hops() -> int:
    try:
        return int(os.environ.get("TRUSTED_PROXY_HOPS", "0") or "0")
    except (TypeError, ValueError):
        return 0


def resolve_client_ip(request: Request) -> tuple[str, bool]:
    """Returns (ip, trusted). `trusted` is False when the value may be a shared
    proxy address, i.e. limiting on it could block unrelated visitors."""
    header = (os.environ.get("TRUSTED_CLIENT_IP_HEADER") or "").strip().lower()
    if header:
        value = (request.headers.get(header) or "").strip()
        if value:
            return value, True
    hops = _proxy_hops()
    if hops > 0:
        xff = request.headers.get("x-forwarded-for", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops], True
    host = request.client.host if request.client else "unknown"
    app_env = (os.environ.get("APP_ENV") or "local").strip().lower()
    return host, app_env in _LOCAL_ENVS


def trusted_client_ip(request: Request) -> Optional[str]:
    """Client IP for limits that must never hit unrelated visitors.
    Returns None (do not limit) when no trusted source is configured."""
    global _warned_untrusted
    ip, trusted = resolve_client_ip(request)
    if trusted:
        return ip
    if not _warned_untrusted:
        _warned_untrusted = True
        logger.warning(
            "Client IP rate limit inactive: set TRUSTED_CLIENT_IP_HEADER or TRUSTED_PROXY_HOPS"
        )
    return None


class SlidingWindowLimiter:
    def __init__(self, max_hits: int, window_seconds: float) -> None:
        self.max_hits = max_hits
        self.window = window_seconds
        self._lock = threading.Lock()
        self._hits: dict[str, list[float]] = {}

    def allow(self, key: str) -> bool:
        """True if `key` may proceed (and records the hit), False if over the limit."""
        now = time.time()
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if now - t < self.window]
            if len(hits) >= self.max_hits:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            # Keep memory bounded: drop keys whose hits have all expired.
            if len(self._hits) > 10_000:
                self._hits = {k: v for k, v in self._hits.items() if v and now - v[-1] < self.window}
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


def _registration_limit() -> int:
    try:
        return max(1, int(os.environ.get("REGISTRATION_RATE_LIMIT_PER_HOUR", "30") or "30"))
    except (TypeError, ValueError):
        return 30


registration_limiter = SlidingWindowLimiter(_registration_limit(), 3600.0)
