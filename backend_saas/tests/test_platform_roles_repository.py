"""
SQL-shape tests for app/repositories/platform_roles.py — same fake-cursor
pattern as test_camps_repository.py: no real database, just asserting the
right query/parameters were sent, mirroring this suite's existing
repository-test convention.
"""

from __future__ import annotations

from contextlib import contextmanager
from uuid import uuid4

from app import db
from app.repositories import platform_roles


class _FakeCursor:
    def __init__(self, rows=None, one=None):
        self._rows = rows if rows is not None else []
        self._one = one
        self.executed: list[tuple] = []
        self.rowcount = 1

    def execute(self, query, params=None):
        self.executed.append((query, params))

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._one


def _patch_cursor(monkeypatch, fake_cursor: _FakeCursor) -> None:
    @contextmanager
    def fake_get_cursor():
        yield fake_cursor

    monkeypatch.setattr(db, "get_cursor", fake_get_cursor)


def test_is_platform_owner_true_when_row_found(monkeypatch):
    cur = _FakeCursor(one={"exists": True})
    _patch_cursor(monkeypatch, cur)
    assert platform_roles.is_platform_owner("user-1") is True
    assert "platform_owners" in cur.executed[0][0]
    assert cur.executed[0][1] == ("user-1",)


def test_is_platform_owner_false_when_no_row(monkeypatch):
    cur = _FakeCursor(one=None)
    _patch_cursor(monkeypatch, cur)
    assert platform_roles.is_platform_owner("user-1") is False


def test_get_admin_organization_ids_scoped_to_user(monkeypatch):
    org_id = uuid4()
    cur = _FakeCursor(rows=[{"organization_id": org_id}])
    _patch_cursor(monkeypatch, cur)

    result = platform_roles.get_admin_organization_ids("user-1")

    assert result == [str(org_id)]
    assert cur.executed[0][1] == ("user-1",)


def test_is_org_admin_checks_both_user_and_org(monkeypatch):
    cur = _FakeCursor(one={"exists": True})
    _patch_cursor(monkeypatch, cur)

    platform_roles.is_org_admin("user-1", "org-a")

    assert cur.executed[0][1] == ("user-1", "org-a")


def test_add_organization_member_upserts_role_on_conflict(monkeypatch):
    cur = _FakeCursor(one={"id": uuid4(), "organization_id": "org-a", "user_id": "user-1", "role": "org_admin"})
    _patch_cursor(monkeypatch, cur)

    platform_roles.add_organization_member("org-a", "user-1")

    query, params = cur.executed[0]
    assert "on conflict" in query.lower()
    assert params == ("org-a", "user-1", "org_admin")


def test_remove_organization_member_scoped_to_org(monkeypatch):
    cur = _FakeCursor()
    cur.rowcount = 1
    _patch_cursor(monkeypatch, cur)

    removed = platform_roles.remove_organization_member("org-a", "member-1")

    assert removed is True
    assert cur.executed[0][1] == ("member-1", "org-a")


def test_remove_organization_member_returns_false_when_nothing_deleted(monkeypatch):
    cur = _FakeCursor()
    cur.rowcount = 0
    _patch_cursor(monkeypatch, cur)

    assert platform_roles.remove_organization_member("org-a", "member-1") is False


def test_write_audit_log_never_raises_when_db_fails(monkeypatch):
    """See write_audit_log's own docstring: a broken audit_log write (e.g.
    the migration hasn't been applied to this environment yet) must never
    turn an otherwise-successful admin action into a 500."""

    @contextmanager
    def _broken_cursor():
        raise RuntimeError("relation \"audit_log\" does not exist")
        yield  # pragma: no cover

    monkeypatch.setattr(db, "get_cursor", _broken_cursor)

    platform_roles.write_audit_log(actor_user_id="u", actor_email="a@example.com", action="test.action")
    # no exception raised == pass


def test_list_audit_log_filters_by_organization_when_given(monkeypatch):
    cur = _FakeCursor(rows=[])
    _patch_cursor(monkeypatch, cur)

    platform_roles.list_audit_log(organization_id="org-a")

    query, params = cur.executed[0]
    assert "where organization_id" in query.lower()
    assert params[0] == "org-a"


def test_list_audit_log_without_organization_returns_everything(monkeypatch):
    cur = _FakeCursor(rows=[])
    _patch_cursor(monkeypatch, cur)

    platform_roles.list_audit_log()

    query, _params = cur.executed[0]
    assert "where organization_id" not in query.lower()
