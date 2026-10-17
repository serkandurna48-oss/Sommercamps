"""Independent local review probes. Synthetic data only; all network is blocked.

Run with backend_saas/venv Python from the repository root. XFAIL means the
desired acceptance criterion is currently violated; XPASS requires re-review.
"""
import asyncio
import importlib
import logging
import os
import socket
import sys
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend_saas"))
os.environ.update(DATABASE_URL="postgresql://review:review@127.0.0.1:1/review",
                  ADMIN_PASSWORD="test-admin-password",
                  JWT_SECRET="test-jwt-secret-not-a-real-one-but-32-bytes-plus",
                  APP_ENV="test", STRIPE_SECRET_KEY="", BREVO_API_KEY="", EMAIL_FROM="")


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Review probes must never connect to a network")
    monkeypatch.setattr(socket.socket, "connect", blocked)
    import psycopg2
    monkeypatch.setattr(psycopg2, "connect", blocked)


@pytest.fixture
def legacy(monkeypatch):
    sys.path.insert(0, str(ROOT / "backend"))
    module = importlib.import_module("main")
    monkeypatch.setattr(module, "STRIPE_SECRET_KEY", "synthetic-review-key")
    monkeypatch.setattr(module, "STRIPE_WEBHOOK_SECRET", "synthetic-review-webhook")
    monkeypatch.setattr(module, "STRIPE_PRICE_CENTS", 100)
    return module


@pytest.mark.xfail(strict=True, reason="CP-R001: DB failure is acknowledged with HTTP 200")
def test_payment_webhook_db_failure_is_retryable(legacy, monkeypatch):
    @contextmanager
    def unavailable():
        raise RuntimeError("synthetic-database-outage")
        yield
    session = SimpleNamespace(id="review-session", metadata={"registration_id": str(uuid4())})
    monkeypatch.setattr(legacy, "db_cursor", unavailable)
    monkeypatch.setattr(legacy.stripe.Webhook, "construct_event",
                        lambda *a: {"type": "checkout.session.completed", "data": {"object": session}})
    class Request:
        headers = {"stripe-signature": "synthetic"}
        async def body(self):
            return b"synthetic event"
    response = asyncio.run(legacy.stripe_webhook(Request()))
    assert response.status_code >= 500


@pytest.mark.xfail(strict=True, reason="CP-R006: paid registration still creates a checkout")
def test_paid_registration_never_creates_new_checkout(legacy, monkeypatch):
    calls = []
    row = {"id": str(uuid4()), "payment_status": "paid", "status": "confirmed",
           "child_first_name": "Synthetic", "child_last_name": "Review"}
    class Cursor:
        def execute(self, *a):
            pass
        def fetchone(self):
            return row
    @contextmanager
    def cursor():
        yield Cursor()
    def checkout(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(id="review-session", url="https://example.invalid/checkout")
    monkeypatch.setattr(legacy, "db_cursor", cursor)
    monkeypatch.setattr(legacy.stripe.checkout.Session, "create", checkout)
    from fastapi import HTTPException
    try:
        legacy.create_checkout_session(str(uuid4()))
    except HTTPException:
        pass
    assert calls == []


@pytest.mark.xfail(strict=True, reason="CP-R002: exception detail containing a row enters logs")
def test_registration_errors_do_not_log_row_details(monkeypatch, caplog):
    from app.routers import registrations as router
    from app.schemas import RegistrationCreate
    from app.tenancy import TenantContext
    tenant = TenantContext(uuid4(), "review", "Synthetic Review", "active")
    data = RegistrationCreate(parent_first_name="Synthetic", parent_last_name="Parent",
        parent_email="review@example.com", parent_phone="000", child_first_name="Synthetic",
        child_last_name="Child", child_birth_date=date(2019, 1, 1),
        terms_accepted=True, privacy_accepted=True)
    repo = router.registrations_repo
    monkeypatch.setattr(repo, "get_registration_target", lambda *a: object())
    monkeypatch.setattr(repo, "validate_registration_window", lambda *a: None)
    monkeypatch.setattr(repo, "validate_child_age", lambda *a: None)
    def fail(*a):
        raise RuntimeError("DETAIL: Failing row contains (SYNTHETIC_CHILD_MEDICAL_SENTINEL)")
    monkeypatch.setattr(repo, "create_registration", fail)
    from fastapi import HTTPException
    with caplog.at_level(logging.ERROR), pytest.raises(HTTPException):
        router.create_registration("review-camp", data, tenant)
    assert "SYNTHETIC_CHILD_MEDICAL_SENTINEL" not in caplog.text


@pytest.mark.xfail(strict=True, reason="CP-R005: configured website content is dropped by public schema")
def test_public_org_preserves_configured_website_content():
    from app.schemas import OrganizationPublic
    result = OrganizationPublic.model_validate({"slug": "review", "name": "Review",
        "contact_email": "review@example.com", "intro_heading": "Review heading",
        "intro_text": "Review introduction", "hero_image_url": "/review.webp"}).model_dump()
    assert result.get("intro_heading") == "Review heading"
    assert result.get("intro_text") == "Review introduction"
    assert result.get("hero_image_url") == "/review.webp"
