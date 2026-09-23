"""
Shared test-auth helpers (feat/platform-foundation). Tests authenticate by
overriding app.auth_deps.get_auth_context via FastAPI's
app.dependency_overrides instead of a real Supabase bearer token — no test
in this suite ever contacts Supabase Auth, matching the rest of this
suite's "no real external service, ever" discipline (see conftest.py's
_no_real_db_pool for the DB equivalent).

tests/conftest.py's autouse _clear_auth_dependency_overrides fixture clears
the override after every test, so a test calling one of these never leaks
its identity into the next test.
"""

from __future__ import annotations

from app.auth_deps import AuthContext, get_auth_context
from app.main import app

_FAKE_HEADERS = {"Authorization": "Bearer test-token-not-verified-see-dependency-override"}


def owner_headers(user_id: str = "owner-1", email: str = "owner@example.com") -> dict:
    """Authenticates the next request(s) in this test as a platform_owner."""
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id=user_id, email=email, is_owner=True, admin_organization_ids=set()
    )
    return dict(_FAKE_HEADERS)


def org_admin_headers(
    organization_id: str, user_id: str = "org-admin-1", email: str = "org-admin@example.com"
) -> dict:
    """Authenticates the next request(s) in this test as an org_admin for
    exactly `organization_id` (and nothing else)."""
    app.dependency_overrides[get_auth_context] = lambda: AuthContext(
        user_id=user_id, email=email, is_owner=False, admin_organization_ids={str(organization_id)}
    )
    return dict(_FAKE_HEADERS)
