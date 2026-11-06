"""Einwilligung zur internen Trainingsdoku bei Trainingsbuchung (nicht Camps)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from .test_registrations_api import _valid_payload
from .test_review_postgres import local_database, real_db  # noqa: F401
from .test_training_booking import _make, _post, _row, fake_provider  # noqa: F401


@pytest.mark.parametrize("sent,stored", [(True, True), (False, False), (None, False)])
def test_training_booking_stores_consent(real_db, sent, stored):
    _, session = _make(real_db)
    extra = {} if sent is None else {"documentation_consent": sent}
    r = _post(real_db, session, **extra)
    assert r.status_code == 201, r.text
    assert _row(real_db, r.json()["registration_token"])["documentation_consent"] is stored


def test_non_boolean_consent_is_rejected(real_db):
    _, session = _make(real_db)
    assert _post(real_db, session, documentation_consent="ja").status_code == 422


def test_camp_booking_ignores_consent(real_db):
    _, tenant, _ = real_db
    with TestClient(app) as client:
        r = client.post(
            f"/api/v1/organizations/{tenant.slug}/camps/summer-1/registrations",
            json=_valid_payload(child_birth_date="2017-05-10", documentation_consent=True),
        )
    assert r.status_code == 201, r.text
    assert _row(real_db, r.json()["registration_token"])["documentation_consent"] is None


def test_admin_registration_output_exposes_consent(real_db):
    from app.admin_schemas import RegistrationAdminOut
    assert "documentation_consent" in RegistrationAdminOut.model_fields
