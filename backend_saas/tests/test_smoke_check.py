"""
Tests for backend_saas/scripts/smoke_check.py using httpx.MockTransport.

The script is a standalone module (not a package), so we add the scripts
directory to sys.path before importing it.
"""

from __future__ import annotations

import datetime
import json
import sys
from pathlib import Path

import httpx
import pytest

# Make smoke_check importable without installing as a package.
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

import smoke_check
from smoke_check import _birth_date_for_camp, run_checks


# ─── Mock transport ──────────────────────────────────────────────────────────


class _MockTransport(httpx.BaseTransport):
    """Routes requests to pre-registered patterns.

    Key format:
    - "METHOD PATTERN"  — method-specific, checked first
    - "PATTERN"         — method-neutral fallback

    Longer patterns win over shorter ones (most-specific wins).
    """

    def __init__(self, routes: dict[str, httpx.Response]) -> None:
        self._routes = routes

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        method = request.method

        # First pass: method-specific keys (e.g. "POST /registrations")
        for key in sorted(self._routes, key=len, reverse=True):
            if " " in key:
                m, pattern = key.split(" ", 1)
                if m == method and pattern in url:
                    return self._routes[key]

        # Second pass: method-neutral keys (longest match wins)
        for key in sorted(self._routes, key=len, reverse=True):
            if " " not in key and key in url:
                return self._routes[key]

        return httpx.Response(404, json={"error": "no route matched", "url": url})


def _make_client(routes: dict[str, httpx.Response]) -> httpx.Client:
    return httpx.Client(transport=_MockTransport(routes))


# ─── Shared fixtures / helpers ────────────────────────────────────────────────

_HEALTH_OK = {"status": "ok", "database": "ok", "service": "campspilot-saas-api"}
_ORG_BODY = {"slug": "test-org", "name": "Test Org", "contact_email": "test@example.com"}
_CAMP_BODY = {
    "slug": "test-camp",
    "title": "Test Camp",
    "price_cents": 14900,
    "age_min": 6,
    "age_max": 14,
    "start_date": "2027-07-01",
    "end_date": "2027-07-03",
    "capacity": 10,
    "registered_count": 0,
    "waitlist_count": 0,
    "currency": "EUR",
}
_REG_TOKEN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
_REG_BODY = {
    "registration_token": _REG_TOKEN,
    "status": "registered",
    "payment_status": "pending",
    "payment_reference": "CP-AAAAAAAA",
}


def _full_routes(org: str = "test-org") -> dict[str, httpx.Response]:
    """All routes that produce a fully-passing smoke run."""
    return {
        "/health": httpx.Response(200, json=_HEALTH_OK),
        f"/api/v1/organizations/{org}/camps/test-camp": httpx.Response(200, json=_CAMP_BODY),
        f"/api/v1/organizations/{org}/camps": httpx.Response(200, json=[_CAMP_BODY]),
        f"/api/v1/organizations/{org}": httpx.Response(200, json=_ORG_BODY),
        f"/pilot/{org}/impressum": httpx.Response(200, text="<html>Impressum</html>"),
        f"/pilot/{org}/datenschutz": httpx.Response(200, text="<html>Brevo</html>"),
        f"/pilot/{org}/teilnahmebedingungen": httpx.Response(200, text="<html>AGB</html>"),
        f"/pilot/{org}": httpx.Response(200, text="<html>Test Org</html>"),
        # Method-specific: POST to the registration endpoint returns 201
        "POST /registrations": httpx.Response(201, json=_REG_BODY),
    }


# ─── Tests ───────────────────────────────────────────────────────────────────


def test_all_ok_returns_exit_0():
    """All checks passing → every result has passed=True."""
    client = _make_client(_full_routes())
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    failed = [r for r in results if not r[0]]
    assert failed == [], f"Unexpected failures: {failed}"


def test_health_500_produces_failure():
    routes = dict(_full_routes())
    routes["/health"] = httpx.Response(500, json={"status": "error"})
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    health_results = [r for r in results if "Health" in r[1]]
    assert health_results, "No health result recorded"
    assert not health_results[0][0], "Health check should have failed"


def test_health_database_not_ok_produces_failure():
    routes = dict(_full_routes())
    routes["/health"] = httpx.Response(200, json={"status": "ok", "database": "unreachable"})
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    health_results = [r for r in results if "Health" in r[1]]
    assert not health_results[0][0]


def test_org_without_camps_is_fehler():
    routes = dict(_full_routes())
    routes["/api/v1/organizations/test-org/camps"] = httpx.Response(200, json=[])
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    camp_results = [r for r in results if "Campliste" in r[1]]
    assert camp_results, "No Campliste result recorded"
    assert not camp_results[0][0], "Empty camp list should fail"


