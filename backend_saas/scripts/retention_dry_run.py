"""Local, read-only retention inventory. Never connects to a remote database.

Usage: python scripts/retention_dry_run.py --dsn 'host=localhost ...' --organization-id UUID
No apply/delete mode exists. Output is aggregate counts only, without personal data.
"""

from __future__ import annotations

import argparse
from datetime import date, timedelta
from ipaddress import ip_address
from uuid import UUID

import psycopg2
from dateutil.relativedelta import relativedelta


def deadlines(camp_end: date) -> tuple[date, date]:
    return camp_end + timedelta(days=30), camp_end + relativedelta(months=12)


HEALTH_COUNT_SQL = """
select count(*) from public.camp_registrations r
join public.camps c on c.id = r.camp_id and c.organization_id = r.organization_id
where r.organization_id = %s and c.organization_id = %s
  and c.end_date + interval '30 days' <= %s
  and (r.allergies is not null or r.medical_notes is not null)
"""

GENERAL_COUNT_SQL = """
select count(*) from public.camp_registrations r
join public.camps c on c.id = r.camp_id and c.organization_id = r.organization_id
where r.organization_id = %s and c.organization_id = %s
  and c.end_date + interval '12 months' <= %s
"""


def local_dsn(dsn: str) -> bool:
    params = psycopg2.extensions.parse_dsn(dsn)
    if "service" in params:
        return False
    host = params.get("host", "")
    hostaddr = params.get("hostaddr")
    if "," in host or not host or (hostaddr and not _loopback(hostaddr)):
        return False
    return _loopback(host)


def _loopback(host: str) -> bool:
    if host.lower() == "localhost":
        return True
    try:
        return ip_address(host).is_loopback
    except ValueError:
        return False


def counts(cursor, organization_id: UUID, as_of: date) -> tuple[int, int]:
    scoped = (organization_id, organization_id, as_of)
    cursor.execute(HEALTH_COUNT_SQL, scoped)
    health = cursor.fetchone()[0]
    cursor.execute(GENERAL_COUNT_SQL, scoped)
    general = cursor.fetchone()[0]
    return health, general


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dsn", required=True, help="Explicit local PostgreSQL DSN; no environment fallback")
    parser.add_argument("--organization-id", required=True, type=UUID)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today())
    args = parser.parse_args()
    if not local_dsn(args.dsn):
        parser.error("Only an explicit loopback PostgreSQL host is accepted")
    with psycopg2.connect(args.dsn, connect_timeout=3) as connection:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("set local statement_timeout = '5s'")
            health, general = counts(cursor, args.organization_id, args.as_of)
        connection.rollback()
    print(f"as_of={args.as_of.isoformat()} health_review_rows={health} general_manual_review_rows={general}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
