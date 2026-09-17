from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app import db
from app.main import app


def test_health_ok_when_database_reachable(monkeypatch):
    monkeypatch.setattr(db, "init_pool", lambda: None)
    monkeypatch.setattr(db, "close_pool", lambda: None)

    @contextmanager
    def fake_get_cursor():
        yield MagicMock()

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "database": "ok",
        "service": "campspilot-saas-api",
    }


def test_health_returns_503_when_database_unreachable(monkeypatch):
    monkeypatch.setattr(db, "init_pool", lambda: None)
    monkeypatch.setattr(db, "close_pool", lambda: None)

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


def test_health_response_never_leaks_connection_details(monkeypatch):
    monkeypatch.setattr(db, "init_pool", lambda: None)
    monkeypatch.setattr(db, "close_pool", lambda: None)

    @contextmanager
    def failing_get_cursor():
        raise RuntimeError("connection to server failed: postgresql://user:s3cr3t@host/db")
        yield  # pragma: no cover

    monkeypatch.setattr(db, "get_cursor", failing_get_cursor)

    with TestClient(app) as client:
        response = client.get("/health")

    assert "postgresql://" not in response.text
    assert "s3cr3t" not in response.text
