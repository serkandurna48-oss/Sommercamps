"""
Sets a fake-but-well-formed DATABASE_URL (and other required settings)
before any test module imports app.main — so Settings() validation
succeeds without a real .env file. No test in this suite needs a real
database: db.get_cursor / db.init_pool / db.close_pool are monkeypatched
per-test instead. This value is intentionally never a real, reachable
database and must never point at KSV or a real Supabase project.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@127.0.0.1:5432/test_db")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")
os.environ.setdefault("APP_NAME", "CampsPilot SaaS API (test)")
