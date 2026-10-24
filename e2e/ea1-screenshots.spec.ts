import { test } from '@playwright/test'

const OUT = 'C:/Users/serka/dev/_reports/jan-shots/EA1'

const screens: [string, string][] = [
  ['01-einrichtung-1',         '/dev/admin-vorschau/einrichtung-1'],
  ['02-einrichtung-1-leer',    '/dev/admin-vorschau/einrichtung-1?leer=1'],
  ['03-einrichtung-2',         '/dev/admin-vorschau/einrichtung-2'],
  ['04-einrichtung-2-leer',    '/dev/admin-vorschau/einrichtung-2?leer=1'],
  ['05-einrichtung-3',         '/dev/admin-vorschau/einrichtung-3'],
  ['06-einrichtung-3-leer',    '/dev/admin-vorschau/einrichtung-3?leer=1'],
  ['07-einrichtung-4',         '/dev/admin-vorschau/einrichtung-4'],
  ['08-einrichtung-4-voll',    '/dev/admin-vorschau/einrichtung-4?voll=1'],
  ['09-dashboard-schritt2',    '/dev/admin-vorschau/dashboard?schritt=2'],
  ['10-dashboard-schritt3',    '/dev/admin-vorschau/dashboard?schritt=3'],
]

test.describe.serial('EA1 Einrichtungsassistent', () => {
  for (const [name, path] of screens) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(600)
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    })
  }
})
