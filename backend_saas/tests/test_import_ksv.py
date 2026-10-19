"""Standalone unittest integration suite; no app settings or cloud connections.

python -m unittest discover -s backend_saas/tests -p test_import_ksv.py -v
"""
import contextlib
from concurrent.futures import ThreadPoolExecutor
import csv
import io
import os
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg2

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend_saas' / 'scripts'))
import import_ksv as importer

URL = 'postgresql://postgres@127.0.0.1:55443/dev_l5?hostaddr=127.0.0.1&connect_timeout=5'
SAMPLE = Path(__file__).parent / 'fixtures' / 'ksv_sample.csv'


class ImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get('REVIEW_POSTGRES_PORT') != '55443':
            raise RuntimeError('REVIEW_POSTGRES_PORT=55443 erforderlich; kein Skip')
        admin = psycopg2.connect(host='127.0.0.1', hostaddr='127.0.0.1', port=55443,
                                user='postgres', dbname='postgres', connect_timeout=5)
        admin.autocommit = True
        with admin.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname='dev_l5'")
            if not cur.fetchone():
                cur.execute('CREATE DATABASE dev_l5')
        admin.close()
        cls.conn = psycopg2.connect(URL)
        with cls.conn, cls.conn.cursor() as cur:
            cur.execute("SELECT to_regclass('public.organizations')")
            if cur.fetchone()[0] is None:
                migrations = ROOT / 'supabase' / 'migrations'
                # Actual relevant migrations, unchanged. No imitation target schema.
                for filename in ('20260917133748_create_saas_schema_v1.sql',
                                 '20260922143506_add_theme_and_parent_flow_fields.sql',
                                 '20261018000000_add_email_tracking_to_camp_registrations.sql'):
                    cur.execute((migrations / filename).read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def setUp(self):
        self.org, self.other, self.camp, self.othercamp = [str(uuid4()) for _ in range(4)]
        self.slug = 'l5-' + uuid4().hex
        self.other_slug = 'l5-' + uuid4().hex
        with self.conn, self.conn.cursor() as cur:
            for org, slug in ((self.org, self.slug), (self.other, self.other_slug)):
                cur.execute('INSERT INTO organizations (id,slug,name,contact_email) VALUES (%s,%s,%s,%s)',
                            (org, slug, 'L5 synthetic', 'test@campspilot.example'))
            for org, camp, slug in ((self.org, self.camp, 'sample-week'),
                                    (self.other, self.othercamp, 'foreign-week')):
                cur.execute('''INSERT INTO camps (id,organization_id,slug,title,start_date,end_date,
                            age_min,age_max,capacity,price_cents) VALUES
                            (%s,%s,%s,'Synthetic','2027-07-01','2027-07-05',5,12,100,1000)''',
                            (camp, org, slug))
        self.temp = tempfile.TemporaryDirectory()
        with SAMPLE.open(encoding='utf-8', newline='') as stream:
            reader = csv.DictReader(stream)
            self.headers, self.rows = reader.fieldnames, list(reader)

    def tearDown(self):
        self.temp.cleanup()
        with self.conn, self.conn.cursor() as cur:
            cur.execute('DELETE FROM camp_registrations WHERE organization_id IN (%s,%s)', (self.org,self.other))
            cur.execute('DELETE FROM camps WHERE organization_id IN (%s,%s)', (self.org,self.other))
            cur.execute('DELETE FROM organizations WHERE id IN (%s,%s)', (self.org,self.other))

    def file(self, rows):
        path = Path(self.temp.name) / 'input.csv'
        with path.open('w', encoding='utf-8', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def counts(self):
        with self.conn, self.conn.cursor() as cur:
            cur.execute('SELECT organization_id::text,count(*) FROM camp_registrations WHERE organization_id IN (%s,%s) GROUP BY organization_id', (self.org,self.other))
            return dict(cur.fetchall())

    def test_fixture_counts_and_atomic_rejection(self):
        for apply in (False, True):
            report = importer.run(SAMPLE, self.slug, URL, apply)
            self.assertEqual((report['rows'],report['valid'],report['duplicates'],len(report['errors'])), (30,26,1,4))
            self.assertEqual(report['written'],0)
            self.assertEqual(self.counts(),{})

    def test_mapping_idempotency_and_tenant(self):
        path = self.file(self.rows[:26])
        self.assertEqual(importer.run(path,self.slug,URL)['written'],0)
        self.assertEqual(self.counts(),{})
        self.assertEqual(importer.run(path,self.slug,URL,True)['written'],26)
        again = importer.run(path,self.slug,URL,True)
        self.assertEqual((again['written'],again['existing'],again['errors']), (0,26,[]))
        self.assertEqual(self.counts(),{self.org:26})
        with self.conn, self.conn.cursor() as cur:
            cur.execute('''SELECT parent_first_name,parent_last_name,parent_email,parent_phone,
                        child_birth_date::text,jersey_size,allergies,payment_status,
                        paid_at IS NOT NULL,photo_permission,terms_accepted,privacy_accepted,
                        camp_id::text FROM camp_registrations WHERE organization_id=%s AND child_first_name='Kind1' ''',(self.org,))
            self.assertEqual(cur.fetchone(), ('Ada','Beispiel','eltern1@campspilot.example','056100000',
                '2017-04-03','2XS (152)','Synthetische Allergie','paid',True,False,True,True,self.camp))

    def test_conflicting_repeat_never_updates(self):
        path = self.file(self.rows[:1])
        importer.run(path,self.slug,URL,True)
        self.rows[0]['phone']='000'
        report = importer.run(self.file(self.rows[:1]),self.slug,URL,True)
        self.assertEqual(len(report['errors']),1)
        self.assertEqual(report['written'],0)

    def test_foreign_camp_rejected(self):
        self.rows[0]['camp_slug']='foreign-week'
        report=importer.run(self.file(self.rows[:1]),self.slug,URL,True)
        self.assertEqual(len(report['errors']),1)
        self.assertEqual(self.counts(),{})

    def test_parallel_apply_serializes_imports(self):
        path = self.file(self.rows[:4])
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: importer.run(path,self.slug,URL,True), range(2)))
        self.assertEqual(sorted(r['written'] for r in results),[0,4])
        self.assertTrue(all(not r['errors'] for r in results))
        self.assertEqual(self.counts(),{self.org:4})

    def test_duplicate_child_with_new_id(self):
        row = self.rows[0].copy()
        row.update(id=str(uuid4()),registration_token=str(uuid4()))
        report = importer.run(self.file([self.rows[0],row]),self.slug,URL,True)
        self.assertEqual((report['duplicates'],report['written']), (1,0))
        self.assertEqual(self.counts(),{})
        importer.run(self.file([self.rows[0]]),self.slug,URL,True)
        report = importer.run(self.file([row]),self.slug,URL,True)
        self.assertEqual((report['duplicates'],report['written']), (1,0))

    def test_duplicate_tokens_and_sessions_in_csv(self):
        for field in ('registration_token','stripe_session_id'):
            with self.subTest(field=field):
                rows = [r.copy() for r in self.rows[:2]]
                value = rows[0][field] or 'cs_test_synthetic'
                for row in rows: row[field]=value
                report=importer.run(self.file(rows),self.slug,URL,True)
                self.assertEqual((report['duplicates'],report['written']),(1,0))
                self.assertEqual(self.counts(),{})

    def test_cross_org_token_collision_is_readonly_conflict(self):
        # Seed the other tenant with a token which the source tenant also uses.
        self.rows[0]['camp_slug']='foreign-week'
        importer.run(self.file(self.rows[:1]),self.other_slug,URL,True)
        self.rows[0]['camp_slug']='sample-week'
        for apply in (False,True):
            report=importer.run(self.file(self.rows[:1]),self.slug,URL,apply)
            self.assertEqual(len(report['errors']),1)
            self.assertEqual(report['written'],0)
            self.assertEqual(self.counts(),{self.other:1})

    def test_all_statuses_and_optional_values_preserved(self):
        rows=[r.copy() for r in self.rows[:5]]
        statuses=('registered','confirmed','cancelled','waitlist','registered')
        payments=('open','paid','refunded','waived','cancelled')
        for row,status,payment in zip(rows,statuses,payments):
            row.update(status=status,payment_status=payment,photo_permission='true',
                       email_sent_at='2026-09-01T11:00:00+02:00',
                       stripe_session_id='cs_test_'+row['id'],jersey_size='')
        result=importer.run(self.file(rows),self.slug,URL,True)
        self.assertEqual(result['written'],5)
        with self.conn,self.conn.cursor() as cur:
            cur.execute('''SELECT status,payment_status,jersey_size,photo_permission,
                        email_sent_at IS NOT NULL,stripe_session_id IS NOT NULL
                        FROM camp_registrations WHERE organization_id=%s ORDER BY child_first_name''',(self.org,))
            self.assertEqual(cur.fetchall(),list(zip(statuses,payments,[None]*5,[True]*5,[True]*5,[True]*5)))

    def test_bad_headers_and_missing_org(self):
        path=Path(self.temp.name)/'bad.csv'
        path.write_text('id,id\nx,y\n',encoding='utf-8')
        with self.assertRaises(ValueError): importer.run(path,self.slug,URL,True)
        with self.assertRaises(ValueError): importer.run(SAMPLE,'missing-l5-org',URL,True)
        self.assertEqual(self.counts(),{})

    def test_process_cli_and_row_diagnostics(self):
        process = subprocess.run([sys.executable,str(ROOT/'backend_saas/scripts/import_ksv.py'),
            '--csv',str(SAMPLE),'--org-slug',self.slug],
            env={**os.environ,'DATABASE_URL':URL},capture_output=True,text=True,timeout=15)
        self.assertEqual(process.returncode,2,process.stderr)
        import json
        report=json.loads(process.stdout)
        self.assertEqual([e['line'] for e in report['errors']],[28,29,30,31])
        self.assertIn('birth_date',report['errors'][0]['error'])
        self.assertEqual(report['rows'],30)
        self.assertEqual(self.counts(),{})
        self.assertNotIn('Synthetisch',process.stdout)

    def test_unicode_duplicate_matches_across_runs(self):
        row=self.rows[0].copy()
        row['child_first_name']='\u00c4nne'
        importer.run(self.file([row]),self.slug,URL,True)
        row.update(id=str(uuid4()),registration_token=str(uuid4()),child_first_name='A\u0308NNE')
        result=importer.run(self.file([row]),self.slug,URL,True)
        self.assertEqual((result['duplicates'],result['written']),(1,0))

    def test_multiline_bom_and_bad_csv_cells(self):
        row=self.rows[0].copy()
        row['allergies']='Synthetic\nsecond line'
        path=self.file([row])
        path.write_bytes(b'\xef\xbb\xbf'+path.read_bytes())
        self.assertEqual(importer.run(path,self.slug,URL,True)['written'],1)
        for suffix in (',extra',''):
            if suffix:
                content=','.join(self.headers)+'\n'+','.join(self.rows[1][h] for h in self.headers)+suffix+'\n'
            else:
                content=','.join(self.headers)+'\nshort,row\n'
            path.write_text(content,encoding='utf-8')
            self.assertEqual(len(importer.run(path,self.slug,URL,True)['errors']),1)
        path.write_text(','.join(self.headers)+'\n"unclosed',encoding='utf-8')
        with self.assertRaises(csv.Error): importer.run(path,self.slug,URL,True)

    def test_libpq_environment_cannot_redirect_hostaddr(self):
        clean_url='postgresql://postgres@127.0.0.1:55443/dev_l5?connect_timeout=99'
        with patch.dict(os.environ,PGHOSTADDR='192.0.2.1',PGCONNECT_TIMEOUT='99'):
            config=importer.target(clean_url)
            self.assertEqual(config['hostaddr'],'127.0.0.1')
            self.assertEqual(config['connect_timeout'],'5')
            self.assertEqual(importer.run(self.file(self.rows[:1]),self.slug,clean_url)['valid'],1)

    def test_database_failure_rolls_back_earlier_insert(self):
        original=importer.mapped
        def corrupt_second_row(row,org,camp):
            data=original(row,org,camp)
            if row['child_first_name']=='Kind2':
                data['parent_phone']=None  # Actual PostgreSQL NOT NULL violation on INSERT 2.
            return data
        with patch.object(importer,'mapped',side_effect=corrupt_second_row):
            with self.assertRaises(psycopg2.errors.NotNullViolation):
                importer.run(self.file(self.rows[:2]),self.slug,URL,True)
        self.assertEqual(self.counts(),{})

    def test_dry_run_connection_is_database_readonly(self):
        original=importer.psycopg2.connect
        observed=[]
        def connection(**config):
            conn=original(**config)
            observed.append(conn)
            return conn
        with patch.object(importer.psycopg2,'connect',side_effect=connection):
            self.assertEqual(importer.run(self.file(self.rows[:1]),self.slug,URL)['valid'],1)
        self.assertTrue(observed[0].readonly)

    def test_negative_cli_exit_and_no_personal_output(self):
        for field,value in (('birth_date','broken'),('email',''),('parent_first_name',''),
                            ('terms_accepted','false'),('notes','sensitive-note'),
                            ('parent_last_name','Wrong'),('consent_privacy','false'),
                            ('photo_permission','yes'),('registration_token','invalid'),
                            ('id','invalid'),('paid_at','yesterday'),
                            ('phone','null\x00byte'),
                            ('created_at','2026-01-01T00:00:00'),('payment_status','unknown'),
                            ('status','unknown'),('birth_date','20170403')):
            with self.subTest(field=field):
                row = self.rows[0].copy(); row[field]=value
                with patch.dict(os.environ,DATABASE_URL=URL), contextlib.redirect_stdout(io.StringIO()) as out:
                    code=importer.main(['--csv',str(self.file([row])),'--org-slug',self.slug,'--apply'])
                self.assertEqual(code,2)
                self.assertNotIn('Kind1',out.getvalue())
                self.assertNotIn('sensitive-note',out.getvalue())
                self.assertEqual(self.counts(),{})

    def test_exact_confirmation_is_required_but_not_remote_permission(self):
        local = URL.replace('postgres@','prod_synthetic@')
        with self.assertRaises(ValueError): importer.target(local,True)
        with self.assertRaises(ValueError): importer.target(local,True,'127.0.0.1:55443')
        self.assertEqual(importer.target(local,True,'127.0.0.1')['host'],'127.0.0.1')
        for role in ('pr%6fd_synthetic','stg_synthetic','staging_synthetic'):
            marked=URL.replace('postgres@',role+'@')
            with self.subTest(role=role),self.assertRaises(ValueError):
                importer.target(marked,True)

    def test_uuid_driver_adapter_does_not_break_repeat(self):
        # Drivers may return UUID objects after app/test code registers the adapter.
        from psycopg2.extras import register_uuid
        register_uuid()
        path=self.file(self.rows[:1])
        self.assertEqual(importer.run(path,self.slug,URL,True)['written'],1)
        self.assertEqual(importer.run(path,self.slug,URL,True)['existing'],1)

    def test_target_guards_before_any_connection(self):
        for url,confirm in (
            ('postgresql://postgres@prod.example:5432/prod',None),
            ('postgresql://postgres@prod.example:5432/prod','wrong'),
            ('postgresql://postgres@prod.example:5432/prod','prod.example'),
            ('postgresql://postgres@127.0.0.1:55443/dev_l5?hostaddr=10.0.0.1',None),
            ('postgresql://postgres@127.0.0.1:55443/other',None),
            ('postgresql://postgres@wkmckfbzhmihyfwiekct:55443/dev_l5',None)):
            with self.subTest(url=url), patch.object(importer.psycopg2,'connect') as connect:
                with patch.dict(os.environ,DATABASE_URL=url), contextlib.redirect_stdout(io.StringIO()):
                    args=['--csv',str(SAMPLE),'--org-slug',self.slug,'--apply']
                    if confirm: args+=['--target-confirm',confirm]
                    self.assertEqual(importer.main(args),2)
                connect.assert_not_called()


if __name__ == '__main__':
    unittest.main()
