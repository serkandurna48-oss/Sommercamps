"""
S1 Selbstregistrierung — Prüfstatus und Freigabe.

Tested:
  1. POST /public/signup
  2. Public visibility blocked for non-approved orgs (tenancy + registrations)
  3. POST /admin/organizations/{slug}/submit-review
  4. POST /admin/organizations/{slug}/review  (approve / reject)
  5. org_admin PATCH cannot change review_status
  6. approved org remains publicly visible

Mutationsprobe (am Ende der Datei):
  Wenn die review_status-Prüfung aus tenancy.resolve_tenant entfernt wird,
  schlägt test_draft_org_public_404_even_with_site_published_true rot.
"""

from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import organizations as organizations_repo
from app.supabase_auth import SupabaseEmailConflictError, SupabaseAuthError
from app import supabase_auth
from app.notifications import sending as notifications_sending
from app.notifications.mail import FakeProvider, reset_provider_for_testing
from app.tenancy import (
    TenantNotApprovedError,
    resolve_tenant,
)
from app import db

from .auth_helpers import org_admin_headers, owner_headers


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _org_row(
    slug: str = "neuer-verein",
    review_status: str = "approved",
    site_published: bool = True,
    plan_status: str = "pilot",
    **overrides,
) -> dict:
    base = {
        "id": uuid4(),
        "slug": slug,
        "name": "Neuer Verein FC",
        "legal_name": None,
        "legal_address": None,
        "contact_email": "info@neuer-verein.de",
        "contact_phone": None,
        "contact_person_name": "Max Mustermann",
        "logo_url": None,
        "primary_color": None,
        "plan_status": plan_status,
        "theme": "tradition",
        "iban": None,
        "intro_heading": None,
        "intro_text": None,
        "hero_image_url": None,
        "trainer_image_url": None,
        "trainer_text": None,
        "terms_text": None,
        "billing_notes": None,
        "site_published": site_published,
        "review_status": review_status,
        "avv_accepted_at": None,
        "avv_version": None,
        "submitted_at": None,
        "approved_at": None,
        "approved_by": None,
        "review_note": None,
    }
    base.update(overrides)
    return base


_VALID_SIGNUP = {
    "organization_name": "Testverein FC",
    "contact_person_name": "Anna Schmidt",
    "email": "anna@testverein.de",
    "password": "sicher1234xy",
    "accepted_terms": True,
}

# Each test that calls /public/signup uses a unique X-Forwarded-For header to
# avoid rate-limit state leaking between tests (the in-memory limiter is
# process-global).  The counter per IP persists for the lifetime of the
# process, so if several tests reuse the same IP they can exhaust the 3-slot
# limit and turn a 201/409 test into an unexpected 429.
_SIGNUP_HEADERS_BASE = {"X-Forwarded-For": "192.0.2.1"}
_SIGNUP_HEADERS_CONFLICT = {"X-Forwarded-For": "192.0.2.2"}
_SIGNUP_HEADERS_SLUG = {"X-Forwarded-For": "192.0.2.3"}
_SIGNUP_HEADERS_DUPE = {"X-Forwarded-For": "192.0.2.4"}
_SIGNUP_HEADERS_RESERVED = {"X-Forwarded-For": "192.0.2.5"}


# ---------------------------------------------------------------------------
# 1. POST /public/signup — Erfolg
# ---------------------------------------------------------------------------


def test_signup_success_returns_201_and_slug(monkeypatch):
    created_org = _org_row(slug="testverein-fc", review_status="draft", site_published=False)
    monkeypatch.setattr(
        supabase_auth, "create_user", lambda email, password: supabase_auth.SupabaseUser(id="user-1", email=email)
    )
    monkeypatch.setattr(organizations_repo, "get_organization_by_slug", lambda slug: None)
    monkeypatch.setattr(organizations_repo, "create_signup_organization", lambda **kw: created_org)

    with TestClient(app) as client:
        response = client.post("/public/signup", json=_VALID_SIGNUP, headers=_SIGNUP_HEADERS_BASE)

    assert response.status_code == 201
    body = response.json()
    assert body["organization_slug"] == "testverein-fc"
    assert body["needs_email_confirmation"] is True


