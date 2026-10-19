"""Local bootstrap integrity checks, using only the assigned dev_l2 database."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

import psycopg2

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local


def snapshot():
    with psycopg2.connect(local.DSN, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT name,sha256 FROM public.dev_migrations ORDER BY name')
            migrations = cur.fetchall()
            cur.execute("SELECT id FROM public.organizations WHERE slug='jk-academy-demo'")
            organization = cur.fetchall()
            cur.execute("SELECT id FROM public.camps WHERE slug='demo-camp'")
            camps = cur.fetchall()
            return migrations, organization, camps


class BootstrapTests(unittest.TestCase):
    def test_repeat_preserves_migration_history_and_demo_ids(self):
        before = snapshot()
        with patch.dict(os.environ):
            local.initialize()
        self.assertEqual(before, snapshot())

    def test_changed_migration_checksum_aborts_before_seed(self):
        before = snapshot()
        name, digest = before[0][0]
        try:
            with psycopg2.connect(local.DSN, connect_timeout=3) as conn:
                with conn.cursor() as cur:
                    cur.execute('UPDATE public.dev_migrations SET sha256=%s WHERE name=%s', ('synthetic-drift', name))
            with patch.dict(os.environ), self.assertRaisesRegex(RuntimeError, 'Previously applied migration changed'):
                local.initialize()
            after = snapshot()
            self.assertEqual(before[1:], after[1:])
            self.assertEqual(len(before[0]), len(after[0]))
        finally:
            with psycopg2.connect(local.DSN, connect_timeout=3) as conn:
                with conn.cursor() as cur:
                    cur.execute('UPDATE public.dev_migrations SET sha256=%s WHERE name=%s', (digest, name))
        self.assertEqual(before, snapshot())


if __name__ == '__main__':
    unittest.main(verbosity=2)
