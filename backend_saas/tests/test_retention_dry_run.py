from datetime import date
from uuid import uuid4

from scripts.retention_dry_run import counts, deadlines, local_dsn


def test_deadlines_cover_february_and_leap_year():
    assert deadlines(date(2024, 2, 29)) == (date(2024, 3, 30), date(2025, 2, 28))
    assert deadlines(date(2023, 2, 28)) == (date(2023, 3, 30), date(2024, 2, 28))


def test_only_loopback_dsn():
    assert local_dsn("host=localhost dbname=synthetic")
    assert not local_dsn("host=example.com dbname=synthetic")
    assert not local_dsn("dbname=synthetic")
    assert not local_dsn("host=localhost hostaddr=203.0.113.2 dbname=synthetic")
    assert not local_dsn("host=localhost service=remote dbname=synthetic")


def test_counts_are_tenant_scoped_read_only_and_idempotent():
    class Cursor:
        def __init__(self):
            self.calls = []
        def execute(self, sql, params):
            self.calls.append((sql, params))
        def fetchone(self):
            return (2,) if len(self.calls) % 2 else (5,)
    cursor = Cursor()
    org = uuid4()
    today = date(2026, 10, 27)
    assert counts(cursor, org, today) == (2, 5)
    assert counts(cursor, org, today) == (2, 5)
    for sql, params in cursor.calls:
        assert params == (str(org), str(org), today)
        assert "r.organization_id = %s" in sql and "c.organization_id = %s" in sql
        assert "delete" not in sql.lower() and "update" not in sql.lower()