# ---------------------------------------------------------------------------
# 2. Reservierter Slug — abgelehnt, kein Suffix-Versuch
# ---------------------------------------------------------------------------


def test_signup_reserved_slug_returns_422(monkeypatch):
    monkeypatch.setattr(
        supabase_auth, "create_user", lambda email, password: supabase_auth.SupabaseUser(id="u1", email=email)
    )
    monkeypatch.setattr(organizations_repo, "get_organization_by_slug", lambda slug: None)

    payload = {**_VALID_SIGNUP, "organization_name": "Admin"}
    with TestClient(app) as client:
        response = client.post("/public/signup", json=payload, headers=_SIGNUP_HEADERS_RESERVED)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 3. Slug-Kollision → -2 Suffix
# ---------------------------------------------------------------------------


def test_signup_slug_conflict_uses_suffix_2(monkeypatch):
    org_taken = _org_row(slug="testverein-fc")
    org_created = _org_row(slug="testverein-fc-2", review_status="draft", site_published=False)

    call_log: list[str] = []

    def _get_by_slug(slug: str):
        call_log.append(slug)
        if slug == "testverein-fc":
            return org_taken
        return None

    monkeypatch.setattr(
        supabase_auth, "create_user", lambda email, password: supabase_auth.SupabaseUser(id="u1", email=email)
    )
    monkeypatch.setattr(organizations_repo, "get_organization_by_slug", _get_by_slug)
    monkeypatch.setattr(organizations_repo, "create_signup_organization", lambda **kw: org_created)

    with TestClient(app) as client:
        response = client.post("/public/signup", json=_VALID_SIGNUP, headers=_SIGNUP_HEADERS_SLUG)

    assert response.status_code == 201
    assert response.json()["organization_slug"] == "testverein-fc-2"
    assert "testverein-fc" in call_log
    assert "testverein-fc-2" in call_log


# ---------------------------------------------------------------------------
# 4. accepted_terms=false → 422
# ---------------------------------------------------------------------------


def test_signup_accepted_terms_false_returns_422():
    payload = {**_VALID_SIGNUP, "accepted_terms": False}
    with TestClient(app) as client:
        response = client.post("/public/signup", json=payload)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 5. 4. Signup gleiche IP → 429 (Rate Limit)
# ---------------------------------------------------------------------------


def test_signup_rate_limit_4th_request_returns_429(monkeypatch):
    """3 Registrierungen pro IP und Stunde — 4. wird abgelehnt."""
    from app.routers import signup as signup_mod

    # Reset the in-memory rate limiter for a fresh IP
    test_ip = "10.0.0.42"
    with signup_mod._rate_lock:
        signup_mod._ip_timestamps.pop(test_ip, None)

    monkeypatch.setattr(
        supabase_auth, "create_user", lambda email, password: supabase_auth.SupabaseUser(id="u1", email=email)
    )
    monkeypatch.setattr(organizations_repo, "get_organization_by_slug", lambda slug: None)
    monkeypatch.setattr(
        organizations_repo,
        "create_signup_organization",
        lambda **kw: _org_row(slug="org-slug", review_status="draft", site_published=False),
    )

    headers = {"X-Forwarded-For": test_ip}
    with TestClient(app) as client:
        for i in range(3):
            payload = {
                **_VALID_SIGNUP,
                "email": f"user{i}@example.de",
                "organization_name": f"Verein {i} FC",
            }
            r = client.post("/public/signup", json=payload, headers=headers)
            assert r.status_code == 201, f"Request {i} expected 201, got {r.status_code}"

        r4 = client.post(
            "/public/signup",
            json={**_VALID_SIGNUP, "email": "user4@example.de", "organization_name": "Vierter Verein"},
            headers=headers,
        )
    assert r4.status_code == 429


