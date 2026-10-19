// Start Next with a minimal environment; no inherited credentials or API targets.
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const keep = {};
for (const key of ['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']) {
  if (process.env[key]) keep[key] = process.env[key];
}
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, keep, {
  NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8112',
  NEXT_PUBLIC_SAAS_API_URL: 'http://127.0.0.1:8112',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55444',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-placeholder',
});
process.chdir(path.join(root, 'frontend'));
require(path.join(root, 'frontend/node_modules/next/dist/cli/next-dev')).nextDev(
  { port: 3112, hostname: '127.0.0.1', webpack: true }, undefined, process.cwd()
).catch(() => { console.error('Local frontend failed'); process.exit(1); });
