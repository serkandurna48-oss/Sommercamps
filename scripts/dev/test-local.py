"""Integration checks for the running L2 stack; loopback targets are constants."""
import hashlib
import json
from pathlib import Path
import unittest
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg2

ROOT = Path(__file__).resolve().parents[2]
API = 'http://127.0.0.1:8112'


class LocalStackTests(unittest.TestCase):
    def test_migrations_and_synthetic_seed(self):
        with psycopg2.connect('postgresql://postgres@127.0.0.1:55443/dev_l2', connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT name,sha256 FROM public.dev_migrations')
                actual = dict(cur.fetchall())
                expected = {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                            for p in (ROOT / 'supabase/migrations').glob('*.sql')}
                self.assertEqual(expected, actual)
                cur.execute("SELECT name,contact_email FROM organizations WHERE slug='jk-academy-demo'")
                self.assertEqual(('JK-Demo-Org', 'demo@campspilot.example'), cur.fetchone())
                cur.execute("SELECT count(*) FROM camps c JOIN organizations o ON o.id=c.organization_id WHERE o.slug='jk-academy-demo'")
                self.assertEqual(1, cur.fetchone()[0])

    def test_health_uses_local_database(self):
        with urlopen(API + '/health', timeout=10) as response:
            self.assertEqual('ok', json.load(response)['database'])

    def test_public_tenant_and_camp(self):
        with urlopen(API + '/api/v1/organizations/jk-academy-demo', timeout=10) as response:
            self.assertEqual('JK-Demo-Org', json.load(response)['name'])
        with urlopen(API + '/api/v1/organizations/jk-academy-demo/camps', timeout=10) as response:
            self.assertIn('demo-camp', response.read().decode())

    def test_cors_for_local_frontend(self):
        request = Request(API + '/health', method='OPTIONS', headers={
            'Origin': 'http://127.0.0.1:3112', 'Access-Control-Request-Method': 'GET'})
        with urlopen(request, timeout=10) as response:
            self.assertEqual('http://127.0.0.1:3112', response.headers['Access-Control-Allow-Origin'])

    def test_registration_writes_only_local_database(self):
        email = f'l2-{uuid4().hex}@campspilot.example'
        payload = dict(parent_first_name='Demo', parent_last_name='Eltern', parent_email=email,
                       parent_phone='000000000', child_first_name='Demo', child_last_name='Kind',
                       child_birth_date='2017-05-01', emergency_contact_phone='000000000',
                       terms_accepted=True, privacy_accepted=True)
        try:
            request = Request(API + '/api/v1/organizations/jk-academy-demo/camps/demo-camp/registrations',
                              data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
            with urlopen(request, timeout=10) as response:
                self.assertEqual(201, response.status)
                token = json.load(response)['registration_token']
            with psycopg2.connect('postgresql://postgres@127.0.0.1:55443/dev_l2') as conn:
                with conn.cursor() as cur:
                    cur.execute('SELECT parent_email FROM camp_registrations WHERE registration_token=%s', (token,))
                    self.assertEqual(email, cur.fetchone()[0])
        finally:
            with psycopg2.connect('postgresql://postgres@127.0.0.1:55443/dev_l2') as conn:
                with conn.cursor() as cur:
                    cur.execute('DELETE FROM camp_registrations WHERE parent_email=%s', (email,))

    def test_frontend_public_page(self):
        with urlopen('http://127.0.0.1:3112/pilot/jk-academy-demo', timeout=180) as response:
            self.assertEqual(200, response.status)
            self.assertIn('JK-Demo-Org', response.read().decode())


if __name__ == '__main__':
    unittest.main(verbosity=2)
