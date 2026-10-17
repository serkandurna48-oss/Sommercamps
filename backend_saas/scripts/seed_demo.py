#!/usr/bin/env python
"""
Seed a clearly-fictional demo tenant for hands-on testing of the full
CampsPilot SaaS flow (Verein einrichten -> Camp konfigurieren -> Eltern
melden an -> Admin verwaltet -> Export). Not a generic onboarding tool —
`scripts/onboard_tenant.py` already covers that; this script's org/camp/
registration data is intentionally hardcoded, not caller-configurable, so
it can never be pointed at a real customer by accident.

Safety, by construction:
- The target organization slug/name are constants in this file, both
  containing "demo" — never editable via CLI args.
- Hard-blocks the two real-customer slugs that already exist in the
  Cloud CampsPilot SaaS project (ksv-baunatal, jk-performance-academy) —
  this script will refuse to run if DEMO_ORG_SLUG were ever changed to
  either of those (defense in depth; they can never match today).
- Verifies GET /health identifies as "campspilot-saas-api" before writing
  anything — refuses to run against an unrelated service that happens to
  listen on the same port/URL.
- Idempotent: re-running is safe. Organization/camp creation already
  no-ops on 409 (existing app/routers/admin.py behavior). Registration
  seeding additionally checks the camp's current registrations first and
  skips any parent_email that's already present, so re-running never
  creates duplicate demo registrations or double-applies payment/cancel
  actions.

Usage:
    python scripts/seed_demo.py --api-url http://localhost:8000 \
        --admin-password "$ADMIN_PASSWORD"
"""

from __future__ import annotations

import argparse
import os
import sys

import httpx

DEMO_ORG_SLUG = "jk-demo-campspilot-test"
DEMO_ORG_NAME = "JK Demo – CampsPilot Test"
_BLOCKED_SLUGS = {"ksv-baunatal", "jk-performance-academy"}

ORGANIZATION = {
    "slug": DEMO_ORG_SLUG,
    "name": DEMO_ORG_NAME,
    "legal_name": None,
    "contact_email": "demo@campspilot.example",
    "contact_phone": "0170 0000000",
    "primary_color": "#1c6b45",
    "plan_status": "pilot",
    "iban": "DE89370400440532013000",
}

CAMP_A = {
    "slug": "sommerwoche-1",
    "title": "[DEMO] Feriencamp Sommerwoche 1",
    "start_date": "2027-07-05",
    "end_date": "2027-07-09",
    "age_min": 6,
    "age_max": 12,
    "capacity": 3,
    "price_cents": 8900,
    "currency": "EUR",
    "location": "Sportplatz Musterstadt",
    "status": "published",
}

CAMP_B = {
    "slug": "herbstwoche-1",
    "title": "[DEMO] Feriencamp Herbstwoche",
    "start_date": "2027-10-11",
    "end_date": "2027-10-15",
    "age_min": 6,
    "age_max": 14,
    "capacity": 8,
    "price_cents": 7500,
    "currency": "EUR",
    "location": "Sportplatz Musterstadt",
    "status": "published",
}

