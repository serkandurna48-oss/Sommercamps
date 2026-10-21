// Isolated browser check: actual parent components, synthetic data, no backend writes.
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { createServer } = require('node:http')
const assert = require('node:assert/strict')
const frontendRequire = createRequire(resolve('frontend/package.json'))

async function main() {
  const { build } = await import(pathToFileURL(frontendRequire.resolve('vite')).href)
  const { chromium } = frontendRequire('playwright')
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import ParentFlow from ${JSON.stringify(resolve('frontend/app/pilot/[org]/ParentFlow.tsx').replaceAll('\\', '/'))};
    import PrivacyPage from ${JSON.stringify(resolve('frontend/app/pilot/[org]/datenschutz/page.tsx').replaceAll('\\', '/'))};
    import TermsPage from ${JSON.stringify(resolve('frontend/app/pilot/[org]/teilnahmebedingungen/page.tsx').replaceAll('\\', '/'))};
    const params = new URLSearchParams(location.search);
    const full = params.has('full');
    const org = { slug: 'demo', name: 'Testverein Performance Academy', legal_name: 'Testverein e. V.',
      contact_email: 'camp-team@example.com', contact_phone: '0561 1234', theme: params.get('theme'),
      iban: params.has('noiban') ? null : 'DE89370400440532013000', logo_url: null };
    const camp = { slug: 'herbst', title: 'Herbstcamp für Fußballbegeisterte', start_date: '2027-10-25', end_date: '2027-10-29',
      age_min: 6, age_max: 12, capacity: 20, registered_count: full ? 20 : 18, spots_remaining: full ? 0 : 2,
      waitlist_count: 1, is_full: full, price_cents: 14900, currency: 'EUR', registration_open: true,
      location: 'Sportplatz Musterstadt', includes: ['Training', 'Mittagessen'] };
    async function renderFixture() {
      let content;
      if (params.has('legal')) {
        globalThis.fetch = async () => new Response(JSON.stringify(org), {status: 200});
        content = await (params.get('legal') === 'privacy' ? PrivacyPage : TermsPage)({params: Promise.resolve({org: 'demo'})});
      } else {
        content = <div className="cp-public" data-theme={org.theme} style={{'--brand-strong':'#295f40','--brand-on':'white'}}>
          <div className="app"><ParentFlow org={org} camps={[camp]} /></div></div>;
      }
      createRoot(document.getElementById('root')).render(content);
    }
    renderFixture();
  `
  const output = await build({
    configFile: false, root: resolve('frontend'), publicDir: false, logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SAAS_API_URL': '"/mock"' },
    plugins: [{ name: 'parent-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:parent-fixture') return '\0parent-fixture.tsx'
        if (['next/navigation', 'next/image', 'next/link', './motion', './publicFonts', './GrainOverlay'].includes(id)) return '\0stub:' + id
        if (id === 'react' || id.startsWith('react/') || id === 'react-dom/client') return frontendRequire.resolve(id)
      },
      load(id) {
        if (id === '\0parent-fixture.tsx') return entry
        if (id === '\0stub:next/navigation') return 'export const useRouter = () => ({ refresh() {} }); export const notFound = () => { throw new Error("not found") };'
        if (id === '\0stub:./motion') return 'export const useParentFlowMotion = () => {};'
        if (id === '\0stub:./publicFonts') return 'export const publicFontClassName = () => "";'
        if (id === '\0stub:./GrainOverlay') return 'export default function GrainOverlay() { return null; }'
        if (id === '\0stub:next/image') return 'import React from "react"; export default function Image({unoptimized,fill,priority,...p}) { return React.createElement("img", p); }'
        if (id === '\0stub:next/link') return 'import React from "react"; export default function Link(p) { return React.createElement("a", p); }'
      },
    }],
    build: { write: false, minify: false, rolldownOptions: { input: 'virtual:parent-fixture', output: { format: 'es' } } },
  })
  const files = new Map(output.output.filter(file => file.type === 'chunk').map(file => ['/' + file.fileName, file.code]))
  const entryFile = output.output.find(file => file.type === 'chunk' && file.isEntry).fileName
  const css = readFileSync(resolve('frontend/app/pilot/[org]/publicTheme.css'), 'utf8')
  const server = createServer((req, res) => {
    const path = req.url.split('?')[0]
    res.setHeader('Content-Type', files.has(path) ? 'text/javascript' : 'text/html; charset=utf-8')
    res.end(files.get(path) || `<!doctype html><html lang="de"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}${css}</style><div id="root"></div><script type="module" src="/${entryFile}"></script></html>`)
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    const pageErrors = []
    page.on('pageerror', error => { pageErrors.push(error.message) })
    let requests = 0
    let full = false
    await page.route('**/mock/api/v1/**', async route => {
      requests++
      await route.fulfill({ json: { registration_token: 'synthetic', status: full ? 'waitlist' : 'registered', payment_status: 'open', payment_reference: 'CP-12345678' } })
    })
    async function check(label) {
      assert.deepEqual(pageErrors, [], 'browser errors')
      const issues = await page.evaluate(() => {
        const problems = []
        if (document.documentElement.scrollWidth > 390) problems.push('horizontal overflow: ' + document.documentElement.scrollWidth)
        for (const element of document.querySelectorAll('button,a,input,select,textarea,summary')) {
          const box = element.getBoundingClientRect()
          if (box.width === 0 || box.height === 0) continue
          if (box.width < 44 || box.height < 44) problems.push(`${element.tagName} ${element.textContent?.slice(0, 50)}: ${box.width}x${box.height}`)
          if (box.right > 391 || box.left < -1) problems.push(`${element.tagName} outside viewport`)
        }
        return problems
      })
      assert.deepEqual(issues, [], label)
    }
    for (const theme of ['tradition', 'akademie', 'kompakt']) {
      for (const mode of ['registered', 'noiban', 'waitlist']) {
        full = mode === 'waitlist'
        await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}${full ? '&full' : ''}${mode === 'noiban' ? '&noiban' : ''}`)
        await page.locator('.camp').waitFor()
        await check(theme + ' overview')
        await page.locator('.camp').click()
        await check(theme + ' details ' + mode)
        await page.locator(full ? '#s-wait .btn.primary' : '#s-camp .btn.primary').click()
        await check(theme + ' form ' + mode)
        await page.locator('button[type=submit]').click()
        assert.equal(await page.locator('input').first().evaluate(element => element === document.activeElement), true)
        await check(theme + ' errors')
        for (const [autocomplete, value] of [
          ['section-child given-name', 'Mia'], ['section-child family-name', 'Muster'], ['section-child bday', '01012018'],
          ['name', 'Eva Muster'], ['email', 'eva@example.com'], ['tel', '0561 1234'], ['section-emergency tel', '0561 5678'],
        ]) await page.locator(`input[autocomplete="${autocomplete}"]`).fill(value)
        await page.locator('input[required][type=checkbox]').nth(0).check()
        await page.locator('input[required][type=checkbox]').nth(1).check()
        await page.setViewportSize({ width: 390, height: 420 })
        await page.locator('input[type=tel]').last().focus()
        await page.locator('button[type=submit]').scrollIntoViewIfNeeded()
        const submitBox = await page.locator('button[type=submit]').boundingBox()
        assert.ok(submitBox.y >= 0 && submitBox.y + submitBox.height <= 420, 'submit reachable with reduced viewport')
        await page.locator('button[type=submit]').click()
        await page.locator('#s-done').waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        await check(theme + ' done ' + mode)
        assert.equal(await page.locator('.done-transfer').count(), mode === 'registered' ? 1 : 0)
        assert.equal(await page.locator('.done-contact a').count(), 2)
        console.log(`PASS 390px ${theme} ${mode}: overview, details, form, errors, reduced viewport, confirmation`)
      }
      for (const legal of ['privacy', 'terms']) {
        await page.goto(`http://127.0.0.1:${server.address().port}/?theme=${theme}&legal=${legal}`)
        await page.locator('.legal-col').waitFor()
        await check(theme + ' ' + legal)
        console.log(`PASS 390px ${theme} ${legal}: legal page, links and touch targets`)
      }
    }
    assert.equal(requests, 9)
    console.log('Mobile browser checks: 9 journeys and 6 legal pages passed; 9 mocked requests; no real API calls.')
  } finally {
    await browser?.close()
    await new Promise(done => server.close(done))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
