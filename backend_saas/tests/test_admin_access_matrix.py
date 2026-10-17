"""Exercise every admin route's access gate before any data operation."""

import re
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth_deps import AuthContext, get_auth_context
from app.main import app
from app.repositories import organizations
from .test_admin_organizations_api import _org_row


ORG_A = UUID("00000000-0000-4000-8000-000000000001")
ORG_B = UUID("00000000-0000-4000-8000-000000000002")


def admin_requests():
    for template, operations in app.openapi()["paths"].items():
        if not template.startswith("/admin/") or template == "/admin/me":
            continue
        path = template.replace("{organization_slug}", "other-club").replace("{camp_slug}", "summer")
        path = re.sub(r"\{[^}]+\}", "00000000-0000-4000-8000-000000000003", path)
        for method in sorted(set(operations) & {"get", "post", "patch", "delete", "put"}):
            yield pytest.param(method.upper(), path, id=f"{method.upper()} {template}")


ADMIN_REQUESTS = list(admin_requests())
assert ADMIN_REQUESTS, "The access matrix must cover actual admin routes"


@pytest.mark.parametrize(("method", "path"), ADMIN_REQUESTS)
@pytest.mark.parametrize("authenticated", [False, True], ids=["anonymous", "foreign-org-admin"])
def test_admin_routes_deny_before_data_access(monkeypatch, method, path, authenticated):
    monkeypatch.setattr(
        organizations, "get_organization_by_slug",
        lambda slug: _org_row(slug, id=ORG_B, site_published=False),
    )

    def unexpected_database_access():
        raise AssertionError("Denied request must not read or mutate business data")

    monkeypatch.setattr(db, "get_cursor", unexpected_database_access)
    if authenticated:
        app.dependency_overrides[get_auth_context] = lambda: AuthContext(
            user_id="review-admin-a", email=None, is_owner=False, admin_organization_ids={str(ORG_A)}
        )

    with TestClient(app) as client:
        response = client.request(method, path, json={} if method in {"POST", "PATCH"} else None)

    assert response.status_code == (403 if authenticated else 401)
