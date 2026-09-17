"""
Central settings for the CampsPilot SaaS API.

Independent of backend/'s os.environ[...] + load_dotenv() approach — uses
pydantic-settings so a missing/invalid essential variable fails startup with
one clear, readable error instead of a bare KeyError.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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

    @field_validator("database_url")
    @classmethod
    def _database_url_not_blank(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("DATABASE_URL must not be blank")
        return value


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
