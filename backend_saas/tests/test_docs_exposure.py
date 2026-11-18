"""Finding 5 (18.11.2026): /docs and /openapi.json were public on production."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

PATHS = ("/docs", "/redoc", "/openapi.json")


def _client(app_env: str) -> TestClient:
    settings = SimpleNamespace(app_name="t", api_docs_enabled=lambda: Settings.api_docs_enabled(SimpleNamespace(app_env=app_env)))
    return TestClient(create_app(settings))  # no `with`: the lifespan (DB pool) must not start


@pytest.mark.parametrize("app_env", ["production", "Production", " prod "])
def test_api_docs_are_not_served_in_production(app_env):
    client = _client(app_env)
    for path in PATHS:
        assert client.get(path).status_code == 404, path


@pytest.mark.parametrize("app_env", ["staging", "local", "test"])
def test_api_docs_stay_available_outside_production(app_env):
    client = _client(app_env)
    for path in PATHS:
        assert client.get(path).status_code == 200, path


def test_the_running_app_follows_its_own_environment():
    from app.main import app, settings

    assert (app.openapi_url is not None) is settings.api_docs_enabled()
