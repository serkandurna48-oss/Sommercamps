// Local, synthetic SSR fixtures only. No API, customer data or external requests.
// Run from the worktree root: node e2e/cx8-visual.cjs
// Screenshots use system fallback fonts; interactive behavior is covered by Vitest.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const output = path.resolve(process.env.CX8_VISUAL_DIR || 'C:/Users/serka/dev/_reports/cx8-fehlerseiten')
const repo = path.resolve(__dirname, '..')
const phase = process.argv[3]

if (process.argv[2] === '--render') {
  const ts = require('typescript')
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const Module = require('node:module')
  let scenario = ''
  let error = ''
  let errorStatus = 0
  const form = {
    childFirstName: 'Mia', childLastName: 'Muster', childBirthDate: '01.01.2018',
    jerseySize: '140', parentName: 'Eva Muster', parentEmail: 'eva@example.org',
    parentPhone: '0123456', emergencyPhone: '0654321', allergies: 'Testangabe',
    pickupAuthorized: 'Eva Muster', termsAccepted: true, privacyAccepted: true,
    photoPermission: true, extraAnswers: {},
  }
  const source = filename => {
    if (phase === 'before') {
      try { return execFileSync('git', ['show', `HEAD:${path.relative(repo, filename).split(path.sep).join('/')}`], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) } catch {}
    }
    return fs.readFileSync(filename, 'utf8')
  }
  require.extensions['.css'] = () => {}
  const compile = (mod, filename) => {
    let text = source(filename)
    if (filename.endsWith('ParentFlow.tsx')) {
      text += '\nexport { WaitScreen }\n'
      if (scenario === 'camp-missing') text = text.replace("useState<ScreenName>('org')", "useState<ScreenName>('camp')").replace('useState<string | null>(null)', "useState<string | null>('removed')")
    }
    if (filename.endsWith('RegistrationFormScreen.tsx')) {
      text = text.replace('useState<FormState>(EMPTY)', `useState<FormState>(${JSON.stringify(form)})`)
        .replace('useState<string | null>(null)', `useState<string | null>(${JSON.stringify(error)})`)
        .replace('useState<number | null>(null)', `useState<number | null>(${errorStatus})`)
    }
    const original = Module.createRequire(filename)
    mod.require = name => {
      if (name === 'next/image') return { __esModule: true, default: ({ unoptimized, fill, priority, ...props }) => React.createElement('img', props) }
      if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) }
      if (name === './motion') return { useParentFlowMotion() {} }
      if (name === './publicFonts') return { publicFontClassName: () => '' }
      return original(name)
    }
    mod._compile(ts.transpileModule(text, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  }
  require.extensions['.tsx'] = compile
  require.extensions['.ts'] = compile
  const base = path.join(repo, 'frontend/app/pilot/[org]')
  const brandPipeline = require(path.join(repo, 'frontend/app/lib/brandPipeline.ts'))
  const { readableTextOn } = require(path.join(repo, 'frontend/app/lib/readableTextOn.ts'))
  const org = {
    slug: 'testverein', name: 'Testverein', theme: 'akademie', primary_color: '#e1b650',
    logo_url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#e1b650"/><text x="24" y="32" text-anchor="middle" font-size="26" font-family="Arial" fill="#161c1a">T</text></svg>'),
    contact_email: 'camps@example.org', contact_phone: null, legal_name: null, legal_address: null,
    contact_person_name: null, intro_heading: null, intro_text: null, hero_image_url: null,
    trainer_image_url: null, trainer_text: null, terms_text: null, iban: null,
  }
  const camp = {
    slug: 'sommer', title: 'Sommercamp', start_date: '2099-07-05', end_date: '2099-07-09',
    registration_start: null, registration_end: null, registration_open: true, age_min: 6,
    age_max: 12, capacity: 20, price_cents: 12000, currency: 'EUR', location: null,
    care_info: null, meals_info: null, includes: null, registered_count: 10,
    spots_remaining: 10, waitlist_count: 0, is_full: false,
  }
  const states = ['club-missing', 'club-unpublished', 'camp-missing', 'full', 'closed', 'not-open', 'empty', 'network', '409', '422', '429', '500']
  const css = source(path.join(base, 'publicTheme.css'))
  for (const theme of ['akademie', 'tradition', 'kompakt']) {
    for (const state of states) {
      scenario = state
      for (const key of Object.keys(require.cache)) if (key.startsWith(base)) delete require.cache[key]
      const club = { ...org, theme, primary_color: theme === 'tradition' ? '#cc0000' : org.primary_color }
      const h = React.createElement
      let view
      if (state.startsWith('club-')) view = h(require(path.join(base, 'not-found.tsx')).default)
      else if (['network', '409', '422', '429', '500'].includes(state)) {
        errorStatus = state === 'network' ? 0 : Number(state)
        error = phase === 'after' ? require(path.join(base, 'submitError.ts')).submitErrorMessage(errorStatus)
          : errorStatus === 0 ? 'Die Anmeldung konnte nicht gespeichert werden — Verbindung zum Server fehlgeschlagen. Versuchen Sie es gleich noch mal.'
          : errorStatus === 409 ? 'Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor.'
          : errorStatus === 422 ? 'Die Anmeldung für dieses Camp ist derzeit nicht möglich. Bitte wenden Sie sich an den Verein.'
          : 'Die Anmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.'
        view = h(require(path.join(base, 'RegistrationFormScreen.tsx')).default, { orgSlug: club.slug, orgName: club.name, orgLogoUrl: club.logo_url, contactEmail: club.contact_email, hasBankDetails: false, camp, onBack() {}, onSubmitted() {} })
      } else {
        const flow = require(path.join(base, 'ParentFlow.tsx'))
        if (state === 'full') view = h(flow.WaitScreen, { org: club, camp: { ...camp, is_full: true, spots_remaining: 0 }, alternatives: [], onBack() {}, onJoinWaitlist() {}, onSelectAlternative() {} })
        else if (state === 'closed' || state === 'not-open') view = h(flow.CampScreen, { org: club, camp: { ...camp, registration_open: false, registration_start: state === 'not-open' ? '2099-01-01T00:00:00Z' : null }, onBack() {}, onRegister() {} })
        else view = h(flow.default, { org: club, camps: [] })
      }
      const brand = brandPipeline.computeBrandSafe(club.primary_color, theme === 'akademie' ? '#161c1a' : '#ffffff')
      const style = { '--brand': brand.brand, '--brand-strong': brand.strong, '--brand-on': brand.on, '--on-primary': readableTextOn(brand.brand) }
      const wrapped = state.startsWith('club-') ? view : h('div', { className: 'cp-public', 'data-theme': theme, style }, h('div', { className: 'app' }, view))
      const html = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CX8 ${phase} ${state}</title><style>:root{--font-cp-public-ui:Arial;--font-cp-public-akademie:Arial;--font-cp-public-kompakt:Arial;--font-cp-public-display:Georgia}body{margin:0}${css}</style><body>${renderToStaticMarkup(wrapped)}</body></html>`
      fs.mkdirSync(path.join(output, phase), { recursive: true })
      fs.writeFileSync(path.join(output, phase, `${theme}-${state}.html`), html)
    }
  }
} else {
  for (const step of ['before', 'after']) execFileSync(process.execPath, [__filename, '--render', step], { cwd: repo, stdio: 'inherit' })
  ;(async () => {
    const { chromium } = require('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    const findings = []
    await page.route('http://**', route => route.abort())
    await page.route('https://**', route => route.abort())
    for (const step of ['before', 'after']) {
      for (const filename of fs.readdirSync(path.join(output, step)).filter(name => name.endsWith('.html'))) {
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
          await page.goto(require('node:url').pathToFileURL(path.join(output, step, filename)).href)
          await page.screenshot({ path: path.join(output, step, `${filename.slice(0, -5)}-${width}.png`), fullPage: true })
          if (step === 'after') {
            const result = await page.evaluate(() => {
              const rgb = c => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
              const lum = c => rgb(c).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0)
              const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05)
              const measurements = [...document.querySelectorAll('.public-state p, .public-state .d2, .public-state-brand, .public-state .btn, .public-submit-error, #s-wait h1, #s-wait p, #s-wait .btn, #s-wait .chip, #s-form .dock .btn')].map(el => {
                const css = getComputedStyle(el)
                let bg = css.backgroundColor, parent = el.parentElement
                while (bg === 'rgba(0, 0, 0, 0)' && parent) { bg = getComputedStyle(parent).backgroundColor; parent = parent.parentElement }
                return { text: el.textContent.trim(), foreground: css.color, background: bg, contrast: ratio(css.color, bg) }
              })
              return { overflow: document.documentElement.scrollWidth > innerWidth, measurements }
            })
            findings.push({ filename, width, ...result })
          }
        }
      }
    }
    fs.writeFileSync(path.join(output, 'visual-results.json'), JSON.stringify(findings, null, 2))
    await browser.close()
    const bad = findings.filter(x => x.overflow || x.measurements.some(m => m.contrast < 4.5))
    console.log(`Screenshots: 144 (vorher/nachher, 3 Themes, 12 Zustände, 1440/390). Befunde: ${bad.length}.`)
    if (bad.length) { console.log(JSON.stringify(bad, null, 2)); process.exitCode = 1 }
  })().catch(error => { console.error(error); process.exitCode = 1 })
}
