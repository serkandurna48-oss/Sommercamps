const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const base = 'http://localhost:3107'
const frontend = path.resolve(__dirname, '../frontend')
const out = __dirname
const next = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', '3107'], {
  cwd: frontend, stdio: ['ignore', fs.openSync(path.join(out, 'dev-server.log'), 'w'), 'pipe'],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
})
next.stderr.on('data', chunk => fs.appendFileSync(path.join(out, 'dev-server.log'), chunk))

async function ready() {
  for (let i = 0; i < 90; i++) {
    if (next.exitCode !== null) throw new Error(`next dev exited ${next.exitCode}`)
    try { if ((await fetch(`${base}/dev/admin-vorschau`)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error('next dev did not become ready')
}

async function run() {
  await ready()
  const browser = await chromium.launch({ headless: true })
  const results = {}
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
      await page.goto(`${base}/dev/admin-vorschau/konfiguration`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Feld hinzufügen' }).click()
      if (!await page.locator('input[id$="-label"]').count()) {
        await page.screenshot({ path: path.join(out, `builder-error-${width}.png`), fullPage: true })
        throw new Error(`Builder input missing: ${await page.locator('main').innerText()}`)
      }
      await page.locator('input[id$="-label"]').fill('Position')
      await page.locator('select[id$="-type"]').selectOption('choice')
      await page.locator('textarea[id$="-options"]').fill('Feldspieler\nTorwart')
      await page.screenshot({ path: path.join(out, `builder-${width}.png`), fullPage: true })
      await page.locator('fieldset').filter({ has: page.getByRole('heading', { name: 'Zusatzfelder bei der Anmeldung' }) }).first().screenshot({ path: path.join(out, `builder-panel-${width}.png`) })
      results[`builder-${width}`] = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        controlWidth: document.querySelector('input[name="name"]')?.getBoundingClientRect().width,
        logoWidth: document.querySelector('input[name="logo_url"]')?.getBoundingClientRect().width,
      }))
      await page.goto(`${base}/dev/admin-vorschau/camp-neu`, { waitUntil: 'networkidle' })
      results[`camp-neu-${width}`] = await page.evaluate(() => Object.fromEntries(['start_date', 'end_date', 'age_min', 'age_max'].map(id => [id, document.getElementById(id)?.getBoundingClientRect().width])))
      await page.goto(`${base}/dev/admin-vorschau/camp-konfiguration`, { waitUntil: 'networkidle' })
      results[`camp-konfiguration-${width}`] = await page.evaluate(() => Object.fromEntries(['start_date', 'end_date', 'age_min', 'age_max'].map(id => [id, document.getElementById(id)?.getBoundingClientRect().width])))
      await page.goto(`${base}/dev/admin-vorschau/camp`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Exportieren' }).click()
      await page.getByRole('button', { name: 'Drucken / Als PDF speichern' }).first().click()
      await page.screenshot({ path: path.join(out, `print-${width}.png`), fullPage: true })
      await page.locator('dialog').screenshot({ path: path.join(out, `print-dialog-${width}.png`) })
      if (width === 1440) {
        await page.emulateMedia({ media: 'print' })
        await page.pdf({ path: path.join(out, 'participants-a4.pdf'), format: 'A4', printBackground: true })
        await page.emulateMedia({ media: 'screen' })
        const boxes = page.locator('dialog .cp-print-choice input[type="checkbox"]')
        for (let index = 0; index < await boxes.count(); index++) await boxes.nth(index).check()
        results.stressSections = await page.locator('dialog .cp-print-sheet').count()
        await page.emulateMedia({ media: 'print' })
        await page.pdf({ path: path.join(out, 'stress-a4.pdf'), format: 'A4', printBackground: true })
      }
      await page.close()
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(out, 'browser-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}

run().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => next.kill())