def test_billing_notes_in_org_json_is_fehler():
    body_with_leak = dict(_ORG_BODY, billing_notes="geheim")
    routes = dict(_full_routes())
    routes["/api/v1/organizations/test-org"] = httpx.Response(200, json=body_with_leak)
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    org_results = [r for r in results if "öffentliche Daten" in r[1]]
    assert org_results, "No org-data result recorded"
    assert not org_results[0][0], "billing_notes leak should fail"
    assert "billing_notes" in org_results[0][2]


def test_plan_status_in_org_json_is_fehler():
    body_with_leak = dict(_ORG_BODY, plan_status="pilot")
    routes = dict(_full_routes())
    routes["/api/v1/organizations/test-org"] = httpx.Response(200, json=body_with_leak)
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        _client=client,
    )
    org_results = [r for r in results if "öffentliche Daten" in r[1]]
    assert not org_results[0][0], "plan_status leak should fail"
    assert "plan_status" in org_results[0][2]


def test_registration_not_called_without_flag():
    """Without --register-email / --camp no POST to /registrations occurs."""
    called: list[tuple[str, str]] = []

    class _TrackingTransport(_MockTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            called.append((request.method, str(request.url)))
            return super().handle_request(request)

    client = httpx.Client(transport=_TrackingTransport(_full_routes()))
    run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        register_email=None,
        camp_slug=None,
        _client=client,
    )
    assert not any(m == "POST" and "registrations" in u for m, u in called), (
        "POST to /registrations must not happen without --register-email"
    )


def test_registration_called_with_flag():
    """With --register-email, a POST to /registrations is made and 201 → OK."""
    client = _make_client(_full_routes())
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        register_email="smoke@campspilot.example",
        camp_slug="test-camp",
        _client=client,
    )
    reg_results = [r for r in results if "POST /registrations" in r[1]]
    assert reg_results, "No registration result recorded"
    assert reg_results[0][0], f"Registration check should pass: {reg_results[0]}"


def test_registration_201_non_success_is_fehler():
    routes = dict(_full_routes())
    routes["POST /registrations"] = httpx.Response(422, json={"detail": "age error"})
    client = _make_client(routes)
    results = run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        register_email="smoke@campspilot.example",
        camp_slug="test-camp",
        _client=client,
    )
    reg_results = [r for r in results if "POST /registrations" in r[1]]
    assert reg_results
    assert not reg_results[0][0]


def test_sql_block_contains_exact_token(capsys):
    client = _make_client(_full_routes())
    run_checks(
        api_url="http://api.test",
        frontend_url="http://fe.test",
        orgs=["test-org"],
        register_email="smoke@campspilot.example",
        camp_slug="test-camp",
        _client=client,
    )
    out = capsys.readouterr().out
    assert _REG_TOKEN in out, f"Token {_REG_TOKEN!r} not in output"
    assert f"WHERE registration_token = '{_REG_TOKEN}'" in out


# ─── Birth-date calculation ───────────────────────────────────────────────────


def _age_at(birth: datetime.date, reference: datetime.date) -> int:
    years = reference.year - birth.year
    if (reference.month, reference.day) < (birth.month, birth.day):
        years -= 1
    return years


def test_birth_date_within_age_limits_standard():
    camp = {"start_date": "2027-07-01", "age_min": 6, "age_max": 14}
    birth = _birth_date_for_camp(camp)
    age = _age_at(birth, datetime.date(2027, 7, 1))
    assert 6 <= age <= 14, f"Age {age} outside [6, 14]"


def test_birth_date_within_age_limits_tight_range():
    camp = {"start_date": "2027-03-15", "age_min": 10, "age_max": 10}
    birth = _birth_date_for_camp(camp)
    age = _age_at(birth, datetime.date(2027, 3, 15))
    assert age == 10, f"Age {age} should be exactly 10"


def test_birth_date_within_age_limits_single_year_gap():
    camp = {"start_date": "2028-02-29", "age_min": 8, "age_max": 9}
    birth = _birth_date_for_camp(camp)
    reference = datetime.date(2028, 2, 29)
    age = _age_at(birth, reference)
    assert 8 <= age <= 9, f"Age {age} outside [8, 9]"


def test_birth_date_leap_year_edge():
    # start_date is Mar-01 non-leap; target_age may produce a Feb-29 which
    # doesn't exist → function must fall back to Feb-28 without raising.
    camp = {"start_date": "2027-03-01", "age_min": 9, "age_max": 12}
    birth = _birth_date_for_camp(camp)
    age = _age_at(birth, datetime.date(2027, 3, 1))
    assert 9 <= age <= 12
