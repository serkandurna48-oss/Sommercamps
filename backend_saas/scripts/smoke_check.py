#!/usr/bin/env python
"""
Smoke-Check for CampsPilot SaaS — Backend + Frontend.

Usage:
    python scripts/smoke_check.py \\
        --api-url https://BACKEND_API_URL \\
        --frontend-url https://FRONTEND_URL \\
        --org SLUG [--org SLUG ...] \\
        [--register-email ADDRESS --camp SLUG]

Prints one line per check: OK/FEHLER – Check – Detail.
Exit code 0 only if all checks pass.

Optional --register-email/--camp: creates exactly one test registration and
prints the registration_token, payment reference, and a DELETE SQL block.
No writes are performed without these flags.
"""

from __future__ import annotations

import argparse
import datetime
import sys
from typing import Callable, Optional

import httpx

Result = tuple[bool, str, str]
_OkFn = Callable[[str, str], None]
_FailFn = Callable[[str, str], None]


# ─── Birth-date helper ────────────────────────────────────────────────────────


def _birth_date_for_camp(camp: dict) -> datetime.date:
    """Returns a birth date that puts the child safely inside [age_min, age_max]
    on the camp's start_date."""
    start = datetime.date.fromisoformat(str(camp["start_date"]))
    age_min: int = camp["age_min"]
    age_max: int = camp["age_max"]
    target_age = min(age_min + 1, age_max)
    try:
        return start.replace(year=start.year - target_age)
    except ValueError:
        # Feb-29 on a non-leap target year → use Feb-28
        return start.replace(year=start.year - target_age, day=28)


# ─── Individual checks ────────────────────────────────────────────────────────


def _check_health(
    client: httpx.Client,
    api_url: str,
    ok: _OkFn,
    fail: _FailFn,
) -> None:
    label = "Health – GET /health"
    try:
        r = client.get(f"{api_url}/health")
    except httpx.RequestError as exc:
        fail(label, f"Verbindungsfehler: {exc}")
        return

    if r.status_code != 200:
        fail(label, f"HTTP {r.status_code}")
        return

    body = r.json()
    if body.get("status") != "ok":
        fail(label, f"status={body.get('status')!r}")
        return
    if body.get("database") != "ok":
        fail(label, f"database={body.get('database')!r}")
        return

    try:
        elapsed_s = r.elapsed.total_seconds()
        detail = f"{elapsed_s * 1000:.0f} ms"
        if elapsed_s > 3.0:
            detail += " (> 3 s — möglicher Kaltstart, bitte erneut prüfen)"
    except (AttributeError, RuntimeError):
        detail = "status ok, database ok"

    ok(label, detail)


def _check_org(
    client: httpx.Client,
    api_url: str,
    frontend_url: str,
    slug: str,
    ok: _OkFn,
    fail: _FailFn,
) -> Optional[dict]:
    """Returns the first camp dict on success, or None if a blocking check fails."""

    # --- Public org data ---
    try:
        r = client.get(f"{api_url}/api/v1/organizations/{slug}")
    except httpx.RequestError as exc:
        fail(f"Org {slug} – öffentliche Daten", str(exc))
        return None

    if r.status_code != 200:
        fail(f"Org {slug} – öffentliche Daten", f"HTTP {r.status_code}")
        return None

    body = r.json()

    if not body.get("name"):
        fail(f"Org {slug} – öffentliche Daten", "Feld 'name' fehlt oder leer")
        return None
    if "billing_notes" in body:
        fail(f"Org {slug} – öffentliche Daten", "billing_notes im JSON — vertrauliches Feld exponiert")
        return None
    if "plan_status" in body:
        fail(f"Org {slug} – öffentliche Daten", "plan_status im JSON — vertrauliches Feld exponiert")
        return None

    org_name: str = body["name"]
    ok(f"Org {slug} – öffentliche Daten", f"name={org_name!r}")

    # --- Camp list ---
    try:
        rc = client.get(f"{api_url}/api/v1/organizations/{slug}/camps")
    except httpx.RequestError as exc:
        fail(f"Org {slug} – Campliste", str(exc))
        return None

    if rc.status_code != 200:
        fail(f"Org {slug} – Campliste", f"HTTP {rc.status_code}")
        return None

    camps: list[dict] = rc.json()
    if not camps:
        fail(f"Org {slug} – Campliste", "0 Camps gefunden (mind. 1 erwartet)")
        return None

    first_camp = camps[0]
    missing = [f for f in ("slug", "title", "price_cents") if f not in first_camp]
    if missing:
        fail(f"Org {slug} – Campliste", f"fehlende Felder: {', '.join(missing)}")
        return None

    ok(f"Org {slug} – Campliste", f"{len(camps)} Camp(s), erstes: {first_camp['slug']!r}")

    # --- Frontend public page ---
    try:
        rf = client.get(f"{frontend_url}/pilot/{slug}")
    except httpx.RequestError as exc:
        fail(f"Org {slug} – Frontend /pilot/{slug}", str(exc))
    else:
        if rf.status_code != 200:
            fail(f"Org {slug} – Frontend /pilot/{slug}", f"HTTP {rf.status_code}")
        elif org_name not in rf.text:
            fail(f"Org {slug} – Frontend /pilot/{slug}", f"Org-Name {org_name!r} nicht im HTML")
        else:
            ok(f"Org {slug} – Frontend /pilot/{slug}", "200, Org-Name enthalten")

    # --- Legal pages ---
    legal = [
        (f"/pilot/{slug}/impressum", "Impressum", False),
        (f"/pilot/{slug}/datenschutz", "Datenschutz", True),
        (f"/pilot/{slug}/teilnahmebedingungen", "Teilnahmebedingungen", False),
    ]
    for path, label, check_brevo in legal:
        try:
            rl = client.get(f"{frontend_url}{path}")
        except httpx.RequestError as exc:
            fail(f"Org {slug} – {label}", str(exc))
            continue

        if rl.status_code != 200:
            fail(f"Org {slug} – {label}", f"HTTP {rl.status_code} ({path})")
        elif check_brevo and "Brevo" not in rl.text:
            fail(f"Org {slug} – {label}", f"'Brevo' nicht gefunden ({path})")
        else:
            extra = " (Brevo-Erwähnung bestätigt)" if check_brevo else ""
            ok(f"Org {slug} – {label}", f"200{extra}")

    return first_camp


