"""Owner adds a club admin by email: invite for new addresses, notice for existing accounts."""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import supabase_auth
from app.main import app
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.repositories import organizations, platform_roles

from .auth_helpers import org_admin_headers, owner_headers

ORG = {"id": uuid4(), "slug": "demo-fc", "name": "Demo FC", "plan_status": "pilot"}


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: ORG)
    added, audits, links = [], [], []
    monkeypatch.setattr(
        platform_roles,
        "add_organization_member",
        lambda org_id, user_id, role="org_admin": added.append(user_id) or {
            "id": uuid4(), "organization_id": org_id, "user_id": user_id,
            "role": role, "created_at": "2026-10-29T10:00:00Z",
        },
    )
    monkeypatch.setattr(platform_roles, "write_audit_log", lambda **kw: audits.append(kw))

    def link(email, *, org_slug=None, redirect_to=None, link_type="signup"):
        links.append((email, redirect_to, link_type))
        return "https://auth.example/verify?token=t&type=recovery"

    monkeypatch.setattr(supabase_auth, "generate_confirmation_link", link)
    fake = FakeProvider()
    fake.delivers = True
    reset_provider_for_testing(fake)
    yield {"added": added, "audits": audits, "links": links, "fake": fake, "mp": monkeypatch}
    reset_provider_for_testing(None)


def _post(client, email="neu@example.com", headers=None):
    return client.post(
        f"/admin/organizations/{ORG['slug']}/members", json={"email": email}, headers=headers or owner_headers()
    )


def test_unknown_email_creates_confirmed_account_and_sends_invite(env):
    created = []
    env["mp"].setattr(supabase_auth, "find_user_by_email", lambda email: None)

    def create(email, password, *, email_confirmed=False):
        created.append((email, len(password), email_confirmed))
        return supabase_auth.SupabaseUser(id="u-new", email=email)

    env["mp"].setattr(supabase_auth, "create_user", create)
    with TestClient(app) as client:
        response = _post(client)

    assert response.status_code == 201
    body = response.json()
    assert body["invited"] is True and body["invite_mail_sent"] is True
    assert created == [("neu@example.com", 43, True)]
    assert env["added"] == ["u-new"]
    assert env["links"] == [("neu@example.com", "http://localhost:3000/pilot/demo-fc/neues-passwort", "recovery")]
    mail = env["fake"].sent[0]
    assert mail.to_email == "neu@example.com"
    assert mail.subject == "Einladung: Demo FC auf CampsPilot verwalten"
    assert "Passwort festlegen" in mail.html_content
    assert env["audits"][0]["action"] == "organization.member_invited"


def test_existing_account_is_assigned_and_gets_login_link(env):
    env["mp"].setattr(
        supabase_auth, "find_user_by_email", lambda email: supabase_auth.SupabaseUser(id="u-old", email=email)
    )
    env["mp"].setattr(supabase_auth, "create_user", lambda *a, **k: pytest.fail("must not create"))
    with TestClient(app) as client:
        response = _post(client, "alt@example.com")

    assert response.status_code == 201
    assert response.json()["invited"] is False
    assert env["links"] == []
    mail = env["fake"].sent[0]
    assert mail.subject == "Sie verwalten jetzt Demo FC auf CampsPilot"
    assert "/pilot/demo-fc/login" in mail.html_content
    assert env["audits"][0]["action"] == "organization.member_assigned"


def test_concurrent_creation_falls_back_to_existing_account(env):
    lookups = iter([None, supabase_auth.SupabaseUser(id="u-race", email="neu@example.com")])
    env["mp"].setattr(supabase_auth, "find_user_by_email", lambda email: next(lookups))

    def conflict(*a, **k):
        raise supabase_auth.SupabaseEmailConflictError("exists")

    env["mp"].setattr(supabase_auth, "create_user", conflict)
    with TestClient(app) as client:
        response = _post(client)
    assert response.status_code == 201
    assert response.json()["invited"] is False
    assert env["added"] == ["u-race"]


def test_mail_failure_keeps_assignment_and_reports_it(env):
    env["mp"].setattr(supabase_auth, "find_user_by_email", lambda email: None)
    env["mp"].setattr(
        supabase_auth, "create_user",
        lambda email, password, *, email_confirmed=False: supabase_auth.SupabaseUser(id="u-new", email=email),
    )

    def broken(*a, **k):
        raise supabase_auth.SupabaseAuthError("generate_link failed")

    env["mp"].setattr(supabase_auth, "generate_confirmation_link", broken)
    with TestClient(app) as client:
        response = _post(client)
    assert response.status_code == 201
    assert response.json()["invite_mail_sent"] is False
    assert env["added"] == ["u-new"]
    assert env["audits"][0]["metadata"]["invite_mail_sent"] is False


def test_auth_unavailable_returns_503_without_assignment(env):
    def down(email):
        raise supabase_auth.SupabaseAuthError("unreachable")

    env["mp"].setattr(supabase_auth, "find_user_by_email", down)
    with TestClient(app) as client:
        response = _post(client)
    assert response.status_code == 503
    assert env["added"] == []


def test_org_admin_cannot_invite(env):
    with TestClient(app) as client:
        response = _post(client, headers=org_admin_headers(organization_id=str(ORG["id"])))
    assert response.status_code == 403
    assert env["added"] == []


def test_invite_mail_escapes_org_name(env):
    from app.notifications.sending import send_member_invite_email

    assert send_member_invite_email(
        to_email="x@example.com", org_name="<b>FC</b>", link="https://e.x/a?b=1&c=2", new_account=True
    )
    html = env["fake"].sent[0].html_content
    assert "<b>FC</b>" not in html and "&lt;b&gt;FC&lt;/b&gt;" in html
    assert "b=1&amp;c=2" in html
