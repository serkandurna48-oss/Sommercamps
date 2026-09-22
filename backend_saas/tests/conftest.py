"""
Sets a fake-but-well-formed DATABASE_URL (and other required settings)
before any test module imports app.main — so Settings() validation
succeeds without a real .env file. No test in this suite needs a real
database: db.get_cursor is monkeypatched per-test as needed, and
db.init_pool/close_pool are no-op'd for every test below (see
_no_real_db_pool) so importing/booting the app never opens a real
connection. This value is intentionally never a real, reachable database
and must never point at KSV or a real Supabase project.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test_db")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("APP_NAME", "CampsPilot SaaS API (test)")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-a-real-one-but-32-bytes-plus")

import pytest

from app import db


@pytest.fixture(autouse=True)
def _no_real_db_pool(monkeypatch):
    """
    Every test in this suite uses TestClient(app) as a context manager at
    most, which runs the FastAPI lifespan (db.init_pool/close_pool) even
    for tests that have nothing to do with the database. Without this,
    every such test would attempt a real connection to the fake
    DATABASE_URL above and fail. Tests that care about DB behavior
    monkeypatch db.get_cursor themselves on top of this.
    """
    monkeypatch.setattr(db, "init_pool", lambda: None)
    monkeypatch.setattr(db, "close_pool", lambda: None)
