from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

from app import db
from app.repositories import camps
from app.repositories.camps import _CAPACITY_COUNTING_STATUSES_LIST
from app.tenancy import TenantContext


def _tenant(organization_id=None, slug: str = "demo-fc") -> TenantContext:
    return TenantContext(
        organization_id=organization_id or uuid4(),
        slug=slug,
        name="Demo FC",
        plan_status="active",
    )


class _FakeCursor:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self.executed: list[tuple[str, tuple]] = []

    def execute(self, query, params):
        self.executed.append((query, params))

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


def _patch_cursor(monkeypatch, fake_cursor: _FakeCursor) -> None:
    @contextmanager
    def fake_get_cursor():
        yield fake_cursor

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)


def test_list_published_camps_is_scoped_to_organization_id(monkeypatch):
    tenant = _tenant()
    fake_cursor = _FakeCursor(rows=[])
    _patch_cursor(monkeypatch, fake_cursor)

    camps.list_published_camps(tenant)

    assert len(fake_cursor.executed) == 1
    query, params = fake_cursor.executed[0]
    assert params == (_CAPACITY_COUNTING_STATUSES_LIST, tenant.organization_id)
    assert "organization_id = %s" in query
    assert "status = 'published'" in query


def test_get_published_camp_by_slug_is_scoped_to_organization_id_and_slug(monkeypatch):
    tenant = _tenant()
    fake_cursor = _FakeCursor(rows=[{"slug": "summer-1"}])
    _patch_cursor(monkeypatch, fake_cursor)

    camps.get_published_camp_by_slug(tenant, "summer-1")

    query, params = fake_cursor.executed[0]
    assert params == (_CAPACITY_COUNTING_STATUSES_LIST, tenant.organization_id, "summer-1")
    assert "organization_id = %s" in query
    assert "slug = %s" in query
    assert "status = 'published'" in query
    # the slug must never be interpolated directly into the SQL text
    assert "summer-1" not in query


def test_get_published_camp_by_slug_returns_none_when_no_row(monkeypatch):
    tenant = _tenant()
    fake_cursor = _FakeCursor(rows=[])
    _patch_cursor(monkeypatch, fake_cursor)

    assert camps.get_published_camp_by_slug(tenant, "missing") is None


def test_different_tenants_produce_different_organization_id_params(monkeypatch):
    tenant_a = _tenant(slug="academy-a")
    tenant_b = _tenant(slug="academy-b")
    assert tenant_a.organization_id != tenant_b.organization_id

    fake_cursor = _FakeCursor(rows=[])
    _patch_cursor(monkeypatch, fake_cursor)

    camps.get_published_camp_by_slug(tenant_a, "summer-1")
    camps.get_published_camp_by_slug(tenant_b, "summer-1")

    (_, params_a), (_, params_b) = fake_cursor.executed
    assert params_a == (_CAPACITY_COUNTING_STATUSES_LIST, tenant_a.organization_id, "summer-1")
    assert params_b == (_CAPACITY_COUNTING_STATUSES_LIST, tenant_b.organization_id, "summer-1")
    assert params_a != params_b
