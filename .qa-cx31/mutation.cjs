const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const path = require('node:path');

const source = 'frontend/app/(marketing)/campspilot/page.tsx';
const original = fs.readFileSync(source, 'utf8');
const line = '          <p className="price-tax">{preise.steuerhinweis}</p>';
if (!original.includes(line)) throw new Error('Expected VAT line not found; no mutation applied.');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const hash = text => createHash('sha256').update(text).digest('hex');
const args = [npmCli, 'run', 'test', '--prefix', 'frontend', '--', 'app/(marketing)/campspilot/marketing.test.tsx', '-t', 'vollständigen MwSt'];
let red;
try {
  fs.writeFileSync(source, original.replace(line, ''));
  red = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  fs.writeFileSync('.qa-cx31/mutation-red.log', `${red.stdout || ''}${red.stderr || ''}\nExit code: ${red.status}\n`);
} finally {
  fs.writeFileSync(source, original);
  fs.writeFileSync('.qa-cx31/mutation-restore.json', JSON.stringify({ before: hash(original), after: hash(fs.readFileSync(source, 'utf8')), removed: line.trim() }, null, 2));
}
if (red.error || red.status !== 1 || !/1 failed/.test(`${red.stdout}${red.stderr}`)) {
  throw new Error('Mutation did not produce the expected failing test. Inspect mutation-red.log.');
}
const green = spawnSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
fs.writeFileSync('.qa-cx31/mutation-green.log', `${green.stdout || ''}${green.stderr || ''}\nExit code: ${green.status}\n`);
console.log(fs.readFileSync('.qa-cx31/mutation-red.log', 'utf8'));
console.log(fs.readFileSync('.qa-cx31/mutation-green.log', 'utf8'));
if (green.error || green.status !== 0) process.exitCode = 1;
