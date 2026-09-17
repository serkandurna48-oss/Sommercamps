from __future__ import annotations

from app.config import Settings


def _settings(**overrides) -> Settings:
    base = {"database_url": "postgresql://test:test@127.0.0.1:5432/test_db"}
    base.update(overrides)
    return Settings(**base)


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
