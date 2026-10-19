"""Local-only database bootstrap and isolated backend entry point. Never loads dotenv."""
import hashlib
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DSN = 'postgresql://postgres@127.0.0.1:55443/dev_l2'


def isolate_environment():
    system = {key: os.environ[key] for key in ('SystemRoot', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
    os.environ.clear()
    os.environ.update(system)


def initialize():
    # libpq also accepts PGHOSTADDR/PGSERVICE from the environment. Clear these
    # before importing/connecting, so even a loopback DSN cannot be redirected.
    isolate_environment()
    import psycopg2
    from psycopg2 import sql
    conn = psycopg2.connect('postgresql://postgres@127.0.0.1:55443/postgres', connect_timeout=3)
    try:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = 'dev_l2'")
            if not cur.fetchone():
                cur.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier('dev_l2')))
    finally:
        conn.close()
    with psycopg2.connect(DSN, connect_timeout=3) as conn:
        with conn.cursor() as cur:
            # Minimal Supabase schema compatibility, not an authentication service.
            cur.execute("""
                SELECT pg_advisory_xact_lock(811255443);
                DO $$ BEGIN
                  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
                    CREATE ROLE authenticated NOLOGIN;
                  END IF;
                END $$;
                CREATE SCHEMA IF NOT EXISTS auth;
                CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
                ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
                CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
                AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
                CREATE TABLE IF NOT EXISTS public.dev_migrations
                  (name text PRIMARY KEY, sha256 text NOT NULL);
                ALTER TABLE public.dev_migrations ENABLE ROW LEVEL SECURITY;
            """)
            for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                cur.execute('SELECT sha256 FROM public.dev_migrations WHERE name=%s', (path.name,))
                previous = cur.fetchone()
                if previous:
                    if previous[0] != digest:
                        raise RuntimeError('Previously applied migration changed; use a fresh local database')
                    continue
                cur.execute(path.read_text(encoding='utf-8-sig'))
                cur.execute('INSERT INTO public.dev_migrations VALUES (%s,%s)', (path.name, digest))
                print('Migration:', path.name)
            cur.execute((ROOT / 'scripts/dev/demo.sql').read_text(encoding='utf-8'))
    print('Local dev_l2 ready: all migrations, JK-Demo-Org and synthetic camp.')


def backend():
    # Clear inherited secrets. Settings(_env_file=None) also prevents any .env read.
    isolate_environment()
    os.environ.update(DATABASE_URL=DSN, SUPABASE_URL='http://127.0.0.1:55444',
                      SUPABASE_ANON_KEY='local-placeholder', APP_ENV='development',
                      CORS_ORIGINS_EXTRA='http://127.0.0.1:3112,http://localhost:3112')
    sys.path.insert(0, str(ROOT / 'backend_saas'))
    from app.config import Settings
    import app.config
    local_settings = Settings(_env_file=None)
    app.config.get_settings = lambda: local_settings
    import uvicorn
    uvicorn.run('app.main:app', host='127.0.0.1', port=8112)


if __name__ == '__main__':
    try:
        {'init': initialize, 'backend': backend}[sys.argv[1]]()
    except Exception as exc:
        # Never log DSNs or inherited environment values.
        print('Local operation failed:', type(exc).__name__, file=sys.stderr)
        sys.exit(1)
