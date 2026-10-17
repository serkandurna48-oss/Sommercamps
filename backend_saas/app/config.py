"""
Central settings for the CampsPilot SaaS API.

Independent of backend/'s os.environ[...] + load_dotenv() approach — uses
pydantic-settings so a missing/invalid essential variable fails startup with
one clear, readable error instead of a bare KeyError.
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Matches Supabase's connection-string template placeholder, e.g.
# "[YOUR-PASSWORD]" — copied verbatim instead of being replaced with the
# real password. Case-insensitive, tolerant of spaces/hyphens/underscores
# inside the brackets (covers "[YOUR PASSWORD]", "[your_password]", etc.).
_PLACEHOLDER_PASSWORD_RE = re.compile(r"\[[a-z0-9 _-]*password[a-z0-9 _-]*\]", re.IGNORECASE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="CampsPilot SaaS API", alias="APP_NAME")
    app_env: str = Field(default="development", alias="APP_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # No default on purpose — every environment (local, cloud) must set this
    # explicitly. No KSV-specific fallback exists or should ever be added here.
    database_url: str = Field(alias="DATABASE_URL")

    # Comma-separated extra allowed CORS origins (e.g. a real Vercel frontend
    # URL, once one exists) — same convention as backend/main.py's
    # CORS_ORIGINS_EXTRA, kept separate from that KSV variable (different
    # Render service, different env var namespace). Empty by default: no
    # frontend is wired up yet (see README.md "CORS").
    cors_origins_extra: str = Field(default="", alias="CORS_ORIGINS_EXTRA")

    # Platform accounts (see app/supabase_auth.py). Replaces the previous
    # single-password ADMIN_PASSWORD/JWT_SECRET scheme (feat/platform-
    # foundation) — every admin request now carries a real Supabase Auth
    # access token, verified against this project's own Supabase instance.
    # Required at boot: every admin request needs these to verify who's
    # calling. Get them from Supabase Dashboard → Settings → API, for the
    # "CampsPilot SaaS" project (ref wkmckfbzhmihyfwiekct) — never KSV's or
    # JK's Supabase project.
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_anon_key: str = Field(alias="SUPABASE_ANON_KEY")
    # Only needed for user-management actions (creating the first
    # platform_owner, looking a user up by email to assign them as an
    # org_admin) — NOT for verifying a request's token, so a missing value
    # here degrades only those specific endpoints (they return a clear 503),
    # not the whole app's ability to boot and serve already-authenticated
    # requests. Never expose this key to the frontend — full-DB-bypass
    # power, unlike supabase_anon_key.
    supabase_service_role_key: Optional[str] = Field(default=None, alias="SUPABASE_SERVICE_ROLE_KEY")

    @field_validator("database_url")
    @classmethod
    def _database_url_not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("DATABASE_URL must not be blank")
        if _PLACEHOLDER_PASSWORD_RE.search(value):
            # Without this check, a URL like postgresql://postgres:[YOUR-
            # PASSWORD]@host/... fails much later, inside urllib.parse.urlsplit
            # (app/db.py::_dsn_with_sslmode), with a cryptic
            # "'<host>' does not appear to be an IPv4 or IPv6 address" —
            # caused by the literal '[...]' confusing netloc parsing, not by
            # anything IPv6-related. Caught here instead, at startup, with an
            # actionable message pointing at the actual mistake.
            raise ValueError(
                "DATABASE_URL still contains a Supabase placeholder like "
                "'[YOUR-PASSWORD]' instead of the real password. Copy the "
                "connection string again from Supabase Dashboard → Settings → "
                "Database and replace the bracketed placeholder with the "
                "actual database password."
            )
        return value

    @property
    def cors_origins(self) -> list[str]:
        """
        Local Next.js dev convention (http://localhost:3000) plus whatever
        CORS_ORIGINS_EXTRA adds — never a wildcard. See README.md "CORS" for
        why: this API has no cookie/credentialed auth today, so a wildcard
        wouldn't be an immediate credential-leak risk, but the ticket that
        adds one is exactly the ticket that must revisit this, not silently
        inherit a wildcard from Day 1.
        """
        origins = ["http://localhost:3000"]
        origins.extend(o.strip() for o in self.cors_origins_extra.split(",") if o.strip())
        return origins


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings singleton. Called eagerly at import time (see main.py) so
    a misconfigured deployment fails immediately with a readable message,
    rather than on the first incoming request.
    """
    try:
        return Settings()
    except Exception as exc:
        raise RuntimeError(
            "CampsPilot SaaS API failed to start: missing or invalid configuration. "
            "Copy backend_saas/.env.example to backend_saas/.env and fill in real "
            f"values. Details: {exc}"
        ) from exc
