/**
 * CF1 screenshot fixtures — uses page.setContent() with embedded CSS so that
 * no dev server is needed. The HTML matches what CampFilter + CampRow render.
 */
import { test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'fs'
import { resolve } from 'path'

const OUT = 'C:/Users/serka/dev/_reports/jan-shots/CF1'
mkdirSync(OUT, { recursive: true })

const CSS_PATH = resolve(__dirname, '../app/pilot/[org]/publicTheme.css')
const CSS = readFileSync(CSS_PATH, 'utf8')

const LOCS = ['Baunatal', 'Fulda', 'Gießen', 'Hanau', 'Kassel', 'Marburg', 'Wetzlar', 'Wiesbaden']
const DATES = [
  { start: '7', month: 'Jul.', wdays: 'Di–Sa' },
  { start: '14', month: 'Jul.', wdays: 'Di–Sa' },
  { start: '4', month: 'Aug.', wdays: 'Di–Sa' },
]

function campCard(i: number): string {
  const loc = LOCS[i % 8]
  const d = DATES[Math.floor(i / 8)]
  return `<button type="button" class="camp" tabindex="0">
    <span class="c-date">
      <b class="num">${d.start}</b>
      <span>${d.month}</span>
      <em>${d.wdays}</em>
    </span>
    <span class="c-body">
      <span style="display:flex;flex-direction:column;gap:4px;">
        <span class="c-name">Fußballcamp ${i + 1}</span>
        <span>${d.start}. – ${parseInt(d.start, 10) + 4}. ${d.month === 'Jul.' ? 'Juli' : 'August'} 2027</span>
      </span>
      <span class="tags">
        <span class="tag">8–14 Jahre</span>
        <span class="tag">${loc}</span>
      </span>
      <span class="cap">
        <span class="bar"><i style="width:25%"></i></span>
        <span class="t num">15 von 20 Plätzen frei</span>
      </span>
      <span class="c-foot">
        <span class="c-price num">199,00 €</span>
        <span class="c-go">Platz sichern</span>
      </span>
    </span>
  </button>`
}

function filterBar(filtered: boolean): string {
  const count = filtered ? 3 : 24
  const activeChip = (label: string, active: boolean) =>
    `<button type="button" class="campfilter-chip${active ? ' active' : ''}" aria-pressed="${active}">
      ${label}<span class="campfilter-chip-n">&thinsp;${active ? count : 24}</span>
    </button>`

  return `<div class="campfilter" role="search" aria-label="Camps filtern">
    <div class="campfilter-bar">
      <div class="campfilter-ort">
        <label class="sr" for="cf-ort">Ort</label>
        <select id="cf-ort" class="campfilter-select">
          <option value=""${!filtered ? ' selected' : ''}>Alle Orte</option>
          <option value="Baunatal">Baunatal (3)</option>
          <option value="Fulda">Fulda (3)</option>
          <option value="Gießen">Gießen (3)</option>
          <option value="Hanau">Hanau (3)</option>
          <option value="Kassel"${filtered ? ' selected' : ''}>Kassel (3)</option>
          <option value="Marburg">Marburg (3)</option>
          <option value="Wetzlar">Wetzlar (3)</option>
          <option value="Wiesbaden">Wiesbaden (3)</option>
        </select>
      </div>
      <div class="campfilter-periods" role="group" aria-label="Zeitraum">
        ${activeChip('Sommer', false)}
      </div>
      <div class="campfilter-foot">
        <span class="campfilter-count num" aria-live="polite" aria-atomic="true">
          ${count} Camps
        </span>
        ${filtered ? '<button type="button" class="campfilter-reset">Filter zurücksetzen</button>' : ''}
      </div>
    </div>
  </div>`
}

function campList(filtered: boolean): string {
  const all = Array.from({ length: 24 }, (_, i) => campCard(i))
  // When filtered by Kassel: indices 4, 12, 20
  const visible = filtered ? [all[4], all[12], all[20]] : all
  return `<div class="camps">${visible.join('')}</div>`
}

function buildPage(theme: 'tradition' | 'akademie', filtered: boolean): string {
  const isDark = theme === 'akademie'
  const brandStyles = [
    '--brand: #cc0000',
    '--brand-strong: #990000',
    '--brand-on: #ffffff',
    '--on-primary: #ffffff',
  ].join('; ')

  const campSection = `
    <div class="pad sec" id="s-camps">
      <div class="sec-head">
        <div>
          <span class="sec-label">24 Termine</span>
          <h2 class="d2">Camps 2027</h2>
        </div>
      </div>
      ${filterBar(filtered)}
      ${campList(filtered)}
    </div>`

  const body = `<body style="background:var(--paper);min-height:100vh;">
    <div class="cp-public" data-theme="${theme}" style="${brandStyles}">
      <div class="app">${campSection}</div>
    </div>
  </body>`

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CF1 Vorschau — ${theme}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: ${isDark ? '#0e1211' : '#f4f3ef'}; }
    ${CSS}
  </style>
</head>
${body}
</html>`
}

const THEMES = ['tradition', 'akademie'] as const
const WIDTHS = [{ name: 'desktop', px: 1440 }, { name: 'mobile', px: 390 }] as const
const STATES = [
  { name: 'unfiltered', filtered: false },
  { name: 'filtered', filtered: true },
] as const

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    for (const state of STATES) {
      test(`${theme}-${width.name}-${state.name}`, async ({ page }) => {
        await page.setViewportSize({ width: width.px, height: 900 })
        const html = buildPage(theme, state.filtered)
        await page.setContent(html, { waitUntil: 'networkidle' })
        const file = resolve(OUT, `${theme}-${width.name}-${state.name}.png`)
        await page.screenshot({ path: file, fullPage: true })
      })
    }
  }
}
