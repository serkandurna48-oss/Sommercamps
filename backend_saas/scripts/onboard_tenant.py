#!/usr/bin/env python
"""
Onboard a new CampsPilot SaaS tenant (organization + its camps) against the
admin API in app/routers/admin.py, instead of hand-writing SQL in
backend_saas/seeds/*.sql.

Usage:
    python scripts/onboard_tenant.py --config seeds/campspilot-pilot.json \\
        --api-url http://localhost:8001 --admin-password campspilot-dev-admin

    # or set ADMIN_PASSWORD in the environment instead of --admin-password

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


def _login(client: httpx.Client, api_url: str, password: str) -> str:
    response = client.post(f"{api_url}/admin/login", json={"password": password})
    if response.status_code != 200:
        print(f"Login failed: HTTP {response.status_code} — {response.text}", file=sys.stderr)
        sys.exit(1)
    return response.json()["token"]


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
    parser.add_argument(
        "--admin-password",
        default=os.environ.get("ADMIN_PASSWORD"),
        help="Platform-admin password. Defaults to the ADMIN_PASSWORD env var.",
    )
    args = parser.parse_args()

    if not args.admin_password:
        print("No admin password given (use --admin-password or set ADMIN_PASSWORD).", file=sys.stderr)
        sys.exit(1)

    config = _load_config(args.config)
    org = config["organization"]
    camps = config.get("camps", [])

    print(f"Onboarding '{org['slug']}' against {args.api_url} ...")
    with httpx.Client(timeout=10.0) as client:
        token = _login(client, args.api_url, args.admin_password)
        _create_organization(client, args.api_url, token, org)
        for camp in camps:
            _create_camp(client, args.api_url, token, org["slug"], camp)

    print("Done.")


if __name__ == "__main__":
    main()
