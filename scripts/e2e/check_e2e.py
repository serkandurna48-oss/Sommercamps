"""After the browser E2E: club e2e-verein must hold exactly 1 registered + 1 waitlist row."""
import os
import sys

import psycopg2

PORT = int(os.environ.get("REVIEW_POSTGRES_PORT", "55443"))
with psycopg2.connect(host="127.0.0.1", port=PORT, user="postgres", dbname="e2e_campspilot", connect_timeout=5) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """SELECT r.status, count(*) FROM camp_registrations r
               JOIN organizations o ON o.id = r.organization_id
               WHERE o.slug = 'e2e-verein' GROUP BY r.status ORDER BY r.status"""
        )
        rows = dict(cur.fetchall())
expected = {"registered": 1, "waitlist": 1}
if rows != expected:
    print(f"E2E DB check failed: {rows} != {expected}", file=sys.stderr)
    sys.exit(1)
print("E2E DB check ok:", rows)
