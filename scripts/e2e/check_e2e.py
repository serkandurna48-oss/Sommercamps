"""After the browser E2E: the database must hold exactly 1 registered + 1 waitlist row."""
import os
import sys

import psycopg2

PORT = int(os.environ.get("REVIEW_POSTGRES_PORT", "55443"))
with psycopg2.connect(host="127.0.0.1", port=PORT, user="postgres", dbname="e2e_campspilot", connect_timeout=5) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT status, count(*) FROM camp_registrations GROUP BY status ORDER BY status")
        rows = dict(cur.fetchall())
expected = {"registered": 1, "waitlist": 1}
if rows != expected:
    print(f"E2E DB check failed: {rows} != {expected}", file=sys.stderr)
    sys.exit(1)
print("E2E DB check ok:", rows)