def _check_registration(
    client: httpx.Client,
    api_url: str,
    org_slug: str,
    camp_slug: str,
    register_email: str,
    ok: _OkFn,
    fail: _FailFn,
) -> None:
    # Fetch camp to compute birth date
    try:
        rc = client.get(f"{api_url}/api/v1/organizations/{org_slug}/camps/{camp_slug}")
    except httpx.RequestError as exc:
        fail(f"Anmeldung – Camp {camp_slug}", str(exc))
        return

    if rc.status_code != 200:
        fail(f"Anmeldung – Camp {camp_slug}", f"HTTP {rc.status_code}")
        return

    camp = rc.json()
    birth_date = _birth_date_for_camp(camp)

    payload = {
        "parent_first_name": "Smoke",
        "parent_last_name": "Test",
        "parent_email": register_email,
        "parent_phone": "0000 000000",
        "child_first_name": "Smoke",
        "child_last_name": "Test",
        "child_birth_date": birth_date.isoformat(),
        "emergency_contact_name": "Smoke Test Emergency",
        "emergency_contact_phone": "0000 000000",
        "photo_permission": True,
        "terms_accepted": True,
        "privacy_accepted": True,
    }

    try:
        rr = client.post(
            f"{api_url}/api/v1/organizations/{org_slug}/camps/{camp_slug}/registrations",
            json=payload,
        )
    except httpx.RequestError as exc:
        fail("Anmeldung – POST /registrations", str(exc))
        return

    if rr.status_code != 201:
        fail("Anmeldung – POST /registrations", f"HTTP {rr.status_code}: {rr.text[:200]}")
        return

    body = rr.json()
    token: str = str(body.get("registration_token", ""))
    payment_ref: str = body.get("payment_reference", "")

    ok("Anmeldung – POST /registrations", f"201, token={token}")

    print()
    print(f"  Token:            {token}")
    print(f"  Verwendungszweck: {payment_ref}")
    print()
    print("  -- SQL-Block zum Löschen (NUR AUSGABE, nicht ausgeführt) --")
    print(f"  DELETE FROM camp_registrations WHERE registration_token = '{token}';")
    print()


# ─── Entry point ──────────────────────────────────────────────────────────────


def run_checks(
    api_url: str,
    frontend_url: str,
    orgs: list[str],
    register_email: Optional[str] = None,
    camp_slug: Optional[str] = None,
    *,
    _client: Optional[httpx.Client] = None,
) -> list[Result]:
    """Run all smoke checks. Returns list of (passed, check, detail) tuples."""
    api_url = api_url.rstrip("/")
    frontend_url = frontend_url.rstrip("/")

    results: list[Result] = []

    def ok(check: str, detail: str = "") -> None:
        results.append((True, check, detail))
        line = f"OK – {check}"
        if detail:
            line += f" – {detail}"
        print(line)

    def fail(check: str, detail: str = "") -> None:
        results.append((False, check, detail))
        line = f"FEHLER – {check}"
        if detail:
            line += f" – {detail}"
        print(line)

    def _run(client: httpx.Client) -> None:
        _check_health(client, api_url, ok, fail)
        for slug in orgs:
            _check_org(client, api_url, frontend_url, slug, ok, fail)
        if register_email and camp_slug and orgs:
            _check_registration(client, api_url, orgs[0], camp_slug, register_email, ok, fail)

    if _client is not None:
        _run(_client)
    else:
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            _run(client)

    return results


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--api-url", required=True, help="Backend-URL")
    parser.add_argument("--frontend-url", required=True, help="Frontend-URL")
    parser.add_argument(
        "--org", action="append", dest="orgs", required=True, metavar="SLUG",
        help="Org-Slug (kann mehrfach angegeben werden)",
    )
    parser.add_argument("--register-email", default=None, help="E-Mail für optionale Testanmeldung")
    parser.add_argument("--camp", default=None, metavar="SLUG", help="Camp-Slug für Testanmeldung")
    args = parser.parse_args()

    if bool(args.register_email) != bool(args.camp):
        parser.error("--register-email und --camp müssen zusammen angegeben werden")

    results = run_checks(
        api_url=args.api_url,
        frontend_url=args.frontend_url,
        orgs=args.orgs,
        register_email=args.register_email,
        camp_slug=args.camp,
    )

    failed = sum(1 for passed, _, _ in results if not passed)
    total = len(results)
    print()
    print(f"{'ALLE OK' if failed == 0 else f'{failed} FEHLER'} – {total - failed}/{total} Prüfungen bestanden")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