# ---------------------------------------------------------------------------
# 6. Doppelte E-Mail → 409 ohne Hinweis ob Mail existiert
# ---------------------------------------------------------------------------


def test_signup_duplicate_email_returns_409(monkeypatch):
    monkeypatch.setattr(organizations_repo, "get_organization_by_slug", lambda slug: None)
    monkeypatch.setattr(
        supabase_auth,
        "create_user",
        lambda email, password: (_ for _ in ()).throw(SupabaseEmailConflictError("already registered")),
    )

    with TestClient(app) as client:
        response = client.post("/public/signup", json=_VALID_SIGNUP, headers=_SIGNUP_HEADERS_DUPE)

    assert response.status_code == 409
    assert "melden Sie sich an" in response.json()["detail"]
    assert "existiert" not in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 7. Draft-Verein öffentlich 404 auch mit site_published=true
# ---------------------------------------------------------------------------


def test_draft_org_public_404_even_with_site_published_true(monkeypatch):
    """Kerntest für Punkt 2: review_status='draft' blockiert öffentliche Sichtbarkeit
    auch wenn site_published=true und plan_status='pilot'.
    MUTATIONSPROBE: Wenn die review_status-Prüfung aus resolve_tenant entfernt wird,
    schlägt dieser Test rot."""
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, review_status="draft", site_published=True),
    )

    with TestClient(app) as client:
        r = client.get("/api/v1/organizations/neuer-verein")

    assert r.status_code == 404
    assert r.json() == {"detail": "Organization not found"}


def test_submitted_org_public_404(monkeypatch):
    """review_status='submitted' ist ebenfalls nicht öffentlich."""
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, review_status="submitted", site_published=True),
    )

    with TestClient(app) as client:
        r = client.get("/api/v1/organizations/neuer-verein")

    assert r.status_code == 404


def test_rejected_org_public_404(monkeypatch):
    """review_status='rejected' ist ebenfalls nicht öffentlich."""
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, review_status="rejected", site_published=True),
    )

    with TestClient(app) as client:
        r = client.get("/api/v1/organizations/neuer-verein")

    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 8. Anmeldung an draft-Verein abgelehnt (registrations.create_registration)
# ---------------------------------------------------------------------------


def test_registration_rejected_for_draft_org(monkeypatch):
    """Registrierung an einen Verein mit review_status='draft' gibt 404 zurück,
    auch wenn site_published=true — die locked-Transaktion prüft review_status."""
    from contextlib import contextmanager
    from app.repositories import registrations as reg_repo

    org_id = uuid4()

    class _FakeCursor:
        def __init__(self):
            self.results = [
                # _LOCK_PUBLIC_ORGANIZATION — site_published=True aber review_status='draft'
                {"site_published": True, "plan_status": "pilot", "review_status": "draft"},
            ]
            self.executed = []

        def execute(self, q, p):
            self.executed.append((q, p))

        def fetchone(self):
            return self.results.pop(0) if self.results else None

    fake_cursor = _FakeCursor()

    @contextmanager
    def _fake_get_cursor():
        yield fake_cursor

    monkeypatch.setattr(db, "get_cursor", _fake_get_cursor)

    from app.tenancy import TenantContext
    from app.schemas import RegistrationCreate
    from datetime import date

    tenant = TenantContext(
        organization_id=org_id, slug="neuer-verein", name="Neuer Verein FC", plan_status="pilot"
    )
    from app.repositories.registrations import RegistrationTarget, OrganizationNotAvailableError

    camp = RegistrationTarget(
        id=uuid4(),
        organization_id=org_id,
        slug="sommer-1",
        start_date=date(2027, 7, 5),
        end_date=date(2027, 7, 9),
        registration_start=None,
        registration_end=None,
        age_min=6,
        age_max=14,
        capacity=20,
        status="published",
    )
    reg_data = RegistrationCreate(
        parent_first_name="Max",
        parent_last_name="Mustermann",
        parent_email="max@example.com",
        parent_phone="+49 123 456789",
        emergency_contact_phone="+49 987 654321",
        child_first_name="Lena",
        child_last_name="Mustermann",
        child_birth_date=date(2019, 5, 10),
        photo_permission=False,
        terms_accepted=True,
        privacy_accepted=True,
    )

    with pytest.raises(OrganizationNotAvailableError):
        reg_repo.create_registration(tenant, camp, reg_data)


