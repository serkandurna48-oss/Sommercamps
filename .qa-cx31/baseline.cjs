const { chromium } = require('../frontend/node_modules/playwright');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

(async () => {
  const files = ['page.tsx', 'marketing.css', 'PilotRequestForm.tsx'].map(name => `frontend/app/(marketing)/campspilot/${name}`);
  const current = new Map(files.map(file => [file, fs.readFileSync(file)]));
  const before = new Map(files.map(file => [file, execFileSync('git', ['show', `HEAD:${file}`])]));
  const hash = content => createHash('sha256').update(content).digest('hex');
  let browser;
  try {
    for (const [file, contents] of before) fs.writeFileSync(file, contents);
    browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 60000 });
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.goto('http://127.0.0.1:3131/campspilot#preis', { waitUntil: 'networkidle', timeout: 180000 });
      await page.waitForFunction(() => document.querySelector('#preis h2')?.textContent === 'Preis');
      await page.screenshot({ path: `.qa-cx31/before-${width}.png`, fullPage: true, caret: 'initial' });
      await page.close();
    }
    console.log('Baseline screenshots: 1440 and 390 px, original HEAD sources.');
  } finally {
    for (const [file, contents] of current) fs.writeFileSync(file, contents);
    fs.writeFileSync('.qa-cx31/baseline-restore.json', JSON.stringify(files.map(file => ({ file, before: hash(current.get(file)), after: hash(fs.readFileSync(file)) })), null, 2));
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
