// Local preview only. Temporarily render HEAD for genuine before/after evidence.
// Always restore the worktree, including when a browser check fails.
const { chromium } = require('@playwright/test')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const baseline = process.argv.includes('--baseline')
const files = execFileSync('git', ['diff', '--name-only', '--', 'frontend/app/components/saas'], { cwd: root, encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(file => /\.(tsx|css)$/.test(file) && !file.includes('.test.'))
const originals = new Map(files.map(file => [file, fs.readFileSync(path.join(root, file))]))
const screens = ['camp', 'zahlungen', 'camp-zahlungen', 'warteliste', 'camp-warteliste', 'anmeldungen']
const output = path.join(root, '.qa-cx15', baseline ? 'before' : 'after')
fs.mkdirSync(output, { recursive: true })
fs.mkdirSync(path.join(__dirname, 'cx15-baselines'), { recursive: true })

async function main() {
  let browser
  try {
    if (baseline) {
      for (const [file, content] of originals) {
        const backup = path.join(root, '.qa-cx15', 'current-backup', file)
        fs.mkdirSync(path.dirname(backup), { recursive: true })
        fs.writeFileSync(backup, content)
        fs.writeFileSync(path.join(root, file), execFileSync('git', ['show', `HEAD:${file}`], { cwd: root }))
      }
    }
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ reducedMotion: 'reduce' })
    for (const width of [390, 640, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      for (const screen of screens) {
        await page.goto(`http://localhost:3105/dev/admin-vorschau/${screen}`, { waitUntil: 'networkidle' })
        await page.evaluate(() => document.fonts.ready)
        await page.addStyleTag({ content: 'nextjs-portal, .cp-grain { display: none !important; }' })
        if (width === 390 || width === 1440) {
          await page.screenshot({ path: path.join(output, `${screen}-${width}.png`), fullPage: true, animations: 'disabled' })
        }
        if (width >= 640 && baseline && screen !== 'anmeldungen') {
          const data = await page.evaluate(() => {
            const rect = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n)) }
            return {
              columnHeaders: [...document.querySelectorAll('th, [role="columnheader"]')].map(el => el.textContent?.trim()),
              rows: [...document.querySelectorAll('.cp-list-row')].map(row => ({
                columns: getComputedStyle(row).gridTemplateColumns,
                slots: [...row.children].map(el => ({ slot: el.className, bounds: rect(el), text: getComputedStyle(el).display === 'none' ? '' : el.innerText.trim() })),
                actions: [...row.querySelectorAll('button, a')].filter(el => el.getClientRects().length > 0)
                  .map(el => ({ text: el.innerText.trim(), bounds: rect(el) })).sort((a, b) => a.text.localeCompare(b.text)),
              })),
            }
          })
          if (!data.rows.length) throw new Error(`No rows for ${screen}`)
          fs.writeFileSync(path.join(__dirname, 'cx15-baselines', `${screen}-${width}.json`), JSON.stringify(data, null, 2) + '\n')
        }
        console.log(`${baseline ? 'BEFORE' : 'AFTER'} ${screen} ${width}px`)
      }
    }
  } finally {
    if (baseline) for (const [file, content] of originals) fs.writeFileSync(path.join(root, file), content)
    await browser?.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
