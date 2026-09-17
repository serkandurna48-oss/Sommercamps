from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

import pytest

from app import db
from app.repositories import organizations
from app.tenancy import (
    TenantContext,
    TenantInactiveError,
    TenantNotFoundError,
    resolve_tenant,
)


def test_resolve_tenant_returns_context_for_active_org(monkeypatch):
    org_id = uuid4()
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: {"id": org_id, "slug": slug, "name": "Demo FC", "plan_status": "pilot"},
    )

    ctx = resolve_tenant("demo-fc")

    assert ctx == TenantContext(
        organization_id=org_id, slug="demo-fc", name="Demo FC", plan_status="pilot"
    )


def test_resolve_tenant_raises_for_unknown_slug(monkeypatch):
    monkeypatch.setattr(organizations, "get_organization_by_slug", lambda slug: None)

    with pytest.raises(TenantNotFoundError):
        resolve_tenant("does-not-exist")


@pytest.mark.parametrize("plan_status", ["suspended", "cancelled"])
def test_resolve_tenant_raises_for_inactive_org(monkeypatch, plan_status):
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: {"id": uuid4(), "slug": slug, "name": "X", "plan_status": plan_status},
    )

    with pytest.raises(TenantInactiveError):
        resolve_tenant("some-org")


@pytest.mark.parametrize("plan_status", ["pilot", "active"])
def test_resolve_tenant_accepts_both_active_plan_statuses(monkeypatch, plan_status):
    monkeypatch.setattr(
        organizations,
        "get_organization_by_slug",
        lambda slug: {"id": uuid4(), "slug": slug, "name": "X", "plan_status": plan_status},
    )

    ctx = resolve_tenant("some-org")

    assert ctx.plan_status == plan_status


def test_get_organization_by_slug_uses_parametrized_sql(monkeypatch):
    captured = {}

    class FakeCursor:
        def execute(self, query, params):
            captured["query"] = query
            captured["params"] = params

        def fetchone(self):
            return {"id": uuid4(), "slug": "demo-fc", "name": "Demo FC", "plan_status": "pilot"}

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)

    result = organizations.get_organization_by_slug("demo-fc")

    assert captured["params"] == ("demo-fc",)
    assert "%s" in captured["query"]
    # the slug must never be interpolated directly into the SQL text
    assert "demo-fc" not in captured["query"]
    assert result["slug"] == "demo-fc"


def test_get_organization_by_slug_returns_none_when_missing(monkeypatch):
    class FakeCursor:
        def execute(self, query, params):
            pass

        def fetchone(self):
            return None

    @contextmanager
    def fake_get_cursor():
        yield FakeCursor()

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)

    assert organizations.get_organization_by_slug("nope") is None
