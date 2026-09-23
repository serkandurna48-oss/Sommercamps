#!/usr/bin/env python
"""
Onboard a new CampsPilot SaaS tenant (organization + its camps) against the
admin API in app/routers/admin.py, instead of hand-writing SQL in
backend_saas/seeds/*.sql.

Usage:
    python scripts/onboard_tenant.py --config seeds/campspilot-pilot.json \\
        --api-url http://localhost:8001 --email owner@example.com --password ...

    # or set CAMPSPILOT_EMAIL/CAMPSPILOT_PASSWORD in the environment instead

Requires SUPABASE_URL and SUPABASE_ANON_KEY in the environment (same values
backend_saas/.env uses) — this script signs in via Supabase Auth, same as
the frontend's login (feat/platform-foundation replaced the old single
ADMIN_PASSWORD scheme this script used to call directly). The signed-in
account needs platform_owner or the right org_admin membership already —
create one with scripts/create_platform_user.py first.

Idempotent: if the organization or a camp already exists (409 from the API),
this logs it and continues rather than aborting — re-running the same config
after a partial failure is safe, matching the seed files' `on conflict do
nothing` spirit. Any other error (network, 401, 422, 500) stops the script
with a non-zero exit code.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx


def _load_config(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _login(email: str, password: str) -> str:
    """Signs in via Supabase Auth directly (the password grant type of
    GoTrue's token endpoint) — same mechanism the frontend's login server
    actions use (see frontend/app/lib/supabaseServer.ts), just called from
    a standalone script instead of Next.js."""
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


def _create_organization(client: httpx.Client, api_url: str, token: str, org: dict) -> bool:
    """Returns True if newly created, False if it already existed."""
    response = client.post(
        f"{api_url}/admin/organizations",
        json=org,
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 201:
        print(f"  organization '{org['slug']}': created")
        return True
    if response.status_code == 409:
        print(f"  organization '{org['slug']}': already exists, skipping")
        return False
    print(f"  organization '{org['slug']}': FAILED — HTTP {response.status_code} — {response.text}")
    sys.exit(1)


def _create_camp(client: httpx.Client, api_url: str, token: str, org_slug: str, camp: dict) -> None:
    response = client.post(
        f"{api_url}/admin/organizations/{org_slug}/camps",
        json=camp,
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code == 201:
        print(f"  camp '{camp['slug']}': created")
        return
    if response.status_code == 409:
        print(f"  camp '{camp['slug']}': already exists, skipping")
        return
    print(f"  camp '{camp['slug']}': FAILED — HTTP {response.status_code} — {response.text}")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", required=True, type=Path, help="Path to a tenant.json (see seeds/*.json for examples)")
    parser.add_argument("--api-url", default="http://localhost:8001", help="backend_saas base URL (default: local dev, port 8001)")
    parser.add_argument("--email", default=os.environ.get("CAMPSPILOT_EMAIL"), help="Defaults to the CAMPSPILOT_EMAIL env var.")
    parser.add_argument("--password", default=os.environ.get("CAMPSPILOT_PASSWORD"), help="Defaults to the CAMPSPILOT_PASSWORD env var.")
    args = parser.parse_args()

    if not args.email or not args.password:
        print("Email/password required (use --email/--password or set CAMPSPILOT_EMAIL/CAMPSPILOT_PASSWORD).", file=sys.stderr)
        sys.exit(1)

    config = _load_config(args.config)
    org = config["organization"]
    camps = config.get("camps", [])

    print(f"Onboarding '{org['slug']}' against {args.api_url} ...")
    token = _login(args.email, args.password)
    with httpx.Client(timeout=10.0) as client:
        _create_organization(client, args.api_url, token, org)
        for camp in camps:
            _create_camp(client, args.api_url, token, org["slug"], camp)

    print("Done.")


if __name__ == "__main__":
    main()