# Camp A: capacity 3. First three registered fill it, the fourth is the
# demo's waitlist case — left on the waitlist (not pre-promoted) so the
# handoff click-test can exercise "Warteliste aufrücken lassen" live.
CAMP_A_REGISTRATIONS = [
    {
        "parent_first_name": "Anna", "parent_last_name": "Beispiel",
        "parent_email": "anna.beispiel@example.com", "parent_phone": "+49 170 1000001",
        "child_first_name": "Mia", "child_last_name": "Beispiel", "child_birth_date": "2018-03-11",
        "emergency_contact_name": "Peter Beispiel", "emergency_contact_phone": "+49 170 1000011",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Peter", "parent_last_name": "Beispiel",
        "parent_email": "peter.beispiel@example.com", "parent_phone": "+49 170 1000002",
        "child_first_name": "Ben", "child_last_name": "Beispiel", "child_birth_date": "2017-06-20",
        "allergies": "Nussallergie — Epipen dabei",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        "parent_first_name": "Petra", "parent_last_name": "Beispiel",
        "parent_email": "petra.beispiel@example.com", "parent_phone": "+49 170 1000003",
        "child_first_name": "Clara", "child_last_name": "Beispiel", "child_birth_date": "2019-01-05",
        "emergency_contact_name": "Dirk Beispiel", "emergency_contact_phone": "+49 170 1000013",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        # Camp A is full after the three above — this one lands on the
        # waitlist via the existing capacity/waitlist rule, not a special
        # case in this script.
        "parent_first_name": "Dirk", "parent_last_name": "Beispiel",
        "parent_email": "dirk.beispiel@example.com", "parent_phone": "+49 170 1000004",
        "child_first_name": "David", "child_last_name": "Beispiel", "child_birth_date": "2018-09-02",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
]

# Camp B: capacity 8, deliberately nowhere near full — the demo's
# "normal, not-full camp" contrast to Camp A's full+waitlist story.
CAMP_B_REGISTRATIONS = [
    {
        "parent_first_name": "Erik", "parent_last_name": "Beispiel",
        "parent_email": "erik.beispiel@example.com", "parent_phone": "+49 170 1000005",
        "child_first_name": "Emma", "child_last_name": "Beispiel", "child_birth_date": "2016-11-30",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Frida", "parent_last_name": "Beispiel",
        "parent_email": "frida.beispiel@example.com", "parent_phone": "+49 170 1000006",
        "child_first_name": "Finn", "child_last_name": "Beispiel", "child_birth_date": "2015-04-18",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
]


def _login(client: httpx.Client, api_url: str, password: str) -> str:
    response = client.post(f"{api_url}/admin/login", json={"password": password})
    if response.status_code != 200:
        print(f"Login failed: HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)
    return response.json()["token"]


def _create_organization(client: httpx.Client, api_url: str, token: str) -> None:
    response = client.post(
        f"{api_url}/admin/organizations", json=ORGANIZATION, headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 201:
        print(f"  organization '{DEMO_ORG_SLUG}': created")
    elif response.status_code == 409:
        print(f"  organization '{DEMO_ORG_SLUG}': already exists, skipping")
    else:
        print(f"  organization '{DEMO_ORG_SLUG}': FAILED — HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)


def _create_camp(client: httpx.Client, api_url: str, token: str, camp: dict) -> None:
    response = client.post(
        f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps", json=camp, headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 201:
        print(f"  camp '{camp['slug']}': created")
    elif response.status_code == 409:
        print(f"  camp '{camp['slug']}': already exists, skipping")
    else:
        print(f"  camp '{camp['slug']}': FAILED — HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)


def _existing_emails(client: httpx.Client, api_url: str, token: str, camp_slug: str) -> set[str]:
    response = client.get(
        f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps/{camp_slug}/registrations",
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code != 200:
        print(f"  could not list existing registrations for '{camp_slug}': HTTP {response.status_code}", file=sys.stderr)
        sys.exit(1)
    return {row["parent_email"] for row in response.json()}


def _seed_registrations(client: httpx.Client, api_url: str, token: str, camp_slug: str, registrations: list[dict]) -> None:
    already = _existing_emails(client, api_url, token, camp_slug)
    for reg in registrations:
        payload = {k: v for k, v in reg.items() if not k.startswith("_")}
        if payload["parent_email"] in already:
            print(f"  registration for '{payload['parent_email']}': already exists, skipping")
            continue
        response = client.post(
            f"{api_url}/api/v1/organizations/{DEMO_ORG_SLUG}/camps/{camp_slug}/registrations", json=payload
        )
        if response.status_code != 201:
            print(f"  registration for '{payload['parent_email']}': FAILED — HTTP {response.status_code} — {response.text}", file=sys.stderr)
            sys.exit(1)
        body = response.json()
        print(f"  registration for '{payload['parent_email']}': created (status={body['status']})")

        if reg.get("_mark_paid") and body["status"] != "waitlist":
            token_ = body["registration_token"]
            patch = client.patch(
                f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps/{camp_slug}/registrations/{token_}/payment-status",
                json={"payment_status": "paid"},
                headers={"Authorization": f"Bearer {token}"},
            )
            if patch.status_code != 200:
                print(f"    mark-paid FAILED — HTTP {patch.status_code} — {patch.text}", file=sys.stderr)
                sys.exit(1)
            print("    marked as paid")


def main() -> None:
    if DEMO_ORG_SLUG in _BLOCKED_SLUGS:
        print(f"Refusing to run: DEMO_ORG_SLUG '{DEMO_ORG_SLUG}' collides with a real-customer slug.", file=sys.stderr)
        sys.exit(1)

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-url", default="http://localhost:8000", help="backend_saas base URL (default: local dev, port 8000)")
    parser.add_argument("--admin-password", default=os.environ.get("ADMIN_PASSWORD"), help="Platform-admin password. Defaults to the ADMIN_PASSWORD env var.")
    args = parser.parse_args()

    if not args.admin_password:
        print("No admin password given (use --admin-password or set ADMIN_PASSWORD).", file=sys.stderr)
        sys.exit(1)

    with httpx.Client(timeout=10.0) as client:
        health = client.get(f"{args.api_url}/health")
        if health.status_code != 200 or health.json().get("service") != "campspilot-saas-api":
            print(f"Refusing to run: {args.api_url}/health did not identify as campspilot-saas-api ({health.status_code}: {health.text}).", file=sys.stderr)
            sys.exit(1)

        print(f"Seeding demo tenant '{DEMO_ORG_SLUG}' against {args.api_url} ...")
        token = _login(client, args.api_url, args.admin_password)
        _create_organization(client, args.api_url, token)
        _create_camp(client, args.api_url, token, CAMP_A)
        _create_camp(client, args.api_url, token, CAMP_B)
        print(f"  seeding registrations for '{CAMP_A['slug']}' ...")
        _seed_registrations(client, args.api_url, token, CAMP_A["slug"], CAMP_A_REGISTRATIONS)
        print(f"  seeding registrations for '{CAMP_B['slug']}' ...")
        _seed_registrations(client, args.api_url, token, CAMP_B["slug"], CAMP_B_REGISTRATIONS)

    print("Done.")
    print(f"Parent view:  http://localhost:3000/pilot/{DEMO_ORG_SLUG}")
    print(f"Admin login:  http://localhost:3000/pilot/{DEMO_ORG_SLUG}/login")


if __name__ == "__main__":
    main()
