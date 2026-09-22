from __future__ import annotations

import jwt
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


def _token() -> str:
    with TestClient(app) as client:
        response = client.post("/admin/login", json={"password": "test-admin-password"})
    assert response.status_code == 200
    return response.json()["token"]


def test_login_correct_password_returns_token():
    with TestClient(app) as client:
        response = client.post("/admin/login", json={"password": "test-admin-password"})

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["token"], str) and body["token"]
    assert body["expires_in_hours"] == get_settings().token_expire_hours


def test_login_wrong_password_returns_401():
    with TestClient(app) as client:
        response = client.post("/admin/login", json={"password": "not-the-password"})

    assert response.status_code == 401


def test_protected_route_without_token_returns_401():
    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations",
            json={"slug": "demo-fc", "name": "Demo FC", "contact_email": "demo@example.com"},
        )

    assert response.status_code == 401


def test_protected_route_with_invalid_token_returns_401():
    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations",
            json={"slug": "demo-fc", "name": "Demo FC", "contact_email": "demo@example.com"},
            headers={"Authorization": "Bearer not-a-real-token"},
        )

    assert response.status_code == 401


def test_protected_route_with_expired_token_returns_401(monkeypatch):
    import datetime

    settings = get_settings()
    expired = jwt.encode(
        {
            "sub": "platform_admin",
            "iat": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=2),
            "exp": datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )

    with TestClient(app) as client:
        response = client.post(
            "/admin/organizations",
            json={"slug": "demo-fc", "name": "Demo FC", "contact_email": "demo@example.com"},
            headers={"Authorization": f"Bearer {expired}"},
        )

    assert response.status_code == 401
