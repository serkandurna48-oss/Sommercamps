// Local synthetic KSV parent-page fixture. No API, production URL, or env file.
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs')
const { resolve, extname, join } = require('node:path')
const { createServer } = require('node:http')
const assert = require('node:assert/strict')

const root = resolve(__dirname, '..')
const sharedRequire = createRequire(resolve(root, '../package.json'))
const { chromium } = sharedRequire('playwright')
const mode = process.argv[2] || 'before'
const out = resolve(__dirname, mode)
mkdirSync(out, { recursive: true })

async function main() {
  const { build } = await import(pathToFileURL(sharedRequire.resolve('vite')).href)
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import ParentFlow from ${JSON.stringify(resolve(root, 'frontend/app/pilot/[org]/ParentFlow.tsx').replaceAll('\\', '/'))};
    const variant = new URLSearchParams(location.search).get('variant') || 'ksv';
    const org = {
      slug: variant === 'ksv' ? 'ksv-baunatal' : variant === 'jk' ? 'test-akademie' : 'neutral',
      name: variant === 'ksv' ? 'KSV Baunatal' : variant === 'jk' ? 'Test Akademie' : 'Testverein',
      theme: variant === 'ksv' ? 'tradition' : variant === 'jk' ? 'akademie' : 'kompakt',
      legal_name: variant === 'ksv' ? 'KSV Baunatal' : variant === 'jk' ? 'Test Akademie' : 'Testverein',
      contact_email: 'kontakt@example.test', contact_phone: null,
      logo_url: variant === 'ksv' ? '/clubs/ksv/ksv-logo.png' : null,
      primary_color: '#cc0000', iban: null,
      intro_heading: variant === 'ksv' ? 'Fußballschule KSV Baunatal' : null,
      intro_text: variant === 'ksv' ? 'Fußball, Teamgeist und Freude am Spiel. Entdecken Sie die Termine der Fußballschule KSV Baunatal.' : null,
      hero_image_url: null, trainer_image_url: null, trainer_text: null,
    };
    const dates = [
      ['winter', 'Wintercamp', '2027-01-04', '2027-01-07'],
      ['ostern', 'Ostercamp', '2027-03-22', '2027-03-25'],
      ['sommer-1', 'Sommercamp 1', '2027-06-28', '2027-07-01'],
      ['sommer-2', 'Sommercamp 2', '2027-08-02', '2027-08-05'],
      ['herbst', 'Herbstcamp', '2027-10-04', '2027-10-07'],
    ];
    const camps = dates.map(([slug,title,start_date,end_date]) => ({
      slug,title,start_date,end_date,age_min:6,age_max:12,capacity:70,
      registered_count:0,spots_remaining:70,waitlist_count:0,is_full:false,
      price_cents:15000,currency:'EUR',registration_open:true,
      location:variant === 'ksv' ? 'Baunatal' : 'Musterstadt',includes:['Training','Mittagessen'],
    }));
    createRoot(document.getElementById('root')).render(
      <div className="cp-public" data-theme={org.theme} style={{'--brand':'#cc0000','--brand-strong':'#9b0000','--brand-on':'#ffffff','--on-primary':'#ffffff'}}>
        <div className="app"><ParentFlow org={org} camps={camps}/></div>
      </div>
    );
  `
  const built = await build({
    configFile: false, root: resolve(root, 'frontend'), publicDir: false, logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_SAAS_API_URL': '"/mock"' },
    plugins: [{ name: 'ksv-fixture', enforce: 'pre',
      resolveId(id) {
        if (id === 'virtual:ksv-fixture') return '\0ksv-fixture.tsx'
        if (['next/navigation', 'next/image', 'next/link', './motion'].includes(id)) return '\0stub:' + id
        if (id === 'react' || id.startsWith('react/') || id === 'react-dom/client') return sharedRequire.resolve(id)
      },
      load(id) {
        if (id === '\0ksv-fixture.tsx') return entry
        if (id === '\0stub:next/navigation') return 'export const useRouter = () => ({ refresh() {} });'
        if (id === '\0stub:./motion') return 'export const useParentFlowMotion = () => {};'
        if (id === '\0stub:next/image') return 'import React from "react"; export default function Image({unoptimized,fill,priority,...p}) { return React.createElement("img", {...p, style:{...(fill ? {position:"absolute",inset:0,width:"100%",height:"100%"} : {}),...p.style}}); }'
        if (id === '\0stub:next/link') return 'import React from "react"; export default function Link(p) { return React.createElement("a", p); }'
      },
    }],
    build: { write: false, minify: false, rolldownOptions: { input: 'virtual:ksv-fixture', output: { format: 'es' } } },
  })
  const files = new Map(built.output.filter(f => f.type === 'chunk').map(f => ['/' + f.fileName, f.code]))
  const entryFile = built.output.find(f => f.type === 'chunk' && f.isEntry).fileName
  const css = readFileSync(resolve(root, 'frontend/app/pilot/[org]/publicTheme.css'), 'utf8')
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(req.url.split('?')[0])
    if (files.has(pathname)) {
      res.setHeader('Content-Type', 'text/javascript')
      res.end(files.get(pathname))
    } else if (pathname.startsWith('/clubs/ksv/')) {
      const file = resolve(root, 'frontend/public', '.' + pathname)
      if (!file.startsWith(resolve(root, 'frontend/public/clubs/ksv/'))) { res.writeHead(403).end(); return }
      try { res.setHeader('Content-Type', extname(file) === '.png' ? 'image/png' : 'image/jpeg'); res.end(readFileSync(file)) }
      catch { res.writeHead(404).end() }
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}${css}</style><div id="root"></div><script type="module" src="/${entryFile}"></script></html>`)
    }
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const browser = await chromium.launch({ headless: true })
  const results = []
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.route('**/*', route => route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? route.continue() : route.abort())
      await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'networkidle' })
      await page.locator('.hero-image').waitFor()
      await page.screenshot({ path: join(out, `ksv-${width}.png`), fullPage: true })
      const geometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        heroButtons: [...document.querySelectorAll('.h-trad .hero-btns button')].map(el => {
          const r = el.getBoundingClientRect(); return { text: el.textContent, x: r.x, y: r.y, width: r.width, height: r.height }
        }),
        heroImage: getComputedStyle(document.querySelector('.hero-image')).objectPosition,
        heroScale: getComputedStyle(document.querySelector('.hero-image')).scale,
        sponsorCount: document.querySelectorAll('.sponsor-section').length,
      }))
      results.push({ width, errors, geometry })
      assert.equal(errors.length, 0)
      assert.equal(geometry.documentWidth, width)
      assert.ok(geometry.heroButtons.every(b => b.width >= 44 && b.height >= 44 && b.x >= 0 && b.x + b.width <= width))
      assert.equal(geometry.sponsorCount, 1)
      assert.equal(geometry.heroImage, width === 390 ? '50% 15%' : '50% 30%')
      assert.equal(geometry.heroScale, width === 390 ? 'none' : '1.08')
      await page.close()
    }
    if (mode === 'after') {
      for (const variant of ['ksv', 'jk', 'neutral']) {
        for (const width of [390, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
          const errors = []
          page.on('pageerror', e => errors.push(e.message))
          await page.route('**/*', route => route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? route.continue() : route.abort())
          await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}`, { waitUntil: 'networkidle' })
          await page.locator('.camp').first().waitFor()
          await page.screenshot({ path: join(out, `${variant}-regression-${width}.png`), fullPage: true })
          const before = await page.evaluate(() => ({ sponsor: document.querySelectorAll('.sponsor-section').length, ksvCopy: document.body.textContent.includes('Fußballschule KSV Baunatal'), width: document.documentElement.scrollWidth }))
          assert.equal(before.sponsor, variant === 'ksv' ? 1 : 0)
          assert.equal(before.ksvCopy, variant === 'ksv')
          assert.equal(before.width, width)
          if (variant === 'ksv') {
            await page.locator('.h-trad .h-btn-brand').click()
            const campTop = await page.locator('#s-camps').evaluate(el => el.getBoundingClientRect().top)
            assert.ok(campTop >= -1 && campTop < 150, 'hero action reaches camp dates')
          }
          await page.locator('.camp').first().click()
          await page.locator('#s-camp').waitFor()
          await page.locator('#s-camp .btn.primary').first().click()
          await page.locator('#s-form').waitFor()
          assert.deepEqual(errors, [])
          results.push({ variant, width, overview: before, campDetails: true, registrationStart: true, errors })
          await page.close()
        }
      }
    }
  } finally { await browser.close(); await new Promise(done => server.close(done)) }
  writeFileSync(join(out, 'browser-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