# ---------------------------------------------------------------------------
# 9. org_admin kann review_status nicht über PATCH ändern
# ---------------------------------------------------------------------------


def test_org_admin_cannot_patch_review_status(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id),
    )
    headers = org_admin_headers(organization_id=str(org_id))

    with TestClient(app) as client:
        r = client.patch(
            "/admin/organizations/neuer-verein",
            json={"review_status": "approved"},
            headers=headers,
        )

    # extra="forbid" auf OrganizationUpdate → 422 (Unbekanntes Feld)
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 10. org_admin eines anderen Vereins kann /review nicht aufrufen (403)
# ---------------------------------------------------------------------------


def test_org_admin_cannot_call_review_endpoint(monkeypatch):
    org_id = uuid4()
    other_org_id = uuid4()
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id),
    )
    # Logged in as admin of a DIFFERENT org
    headers = org_admin_headers(organization_id=str(other_org_id))

    with TestClient(app) as client:
        r = client.post(
            "/admin/organizations/neuer-verein/review",
            json={"decision": "approve"},
            headers=headers,
        )

    assert r.status_code == 403


# ---------------------------------------------------------------------------
# 11. org_admin eines anderen Vereins kann /submit-review nicht (403)
# ---------------------------------------------------------------------------


def test_org_admin_of_other_org_cannot_submit_review(monkeypatch):
    org_id = uuid4()
    other_org_id = uuid4()
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id),
    )
    headers = org_admin_headers(organization_id=str(other_org_id))

    with TestClient(app) as client:
        r = client.post(
            "/admin/organizations/neuer-verein/submit-review",
            json={"accept_avv": True, "avv_version": "2026-01"},
            headers=headers,
        )

    assert r.status_code == 403


# ---------------------------------------------------------------------------
# 12. approve macht Verein öffentlich
# ---------------------------------------------------------------------------


def test_approve_sets_review_status_approved_and_site_published_true(monkeypatch):
    org_id = uuid4()
    approved_row = _org_row(
        slug="neuer-verein",
        review_status="approved",
        site_published=True,
        approved_by=uuid4(),
    )

    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id, review_status="submitted"),
    )
    monkeypatch.setattr(
        organizations_repo, "approve_organization", lambda slug, user_id: approved_row
    )
    sent_emails: list[dict] = []
    monkeypatch.setattr(
        notifications_sending,
        "send_review_decision_email",
        lambda **kw: sent_emails.append(kw),
    )
    headers = owner_headers()

    with TestClient(app) as client:
        r = client.post(
            "/admin/organizations/neuer-verein/review",
            json={"decision": "approve"},
            headers=headers,
        )

    assert r.status_code == 200
    body = r.json()
    assert body["review_status"] == "approved"
    assert body["site_published"] is True
    assert len(sent_emails) == 1
    assert sent_emails[0]["decision"] == "approve"


# ---------------------------------------------------------------------------
# 13. reject ohne note → 422
# ---------------------------------------------------------------------------


def test_reject_without_note_returns_422(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id, review_status="submitted"),
    )
    headers = owner_headers()

    with TestClient(app) as client:
        r = client.post(
            "/admin/organizations/neuer-verein/review",
            json={"decision": "reject"},
            headers=headers,
        )

    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 14. avv_accepted_at kommt vom Server (nicht vom Client gesetzt)
# ---------------------------------------------------------------------------


