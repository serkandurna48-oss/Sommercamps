#!/usr/bin/env python
"""
Seed a clearly-fictional demo tenant for hands-on testing of the full
CampsPilot SaaS flow (Verein einrichten -> Camp konfigurieren -> Eltern
melden an -> Admin verwaltet -> Export). Not a generic onboarding tool —
`scripts/onboard_tenant.py` already covers that; this script's org/camp/
registration data is intentionally hardcoded, not caller-configurable, so
it can never be pointed at a real customer by accident.

Safety, by construction:
- The target organization slug is a constant in this file, hardcoded and
  never editable via CLI args.
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

--reset: cancels all existing registrations in both demo camps first,
  then updates camp titles (removes historical [DEMO] prefix), then
  re-seeds everything fresh. Safe to run repeatedly.

Usage:
    python scripts/seed_demo.py --api-url http://localhost:8001 \\
        --email owner@example.com --password "$CAMPSPILOT_PASSWORD"

    # Sauberer Stand vor der Aufnahme:
    python scripts/seed_demo.py --api-url http://localhost:8001 \\
        --email owner@example.com --password "$CAMPSPILOT_PASSWORD" --reset

    # or via env vars:
    CAMPSPILOT_EMAIL=owner@example.com CAMPSPILOT_PASSWORD=secret \\
        python scripts/seed_demo.py

Requires SUPABASE_URL and SUPABASE_ANON_KEY in the environment (same values
backend_saas/.env uses) — signs in via Supabase Auth just like onboard_tenant.py.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DEMO_ORG_SLUG = "jk-academy-demo"
DEMO_ORG_NAME = "JK Performance Academy"
# theme "akademie" is intentionally not set here: OrganizationCreate/Update
# does not expose the `theme` column (admin_schemas.py:303-307). Reported in
# S1 bericht — must be set manually if needed, never via raw SQL on the cloud.
_BLOCKED_SLUGS = {"ksv-baunatal", "jk-performance-academy"}

ORGANIZATION = {
    "slug": DEMO_ORG_SLUG,
    "name": DEMO_ORG_NAME,
    "legal_name": None,
    "contact_email": "demo@campspilot.example",
    "contact_phone": "0170 0000000",
    "primary_color": "#C79B3B",
    "plan_status": "pilot",
    "iban": "DE89370400440532013000",
}

CAMP_A = {
    "slug": "sommercamp-2027",
    "title": "Sommercamp 2027",
    "start_date": "2027-07-07",
    "end_date": "2027-07-11",
    "age_min": 7,
    "age_max": 14,
    "capacity": 4,
    "price_cents": 18900,
    "currency": "EUR",
    "location": "Sportanlage Kassel-Nord",
    "status": "published",
}

CAMP_B = {
    "slug": "herbstcamp-2027",
    "title": "Herbstcamp 2027",
    "start_date": "2027-10-18",
    "end_date": "2027-10-22",
    "age_min": 7,
    "age_max": 16,
    "capacity": 12,
    "price_cents": 16500,
    "currency": "EUR",
    "location": "Sportanlage Kassel-Nord",
    "status": "published",
}

# Camp A: capacity 4. First four fill the camp; the next three land on the
# waitlist in order — so Jan can click "Platz vergeben" live during the demo.
CAMP_A_REGISTRATIONS = [
    {
        "parent_first_name": "Robert", "parent_last_name": "Klein",
        "parent_email": "robert.klein@example.com", "parent_phone": "+49 170 2000001",
        "child_first_name": "Luca", "child_last_name": "Klein", "child_birth_date": "2017-04-09",
        "emergency_contact_name": "Sabine Klein", "emergency_contact_phone": "+49 170 2000011",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Monika", "parent_last_name": "Krüger",
        "parent_email": "monika.krueger@example.com", "parent_phone": "+49 170 2000002",
        "child_first_name": "Hanna", "child_last_name": "Krüger", "child_birth_date": "2016-09-15",
        "emergency_contact_name": "Frank Krüger", "emergency_contact_phone": "+49 170 2000012",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Jens", "parent_last_name": "Schwarz",
        "parent_email": "jens.schwarz@example.com", "parent_phone": "+49 170 2000003",
        "child_first_name": "Nils", "child_last_name": "Schwarz", "child_birth_date": "2018-02-20",
        "emergency_contact_name": "Yvonne Schwarz", "emergency_contact_phone": "+49 170 2000013",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Angela", "parent_last_name": "Brandt",
        "parent_email": "angela.brandt@example.com", "parent_phone": "+49 170 2000004",
        "child_first_name": "Tim", "child_last_name": "Brandt", "child_birth_date": "2017-11-07",
        "emergency_contact_name": "Dieter Brandt", "emergency_contact_phone": "+49 170 2000014",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        # Camp A is full after the four above — this and the next two land on
        # the waitlist in FIFO order.
        "parent_first_name": "Peter", "parent_last_name": "Koch",
        "parent_email": "peter.koch@example.com", "parent_phone": "+49 170 2000005",
        "child_first_name": "Laura", "child_last_name": "Koch", "child_birth_date": "2018-07-03",
        "emergency_contact_name": "Ursula Koch", "emergency_contact_phone": "+49 170 2000015",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        "parent_first_name": "Maria", "parent_last_name": "Schuster",
        "parent_email": "maria.schuster@example.com", "parent_phone": "+49 170 2000006",
        "child_first_name": "Felix", "child_last_name": "Schuster", "child_birth_date": "2019-03-25",
        "emergency_contact_name": "Hans Schuster", "emergency_contact_phone": "+49 170 2000016",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        "parent_first_name": "Lukas", "parent_last_name": "Vogel",
        "parent_email": "lukas.vogel@example.com", "parent_phone": "+49 170 2000007",
        "child_first_name": "Jana", "child_last_name": "Vogel", "child_birth_date": "2016-12-11",
        "emergency_contact_name": "Christine Vogel", "emergency_contact_phone": "+49 170 2000017",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
]

# Camp B: capacity 12, 6 registrations (2 free spots) with mixed payment.
# Notable: Hansen has a food allergy (Aufgaben demo), Richter has no
# emergency contact (a visible gap in "Aufgaben").
CAMP_B_REGISTRATIONS = [
    {
        "parent_first_name": "Frank", "parent_last_name": "Neumann",
        "parent_email": "frank.neumann@example.com", "parent_phone": "+49 170 2000020",
        "child_first_name": "Max", "child_last_name": "Neumann", "child_birth_date": "2015-06-18",
        "emergency_contact_name": "Ingrid Neumann", "emergency_contact_phone": "+49 170 2000030",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Birgit", "parent_last_name": "Schäfer",
        "parent_email": "birgit.schaefer@example.com", "parent_phone": "+49 170 2000021",
        "child_first_name": "Lea", "child_last_name": "Schäfer", "child_birth_date": "2016-03-30",
        "emergency_contact_name": "Walter Schäfer", "emergency_contact_phone": "+49 170 2000031",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        # Allergy child — shows up as orange task card in admin "Aufgaben".
        "parent_first_name": "Hans-Peter", "parent_last_name": "Hansen",
        "parent_email": "hp.hansen@example.com", "parent_phone": "+49 170 2000022",
        "child_first_name": "Erik", "child_last_name": "Hansen", "child_birth_date": "2014-10-05",
        "allergies": "Glutenunverträglichkeit (Zöliakie) — bitte glutenfreie Verpflegung",
        "emergency_contact_name": "Gudrun Hansen", "emergency_contact_phone": "+49 170 2000032",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Melanie", "parent_last_name": "Richter",
        "parent_email": "melanie.richter@example.com", "parent_phone": "+49 170 2000023",
        "child_first_name": "Noah", "child_last_name": "Richter", "child_birth_date": "2015-08-14",
        "emergency_contact_name": "Bernd Richter", "emergency_contact_phone": "+49 170 2000033",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
    {
        "parent_first_name": "Oliver", "parent_last_name": "Fuchs",
        "parent_email": "oliver.fuchs@example.com", "parent_phone": "+49 170 2000024",
        "child_first_name": "Luisa", "child_last_name": "Fuchs", "child_birth_date": "2016-01-22",
        "emergency_contact_name": "Katja Fuchs", "emergency_contact_phone": "+49 170 2000034",
        "photo_permission": False, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": True,
    },
    {
        "parent_first_name": "Ute", "parent_last_name": "Schreiber",
        "parent_email": "ute.schreiber@example.com", "parent_phone": "+49 170 2000025",
        "child_first_name": "Paul", "child_last_name": "Schreiber", "child_birth_date": "2017-05-08",
        "emergency_contact_name": "Ralf Schreiber", "emergency_contact_phone": "+49 170 2000035",
        "photo_permission": True, "terms_accepted": True, "privacy_accepted": True,
        "_mark_paid": False,
    },
]


def _login(email: str, password: str) -> str:
    """Signs in via Supabase Auth — same mechanism as onboard_tenant.py and the
    frontend's login server actions (feat/platform-foundation replaced the old
    single ADMIN_PASSWORD/POST /admin/login scheme)."""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_anon_key = os.environ.get("SUPABASE_ANON_KEY")
    if not supabase_url or not supabase_anon_key:
        print("SUPABASE_URL and SUPABASE_ANON_KEY must be set in the environment.", file=sys.stderr)
        sys.exit(1)
    response = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": supabase_anon_key, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=10.0,
    )
    if response.status_code != 200:
        print(f"Login failed: HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)
    return response.json()["access_token"]


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


def _publish_organization(client: httpx.Client, api_url: str, token: str) -> None:
    response = client.patch(
        f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}",
        json={"site_published": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 200:
        print(f"  organization '{DEMO_ORG_SLUG}': site_published=true")
    else:
        print(f"  organization '{DEMO_ORG_SLUG}': publish FAILED — HTTP {response.status_code} — {response.text}", file=sys.stderr)
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


def _update_camp_title(client: httpx.Client, api_url: str, token: str, camp: dict) -> None:
    response = client.patch(
        f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps/{camp['slug']}",
        json={"title": camp["title"]},
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 200:
        print(f"  camp '{camp['slug']}': title updated to '{camp['title']}'")
    else:
        print(f"  camp '{camp['slug']}': title update FAILED — HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)


def _existing_registrations(client: httpx.Client, api_url: str, token: str, camp_slug: str) -> list[dict]:
    response = client.get(
        f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps/{camp_slug}/registrations",
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code != 200:
        print(f"  could not list registrations for '{camp_slug}': HTTP {response.status_code}", file=sys.stderr)
        sys.exit(1)
    return response.json()


def _existing_emails(client: httpx.Client, api_url: str, token: str, camp_slug: str) -> set[str]:
    return {row["parent_email"] for row in _existing_registrations(client, api_url, token, camp_slug)}


def _reset_registrations(client: httpx.Client, api_url: str, token: str, camp_slug: str) -> None:
    rows = _existing_registrations(client, api_url, token, camp_slug)
    active = [r for r in rows if r.get("status") not in ("cancelled",)]
    if not active:
        print(f"  camp '{camp_slug}': no active registrations to cancel")
        return
    print(f"  camp '{camp_slug}': cancelling {len(active)} registrations ...")
    for reg in active:
        token_ = reg["registration_token"]
        resp = client.post(
            f"{api_url}/admin/organizations/{DEMO_ORG_SLUG}/camps/{camp_slug}/registrations/{token_}/cancel",
            headers={"Authorization": f"Bearer {token}"},
        )
        if resp.status_code not in (200, 204):
            print(f"    cancel {token_} FAILED — HTTP {resp.status_code} — {resp.text}", file=sys.stderr)
            sys.exit(1)
        print(f"    cancelled {reg.get('child_first_name', '?')} {reg.get('child_last_name', '?')} ({reg.get('parent_email', '?')})")


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
    parser.add_argument("--api-url", default="http://localhost:8001", help="backend_saas base URL (default: local dev -Saas, port 8001)")
    parser.add_argument("--email", default=os.environ.get("CAMPSPILOT_EMAIL"), help="Platform-admin email. Defaults to CAMPSPILOT_EMAIL env var.")
    parser.add_argument("--password", default=os.environ.get("CAMPSPILOT_PASSWORD"), help="Platform-admin password. Defaults to CAMPSPILOT_PASSWORD env var.")
    parser.add_argument("--reset", action="store_true", help="Alle Demo-Anmeldungen zuerst stornieren, dann sauber neu anlegen. Setzt außerdem Camp-Titel auf die aktuellen Werte.")
    args = parser.parse_args()

    if not args.email or not args.password:
        print("Email and password required (use --email/--password or set CAMPSPILOT_EMAIL/CAMPSPILOT_PASSWORD).", file=sys.stderr)
        sys.exit(1)

    with httpx.Client(timeout=10.0) as client:
        health = client.get(f"{args.api_url}/health")
        if health.status_code != 200 or health.json().get("service") != "campspilot-saas-api":
            print(f"Refusing to run: {args.api_url}/health did not identify as campspilot-saas-api ({health.status_code}: {health.text}).", file=sys.stderr)
            sys.exit(1)

        print(f"Seeding demo tenant '{DEMO_ORG_SLUG}' against {args.api_url} ...")
        token = _login(args.email, args.password)
        _create_organization(client, args.api_url, token)
        _publish_organization(client, args.api_url, token)
        _create_camp(client, args.api_url, token, CAMP_A)
        _create_camp(client, args.api_url, token, CAMP_B)

        if args.reset:
            print("--reset: storniere alle aktiven Anmeldungen ...")
            _reset_registrations(client, args.api_url, token, CAMP_A["slug"])
            _reset_registrations(client, args.api_url, token, CAMP_B["slug"])
            print("--reset: aktualisiere Camp-Titel ...")
            _update_camp_title(client, args.api_url, token, CAMP_A)
            _update_camp_title(client, args.api_url, token, CAMP_B)

        print(f"  seeding registrations for '{CAMP_A['slug']}' ...")
        _seed_registrations(client, args.api_url, token, CAMP_A["slug"], CAMP_A_REGISTRATIONS)
        print(f"  seeding registrations for '{CAMP_B['slug']}' ...")
        _seed_registrations(client, args.api_url, token, CAMP_B["slug"], CAMP_B_REGISTRATIONS)

    print("Done.")
    print(f"Parent view:  http://localhost:3000/pilot/{DEMO_ORG_SLUG}/")
    print(f"Admin login:  http://localhost:3000/pilot/{DEMO_ORG_SLUG}/login")
    print()
    print("Serkan: Demo-User als org_admin der neuen Org einrichten:")
    print(f"  python scripts/create_platform_user.py --role org_admin --org {DEMO_ORG_SLUG}")
    print("  (Passwort über CAMPSPILOT_PASSWORD env var setzen)")
    print()
    print("Hinweis: theme 'akademie' nicht per API setzbar (admin_schemas.py:303). Default bleibt 'tradition'.")


if __name__ == "__main__":
    main()
