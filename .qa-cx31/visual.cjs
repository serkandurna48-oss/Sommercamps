const { chromium } = require('../frontend/node_modules/playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 60000 });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      await page.goto('http://127.0.0.1:3131/campspilot?paket=Start#preis', { waitUntil: 'domcontentloaded', timeout: 180000 });
      await page.waitForFunction(() => document.querySelector('#prf-nachricht')?.value.includes('„Start“'));
      await page.locator('#preis article').last().waitFor({ state: 'visible' });
      await page.locator('#preis').screenshot({ path: `.qa-cx31/preise-${width}.png`, caret: 'initial' });
      await page.screenshot({ path: `.qa-cx31/after-${width}.png`, fullPage: true, caret: 'initial' });
      results.push(await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#preis article')];
        return { width: innerWidth, documentWidth: document.documentElement.scrollWidth, cards: cards.map(el => ({ name: el.querySelector('h3').textContent, width: el.getBoundingClientRect().width, top: el.getBoundingClientRect().top })) };
      }));
      await page.locator('#preis a.btn').last().click();
      await page.waitForURL(/paket=/);
      await page.waitForFunction(() => document.querySelector('#prf-nachricht')?.value.includes('Fußballschule'));
      results.push({ width, prefill: await page.locator('#prf-nachricht').inputValue() });
      await page.locator('#fragen summary').first().click();
      results.push({ width, faqOpen: await page.locator('#fragen details').first().getAttribute('open') !== null });
      await page.close();
    }
    fs.writeFileSync('.qa-cx31/visual.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
