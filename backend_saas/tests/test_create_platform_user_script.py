"""The bootstrap script must find an existing account beyond the first page
of GoTrue's user list (GoTrue ignores an `email` filter parameter). No
network: httpx.get is replaced with a fake paged user list."""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "create_platform_user.py"


@pytest.fixture
def script():
    spec = importlib.util.spec_from_file_location("create_platform_user", _SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Resp:
    def __init__(self, users):
        self._users = users

    def raise_for_status(self):
        return None

    def json(self):
        return {"users": self._users}


def _fake_pages(total: int):
    users = [{"id": f"id-{i}", "email": f"user{i}@example.com"} for i in range(total)]
    calls: list[dict] = []

    def fake_get(url, headers, params, timeout):
        calls.append(params)
        start = (params["page"] - 1) * params["per_page"]
        return _Resp(users[start:start + params["per_page"]])

    return fake_get, calls


def test_finds_account_on_a_later_page_case_insensitive(script, monkeypatch):
    fake_get, calls = _fake_pages(450)
    monkeypatch.setattr(script.httpx, "get", fake_get)
    assert script._find_supabase_user("https://x", "key", "USER420@example.com") == "id-420"
    assert [c["page"] for c in calls] == [1, 2, 3]


def test_unknown_account_returns_none_after_last_page(script, monkeypatch):
    fake_get, calls = _fake_pages(10)
    monkeypatch.setattr(script.httpx, "get", fake_get)
    assert script._find_supabase_user("https://x", "key", "nobody@example.com") is None
    assert len(calls) == 1
