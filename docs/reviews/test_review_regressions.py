"""Independent offline regression evidence; strict xfail = unresolved defect.
Run in backend_saas: venv/Scripts/python.exe -m pytest ../docs/reviews/test_review_regressions.py -q -rx
"""
import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend_saas"))
os.environ.update(DATABASE_URL="postgresql://test:test@127.0.0.1:5432/test_db", APP_ENV="test",
                  ADMIN_PASSWORD="test-admin-password", JWT_SECRET="test-jwt-secret-not-a-real-one-but-32-bytes-plus")

from app.schemas import OrganizationPublic


@pytest.mark.xfail(strict=True, reason="CAMP-001: saved website content is discarded by public response model")
def test_public_organization_preserves_saved_website_content():
    stored = dict(slug="review-club", name="Review Club", contact_email="review@example.test",
                  intro_heading="Synthetic heading", intro_text="Synthetic introduction",
                  hero_image_url="https://example.test/hero.webp")
    public = OrganizationPublic.model_validate(stored).model_dump()
    assert all(public.get(key) == stored[key] for key in ("intro_heading", "intro_text", "hero_image_url"))
