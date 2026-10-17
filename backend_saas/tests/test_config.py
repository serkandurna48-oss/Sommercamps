from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def _settings(**overrides) -> Settings:
    base = {"database_url": "postgresql://test:test@127.0.0.1:5432/test_db"}
    base.update(overrides)
    return Settings(**base)


@pytest.mark.parametrize(
    "database_url",
    [
        "postgresql://postgres:[YOUR-PASSWORD]@db.example.supabase.co:5432/postgres",
        "postgresql://postgres:[your-password]@db.example.supabase.co:5432/postgres",
        "postgresql://postgres:[YOUR PASSWORD]@db.example.supabase.co:5432/postgres",
    ],
)
def test_database_url_rejects_supabase_placeholder_password(database_url):
    """
    A real-world deploy hit this exact mistake (CP-S407): the Supabase
    dashboard's connection-string template shows a literal bracketed
    placeholder for the password, easy to copy as-is. Left unchecked, it
    fails much later with a cryptic urllib "not an IPv4 or IPv6 address"
    error (see app/db.py) instead of an actionable one here.
    """
    with pytest.raises(ValidationError, match="placeholder"):
        Settings(database_url=database_url)


def test_database_url_with_real_bracket_free_password_is_accepted():
    Settings(database_url="postgresql://postgres:s0meRealPassw0rd@db.example.supabase.co:5432/postgres")


def test_cors_origins_defaults_to_local_dev_only():
    assert _settings().cors_origins == ["http://localhost:3000"]


def test_cors_origins_never_includes_wildcard_by_default():
    assert "*" not in _settings().cors_origins


def test_cors_origins_extra_appends_additional_origins():
    settings = _settings(cors_origins_extra="https://campspilot.vercel.app")
    assert settings.cors_origins == ["http://localhost:3000", "https://campspilot.vercel.app"]


def test_cors_origins_extra_supports_multiple_comma_separated_origins():
    settings = _settings(
        cors_origins_extra="https://a.example.com, https://b.example.com,https://c.example.com"
    )
    assert settings.cors_origins == [
        "http://localhost:3000",
        "https://a.example.com",
        "https://b.example.com",
        "https://c.example.com",
    ]


def test_cors_origins_extra_ignores_blank_entries():
    settings = _settings(cors_origins_extra=" , https://a.example.com, ,")
    assert settings.cors_origins == ["http://localhost:3000", "https://a.example.com"]
