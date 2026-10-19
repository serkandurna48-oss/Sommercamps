"""Verify inherited synthetic secrets and dotenv cannot influence local launchers."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import local


class IsolationTests(unittest.TestCase):
    def test_initializer_clears_libpq_redirects_before_connecting(self):
        import psycopg2
        class ConnectionIntercepted(Exception):
            pass

        def intercept(*args, **kwargs):
            self.assertNotIn('PGHOSTADDR', os.environ)
            self.assertNotIn('PGSERVICE', os.environ)
            self.assertNotIn('PGOPTIONS', os.environ)
            self.assertEqual('postgresql://postgres@127.0.0.1:55443/postgres', args[0])
            raise ConnectionIntercepted

        with patch.dict(os.environ, PGHOSTADDR='192.0.2.1', PGSERVICE='synthetic', PGOPTIONS='synthetic'):
            with patch.object(psycopg2, 'connect', intercept), self.assertRaises(ConnectionIntercepted):
                local.initialize()

    def test_backend_ignores_inherited_targets_and_dotenv(self):
        environment = {key: os.environ[key] for key in ('SystemRoot', 'WINDIR', 'TEMP', 'TMP') if key in os.environ}
        environment.update(DATABASE_URL='postgresql://synthetic@unknown.example/prod',
                           SUPABASE_URL='https://unknown.example',
                           SUPABASE_SERVICE_ROLE_KEY='synthetic-private', BREVO_API_KEY='synthetic-private',
                           NOTIFICATION_PROVIDER='brevo')
        original_read = Path.read_text

        def no_dotenv(path, *args, **kwargs):
            if path.name == '.env':
                self.fail('Backend attempted to read dotenv')
            return original_read(path, *args, **kwargs)

        calls = []
        fake_uvicorn = types.SimpleNamespace(run=lambda *args, **kwargs: calls.append((args, kwargs)))
        with patch.dict(os.environ, environment, clear=True), patch.object(Path, 'read_text', no_dotenv), patch.dict(sys.modules, uvicorn=fake_uvicorn):
            local.backend()
            from app.config import get_settings
            settings = get_settings()
            self.assertEqual(local.DSN, settings.database_url)
            self.assertEqual('http://127.0.0.1:55444', settings.supabase_url)
            self.assertIsNone(settings.supabase_service_role_key)
            self.assertNotIn('BREVO_API_KEY', os.environ)
            self.assertNotIn('NOTIFICATION_PROVIDER', os.environ)
            self.assertEqual(8112, calls[0][1]['port'])

    def test_frontend_ignores_inherited_targets_and_secrets(self):
        launcher = str(Path(__file__).with_name('frontend.cjs'))
        code = r"""
const Module = require('node:module');
const assert = require('node:assert/strict');
const original = Module._load;
Module._load = function(name, ...rest) {
  if (name.replaceAll('\\', '/').endsWith('next/dist/cli/next-dev')) return { nextDev: async (options) => {
    assert.equal(process.env.NEXT_PUBLIC_SAAS_API_URL, 'http://127.0.0.1:8112');
    assert.equal(process.env.NEXT_PUBLIC_API_URL, 'http://127.0.0.1:8112');
    assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:55444');
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(process.env.BREVO_API_KEY, undefined);
    assert.equal(options.port, 3112);
    console.log('PASS frontend isolation');
  }};
  return original.call(this, name, ...rest);
};
require(process.argv[2]);
"""
        environment = {key: os.environ[key] for key in ('SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP') if key in os.environ}
        environment.update(NEXT_PUBLIC_SAAS_API_URL='https://unknown.example',
                           NEXT_PUBLIC_API_URL='https://unknown.example',
                           NEXT_PUBLIC_SUPABASE_URL='https://unknown.example',
                           DATABASE_URL='synthetic-private', SUPABASE_SERVICE_ROLE_KEY='synthetic-private',
                           BREVO_API_KEY='synthetic-private')
        # A file entry point also behaves like the real launcher on Windows.
        with tempfile.TemporaryDirectory(prefix='l2-node-isolation-') as temp:
            script = Path(temp) / 'test.cjs'
            script.write_text(code, encoding='utf-8')
            result = subprocess.run(['node.exe', str(script), launcher], env=environment,
                                    capture_output=True, text=True, timeout=15)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertIn('PASS frontend isolation', result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
