"""Replay publication changes after public tenant resolution, without a database."""

from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.repositories import organizations, registrations
from .test_registrations_api import _fake_created_row, _org_row, _target, _valid_payload


@pytest.mark.parametrize(
    ("published", "plan_status", "expected_status"),
    [(False, "active", 404), (True, "suspended", 404), (True, "cancelled", 404),
     (True, "active", 201), (True, "pilot", 201)],
)
def test_registration_rechecks_organization_after_tenant_resolution(
    monkeypatch, published, plan_status, expected_status
):
    organization = _org_row("review-club")
    camp = _target(organization_id=organization["id"])
    statements = []

    def resolve_camp(tenant, slug):
        # The public dependency has already accepted the original state.
        # An admin commits a publication/plan change before registration writes.
        organization.update(site_published=published, plan_status=plan_status)
        return camp

    class Cursor:
        def execute(self, query, params):
            normalized = " ".join(query.lower().split())
            statements.append(normalized)
            if "from organizations" in normalized:
                self.result = dict(organization)
            elif "from camps" in normalized:
                self.result = {"capacity": 20, "status": "published"}
            elif "lower(child_first_name)" in normalized:
                self.result = None
            elif "count(*)" in normalized:
                self.result = {"active_count": 0}
            elif "insert into camp_registrations" in normalized:
                self.result = _fake_created_row()
            else:
                raise AssertionError(f"Unexpected SQL: {normalized}")

        def fetchone(self):
            return self.result

    @contextmanager
    def cursor():
        yield Cursor()

    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: dict(organization))
    monkeypatch.setattr(registrations, "get_registration_target", resolve_camp)
    monkeypatch.setattr(db, "get_cursor", cursor)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/organizations/review-club/camps/summer-1/registrations",
            json=_valid_payload(),
        )

    assert response.status_code == expected_status
    if expected_status == 404:
        assert response.json() == {"detail": "Organization not found"}
        assert not any("insert into" in sql for sql in statements)
    else:
        assert response.json()["status"] == "registered"
