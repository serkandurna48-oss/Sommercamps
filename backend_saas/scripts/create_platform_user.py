#!/usr/bin/env python
"""
One-time setup: create a Supabase Auth user and grant it a platform role —
either platform_owner (sees/steers every organization) or org_admin for one
specific organization. Replaces the old "just know ADMIN_PASSWORD" model
(feat/platform-foundation).

Deliberately a script, not a UI/API endpoint: the very first platform_owner
must exist before any authenticated request can succeed, so nothing in the
running app can create it (see app/auth_deps.py — every route that could
grant a role already requires an authenticated, role-holding caller).
Assigning further org_admins later goes through the real API
(POST /admin/organizations/{slug}/members) instead, once at least one
owner exists to call it. Further platform_owners are granted in the
console at /platform/team (POST /admin/platform/owners); this script is
only the bootstrap / emergency path.

An existing account is found first (paged lookup) and then neither
re-created nor asked for a password. --existing-only refuses to create
anything; --dry-run prints what would change and writes nothing.

Usage:
    python scripts/create_platform_user.py --email owner@example.com --role owner --existing-only --dry-run
    python scripts/create_platform_user.py --email owner@example.com --role owner
    python scripts/create_platform_user.py --email admin@example.com --role org_admin --org demo-fc

Password is never a CLI argument (would land in shell history) — always
prompted interactively (getpass), or read from the CREATE_PLATFORM_USER_PASSWORD
environment variable for non-interactive use (e.g. CI), never written
anywhere by this script.

Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DATABASE_URL in the
environment/.env — the same values app/config.py already reads. Run this
against a database that already has
supabase/migrations/20260923220000_add_platform_roles_and_audit_log.sql
applied (platform_owners/organization_members tables) — see that
migration's header for the exact apply command; this script does not apply
it for you and will fail with a clear database error if it's missing.
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
from pathlib import Path

import httpx
import psycopg2
from psycopg2.extras import Json, RealDictCursor
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


def _dsn_with_sslmode(database_url: str) -> str:
    # Mirrors app/db.py's own rule: sslmode=require for any non-localhost
    # host, never for the local Supabase stack. Kept as a tiny standalone
    # copy here rather than importing app.db, so this script has zero
    # dependency on the running app's import-time side effects (settings
    # validation, connection pool setup) — it only ever needs a bare
    # psycopg2 connection.
    if "localhost" in database_url or "127.0.0.1" in database_url:
        return database_url
    separator = "&" if "?" in database_url else "?"
    return f"{database_url}{separator}sslmode=require"


def _find_supabase_user(supabase_url: str, service_role_key: str, email: str) -> str | None:
    """Pages through GoTrue's admin user list. GoTrue ignores an `email`
    query parameter, so a single unpaged request only ever saw the first
    page (50 accounts by default) and could miss an existing account."""
    headers = {"Authorization": f"Bearer {service_role_key}", "apikey": service_role_key}
    per_page = 200
    for page in range(1, 51):
        lookup = httpx.get(
            f"{supabase_url}/auth/v1/admin/users",
            headers=headers,
            params={"page": page, "per_page": per_page},
            timeout=10.0,
        )
        lookup.raise_for_status()
        users = lookup.json().get("users", [])
        for user in users:
            if (user.get("email") or "").lower() == email.lower():
                return user["id"]
        if len(users) < per_page:
            return None
    return None


def _create_supabase_user(supabase_url: str, service_role_key: str, email: str, password: str) -> str:
    headers = {"Authorization": f"Bearer {service_role_key}", "apikey": service_role_key}
    response = httpx.post(
        f"{supabase_url}/auth/v1/admin/users",
        headers=headers,
        json={"email": email, "password": password, "email_confirm": True},
        timeout=10.0,
    )
    if response.status_code in (200, 201):
        return response.json()["id"]
    print(f"Failed to create Supabase Auth user: HTTP {response.status_code} — {response.text}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--role", required=True, choices=["owner", "org_admin"])
    parser.add_argument("--org", help="Organization slug — required and only used when --role org_admin")
    parser.add_argument(
        "--existing-only",
        action="store_true",
        help="Never create an account: fail if the e-mail has no Supabase Auth account yet",
    )
    parser.add_argument("--dry-run", action="store_true", help="Show what would change, write nothing")
    args = parser.parse_args()

    if args.role == "org_admin" and not args.org:
        parser.error("--org is required when --role org_admin")

    supabase_url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    database_url = os.environ.get("DATABASE_URL")
    missing = [
        name
        for name, value in [
            ("SUPABASE_URL", supabase_url),
            ("SUPABASE_SERVICE_ROLE_KEY", service_role_key),
            ("DATABASE_URL", database_url),
        ]
        if not value
    ]
    if missing:
        print(f"Missing required environment variable(s): {', '.join(missing)}", file=sys.stderr)
        print("Set them in backend_saas/.env (see .env.example) before running this script.", file=sys.stderr)
        sys.exit(1)

    user_id = _find_supabase_user(supabase_url, service_role_key, args.email)
    if user_id is not None:
        # Existing account: never asks for or changes its password.
        print(f"Existing Supabase Auth account found: {args.email} ({user_id})")
    elif args.existing_only:
        print(f"No Supabase Auth account for {args.email} — nothing changed (--existing-only).", file=sys.stderr)
        sys.exit(1)
    elif args.dry_run:
        print(f"[dry-run] Would create a Supabase Auth account for {args.email}.")
        return
    else:
        password = os.environ.get("CREATE_PLATFORM_USER_PASSWORD") or getpass.getpass(
            f"Password for {args.email} (min 8 characters, never printed or logged): "
        )
        if len(password) < 8:
            print("Password must be at least 8 characters.", file=sys.stderr)
            sys.exit(1)
        user_id = _create_supabase_user(supabase_url, service_role_key, args.email, password)
        print(f"Supabase Auth user created: {args.email} ({user_id})")

    conn = psycopg2.connect(_dsn_with_sslmode(database_url))
    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if args.role == "owner":
                    cur.execute("select 1 from platform_owners where user_id = %s", (user_id,))
                    if cur.fetchone() is not None:
                        print(f"{args.email} already is a platform_owner — nothing changed.")
                        return
                    if args.dry_run:
                        print(f"[dry-run] Would make {args.email} a platform_owner.")
                        return
                    cur.execute("insert into platform_owners (user_id) values (%s)", (user_id,))
                    cur.execute(
                        "insert into audit_log (actor_email, action, target_type, target_id, metadata) "
                        "values (%s, 'platform.owner_granted', 'platform_owner', %s, %s)",
                        ("script:create_platform_user", user_id, Json({"email": args.email})),
                    )
                    print(f"{args.email} is now a platform_owner.")
                else:
                    cur.execute("select id from organizations where slug = %s", (args.org,))
                    org = cur.fetchone()
                    if org is None:
                        print(f"No organization with slug '{args.org}' exists.", file=sys.stderr)
                        sys.exit(1)
                    if args.dry_run:
                        print(f"[dry-run] Would make {args.email} org_admin for '{args.org}'.")
                        return
                    cur.execute(
                        """
                        insert into organization_members (organization_id, user_id, role)
                        values (%s, %s, 'org_admin')
                        on conflict (organization_id, user_id) do update set role = excluded.role
                        """,
                        (org["id"], user_id),
                    )
                    print(f"{args.email} is now org_admin for '{args.org}'.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
