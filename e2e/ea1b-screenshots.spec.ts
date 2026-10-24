import { test } from '@playwright/test'

const OUT = 'C:/Users/serka/dev/_reports/jan-shots/EA1b'

const screens: [string, string][] = [
  ['schritt-1', '/dev/admin-vorschau/einrichtung-1'],
  ['schritt-2', '/dev/admin-vorschau/einrichtung-2'],
  ['schritt-3', '/dev/admin-vorschau/einrichtung-3'],
  ['schritt-4', '/dev/admin-vorschau/einrichtung-4'],
  ['schritt-4-voll', '/dev/admin-vorschau/einrichtung-4?voll=1'],
]

const widths = [1440, 390]

test.describe.serial('EA1b Einrichtungsassistent', () => {
  for (const w of widths) {
    for (const [name, path] of screens) {
      test(`${name}-${w}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 })
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(600)
        await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: true })
      })
    }
  }
})
