from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import db
from app.main import app


def test_health_ok_when_database_reachable(monkeypatch):
    @contextmanager
    def fake_get_cursor():
        yield MagicMock()

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["service"] == "campspilot-saas-api"
    assert body["env"]  # non-empty string, value comes from APP_ENV (default: "local")


def test_health_returns_503_when_database_unreachable(monkeypatch):
    @contextmanager
    def failing_get_cursor():
        # Deliberately includes connection-string-shaped text to prove it
        # never reaches the client.
        raise RuntimeError("connection to server failed: postgresql://user:s3cr3t@host/db")
        yield  # pragma: no cover

    monkeypatch.setattr(db, "get_cursor", failing_get_cursor)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "error"
    assert body["database"] == "unreachable"


def test_health_reports_app_env(monkeypatch):
    @contextmanager
    def fake_get_cursor():
        yield MagicMock()

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)

    from app import main as app_main
    from app.config import Settings
    monkeypatch.setattr(app_main, "settings", Settings.model_construct(
        app_env="test-staging", app_name="CampsPilot SaaS API"
    ))

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["env"] == "test-staging"


def test_health_response_never_leaks_connection_details(monkeypatch):
    @contextmanager
    def failing_get_cursor():
        raise RuntimeError("connection to server failed: postgresql://user:s3cr3t@host/db")
        yield  # pragma: no cover

    monkeypatch.setattr(db, "get_cursor", failing_get_cursor)

    with TestClient(app) as client:
        response = client.get("/health")

    assert "postgresql://" not in response.text
    assert "s3cr3t" not in response.text
