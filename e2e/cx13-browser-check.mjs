// Local, synthetic API only. Run: node e2e/cx13-browser-check.mjs
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'

const require = createRequire(resolve('frontend/package.json'))
const output = resolve('C:/Users/serka/dev/_reports/auftraege/CX13P')
const origin = 'http://localhost:3143'
const org = {
  slug: 'cx13-test', name: 'Testverein', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.test', contact_phone: null,
  logo_url: null, primary_color: '#245734', theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
}
const camp = {
  slug: 'sommer', title: 'Sommercamp 2027', start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 14900, currency: 'EUR', registration_open: true,
  location: 'Sportplatz', care_info: null, meals_info: null, includes: null,
  registered_count: 10, spots_remaining: 10, waitlist_count: 0, is_full: false,
}
const api = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') { res.end(); return }
  if (req.method === 'POST' && req.url.endsWith('/registrations')) {
    req.resume()
    res.end(JSON.stringify({ registration_token: 'synthetic', payment_reference: 'CP-TEST', status: 'registered', payment_status: 'open' }))
  } else if (req.url.endsWith('/camps')) {
    res.end(JSON.stringify([camp, { ...camp, slug: 'herbst', title: 'Herbstcamp 2027', start_date: '2027-10-04', end_date: '2027-10-08' }]))
  } else if (req.url === '/api/v1/organizations/cx13-test') {
    res.end(JSON.stringify(org))
  } else { res.statusCode = 404; res.end('{}') }
})
await new Promise(resolve => api.listen(8043, '127.0.0.1', resolve))
await mkdir(output, { recursive: true })
const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '--webpack', '--port', '3143'], {
  cwd: resolve('frontend'), windowsHide: true,
  env: { ...process.env, NEXT_PUBLIC_SAAS_API_URL: 'http://127.0.0.1:8043', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverLog = ''
server.stdout.on('data', data => { serverLog += data })
server.stderr.on('data', data => { serverLog += data })
let browser
const report = []
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog)
    if (serverLog.includes('Ready')) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error(`Frontend nicht bereit: ${serverLog}`)
  browser = await chromium.launch({ headless: true })
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort()
    })
    await page.goto(`${origin}/pilot/cx13-test`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('button.camp')
      return button && Object.keys(button).some(key => key.startsWith('__reactProps$'))
    })
    await page.locator('button.camp').first().click()
    await page.locator('#s-camp').getByRole('button', { name: 'Jetzt anmelden', exact: true }).click()
    await page.screenshot({ path: `${output}/formular-vorher-${width}.png`, fullPage: true })
    for (const [name, value] of Object.entries({
      child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '05.07.2017',
      parent_name: 'Eva Muster', parent_email: 'eva@example.test', parent_phone: '0561 12345',
      emergency_phone: '0561 67890', pickup_authorized: 'Eva Muster, Alex Muster', allergies: 'Synthetische Allergie',
    })) await page.locator(`[name="${name}"]`).fill(value)
    await page.locator('[name="jersey_size"]').selectOption('140')
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await checkbox.check()
    await page.getByRole('button', { name: /Verbindlich anmelden/ }).click()
    await expect(page.getByRole('button', { name: 'Weiteres Kind anmelden' })).toBeVisible()
    await page.screenshot({ path: `${output}/erfolg-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Weiteres Kind anmelden' }).click()
    await expect(page.locator('[name="parent_name"]')).toHaveValue('Eva Muster')
    await expect(page.locator('[name="parent_email"]')).toHaveValue('eva@example.test')
    await expect(page.locator('[name="parent_phone"]')).toHaveValue('0561 12345')
    await expect(page.locator('[name="emergency_phone"]')).toHaveValue('0561 67890')
    await expect(page.locator('[name="pickup_authorized"]')).toHaveValue('Eva Muster, Alex Muster')
    for (const name of ['child_first_name', 'child_last_name', 'child_birth_date', 'jersey_size', 'allergies']) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('')
    }
    for (const checkbox of await page.locator('input[type="checkbox"]').all()) await expect(checkbox).not.toBeChecked()
    await expect(page.locator('[name="sibling_camp"]')).toHaveValue('sommer')
    await page.screenshot({ path: `${output}/geschwister-${width}.png`, fullPage: true })
    const state = await page.evaluate(() => {
      const note = [...document.querySelectorAll('p')].find(p => p.textContent.includes('Ihre Angaben aus der letzten Anmeldung'))
      const style = getComputedStyle(note)
      let parent = note
      let background
      while (parent) {
        background = getComputedStyle(parent).backgroundColor
        if (background !== 'rgba(0, 0, 0, 0)') break
        parent = parent.parentElement
      }
      return { session: sessionStorage.length, local: localStorage.length, url: location.href,
        overflow: document.documentElement.scrollWidth > innerWidth, noteColor: style.color, noteBackground: background }
    })
    expect(state.session).toBe(0)
    expect(state.local).toBe(0)
    expect(state.url).toBe(`${origin}/pilot/cx13-test`)
    expect(state.overflow).toBe(false)
    expect(errors).toEqual([])
    report.push({ width, ...state, pageErrors: errors })
    await page.locator('[name="sibling_camp"]').selectOption('herbst')
    await expect(page.locator('h1')).toHaveText('Anmeldung: Herbstcamp 2027')
    await context.close()
    console.log(`Browser ${width}px: Ablauf, Datenschutz, Campwechsel, Überlauf und pageerrors geprüft.`)
  }
  await writeFile(`${output}/browser-result.json`, JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  server.kill()
  api.close()
  await writeFile(`${output}/preview-server.log`, serverLog)
}
