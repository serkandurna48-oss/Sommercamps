"""Fresh, throwaway database for the browser E2E test (parent registration).

Never connects anywhere except 127.0.0.1:<port>. Drops and recreates one
database named e2e_campspilot, applies all supabase/migrations, and seeds one
synthetic club with one camp (capacity 1, so the 2nd registration hits the waitlist).

    python scripts/e2e/seed_e2e.py            # port from REVIEW_POSTGRES_PORT, default 55443
"""
import os
import sys
from pathlib import Path

import psycopg2
from psycopg2 import sql

ROOT = Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("REVIEW_POSTGRES_PORT", "55443"))
DB = "e2e_campspilot"
BASE = dict(host="127.0.0.1", port=PORT, user="postgres", connect_timeout=5)


def main() -> None:
    admin = psycopg2.connect(dbname="postgres", **BASE)
    admin.autocommit = True
    with admin.cursor() as cur:
        cur.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(DB)))
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(DB)))
        for role in ("anon", "authenticated"):
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname = %s", (role,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
    admin.close()

    with psycopg2.connect(dbname=DB, **BASE) as conn, conn.cursor() as cur:
        cur.execute("CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY)")
        cur.execute(
            "CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS "
            "$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$"
        )
        for migration in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            cur.execute(migration.read_text(encoding="utf-8-sig"))
        cur.execute(
            """INSERT INTO organizations (slug, name, contact_email, site_published, theme)
               VALUES ('e2e-verein', 'E2E Testverein', 'verein@e2e.example', true, 'tradition')
               RETURNING id"""
        )
        org_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO camps (organization_id, slug, title, start_date, end_date,
                                  age_min, age_max, capacity, price_cents, status)
               VALUES (%s, 'e2e-camp', 'E2E Sommercamp', CURRENT_DATE + 60, CURRENT_DATE + 64,
                       6, 14, 1, 14900, 'published')""",
            (org_id,),
        )
    print(f"seeded {DB} on 127.0.0.1:{PORT}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # never print DSNs
        print("E2E seed failed:", type(exc).__name__, exc, file=sys.stderr)
        sys.exit(1)