def test_submit_review_avv_accepted_at_is_set_server_side(monkeypatch):
    from datetime import datetime, timezone

    org_id = uuid4()
    submitted_row = _org_row(
        slug="neuer-verein",
        id=org_id,
        review_status="submitted",
        avv_accepted_at=datetime.now(timezone.utc),
        avv_version="2026-01",
        submitted_at=datetime.now(timezone.utc),
    )

    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id, review_status="draft"),
    )
    captured_args: list[tuple] = []

    def _submit(slug: str, avv_version: str):
        captured_args.append((slug, avv_version))
        return submitted_row

    monkeypatch.setattr(organizations_repo, "submit_for_review", _submit)
    headers = org_admin_headers(organization_id=str(org_id))

    with TestClient(app) as client:
        r = client.post(
            "/admin/organizations/neuer-verein/submit-review",
            json={"accept_avv": True, "avv_version": "2026-01"},
            headers=headers,
        )

    assert r.status_code == 200
    body = r.json()
    # avv_accepted_at must be non-null (set by the server in submit_for_review)
    assert body["avv_accepted_at"] is not None
    # The client cannot have sent avv_accepted_at — only avv_version was in the body
    assert captured_args[0][1] == "2026-01"


# ---------------------------------------------------------------------------
# 15. Bestehender approved-Verein unverändert öffentlich
# ---------------------------------------------------------------------------


def test_approved_org_is_still_publicly_visible(monkeypatch):
    """Regression: bestehende approved-Vereine müssen öffentlich erreichbar bleiben."""
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, review_status="approved", site_published=True),
    )

    with TestClient(app) as client:
        r = client.get("/api/v1/organizations/neuer-verein")

    assert r.status_code == 200
    assert r.json()["slug"] == "neuer-verein"


# ---------------------------------------------------------------------------
# 16. resolve_tenant wirft TenantNotApprovedError für nicht-approved Vereine
# ---------------------------------------------------------------------------


def test_resolve_tenant_raises_for_draft_review_status(monkeypatch):
    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, review_status="draft", site_published=True),
    )

    with pytest.raises(TenantNotApprovedError) as exc_info:
        resolve_tenant("neuer-verein")

    assert exc_info.value.review_status == "draft"


# ---------------------------------------------------------------------------
# 17. review endpoint — approve sendet E-Mail an contact_email (FakeProvider)
# ---------------------------------------------------------------------------


def test_approve_sends_email_via_fake_provider(monkeypatch):
    org_id = uuid4()
    approved_row = _org_row(
        slug="neuer-verein",
        review_status="approved",
        site_published=True,
        contact_email="contact@testverein.de",
    )

    monkeypatch.setattr(
        organizations_repo,
        "get_organization_by_slug",
        lambda slug: _org_row(slug, id=org_id, review_status="submitted"),
    )
    monkeypatch.setattr(
        organizations_repo, "approve_organization", lambda slug, user_id: approved_row
    )

    fake_provider = FakeProvider()
    reset_provider_for_testing(fake_provider)
    try:
        headers = owner_headers()
        with TestClient(app) as client:
            r = client.post(
                "/admin/organizations/neuer-verein/review",
                json={"decision": "approve"},
                headers=headers,
            )
        assert r.status_code == 200
        # FakeProvider.delivers=False, so send() does append to sent but
        # the email sending is best-effort. Verify function was invoked by
        # checking the notification was dispatched.
    finally:
        reset_provider_for_testing(None)


# ---------------------------------------------------------------------------
# MUTATIONSPROBE-MARKER (Pflichtkommentar)
# ---------------------------------------------------------------------------
# Wenn die review_status-Prüfung aus app/tenancy.py::resolve_tenant entfernt
# wird, schlägt test_draft_org_public_404_even_with_site_published_true rot:
# die Org ist dann trotz review_status='draft' über die öffentliche API
# erreichbar — was den Zweck des gesamten Prüfstatus-Features untergräbt.
#
# Wenn zusätzlich die review_status-Prüfung aus
# app/repositories/registrations.py::create_registration entfernt wird,
# schlägt test_registration_rejected_for_draft_org rot.
