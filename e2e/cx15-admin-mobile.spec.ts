import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TodayRegistrations from '../frontend/app/components/saas/data/TodayRegistrations'
import { getPreviewFixtures } from '../frontend/app/dev/admin-vorschau/fixtures'

const screens = ['camp', 'zahlungen', 'camp-zahlungen', 'warteliste', 'camp-warteliste']

for (const width of [390, 639]) {
  for (const screen of screens) {
    test(`${screen}: cards, fields and actions at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`/dev/admin-vorschau/${screen}`)
      const cards = page.locator('.cp-mobile-card')
      await expect(cards.first()).toBeVisible()
      const count = await cards.count()
      for (let index = 0; index < count; index++) {
        const card = cards.nth(index)
        await expect(card.locator('.cp-camp-date')).toBeVisible()
        await expect(card.locator('.cp-camp-date')).toContainText(/Technikcamp Herbst|Wintercamp Ballgefühl/)
        await expect(card.locator('.cp-camp-date')).toContainText(/\b20\d{2}\b/)
        await expect(card.locator('.cp-row-main p.cp-subheading')).toHaveCSS('font-weight', '700')
        const chips = card.locator('.cp-row-status span.cp-chip')
        expect(await chips.count()).toBeGreaterThan(0)
        for (const chip of await chips.all()) {
          await expect(chip).toBeVisible()
          expect((await chip.innerText()).trim()).toMatch(/Angemeldet|Bestätigt|Bezahlt|offen|Storniert|Warteliste|Erlassen|Erstattet|Entfällt/i)
        }
        const primary = screen === 'camp' ? card.locator('.cp-participant-trigger')
          : screen.includes('zahlungen') ? card.getByRole('button', { name: 'Als bezahlt markieren', exact: true })
            : card.getByRole('link', { name: 'Eltern kontaktieren', exact: true })
        await expect(primary).toBeVisible()
        const box = await primary.boundingBox()
        expect(box!.height).toBeGreaterThanOrEqual(44)
        const parent = screen === 'camp' ? card.locator('.cp-participant-card-top') : card.locator('.cp-row-action')
        const available = await parent.evaluate(el => {
          const style = getComputedStyle(el)
          return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        })
        expect(Math.abs(box!.width - available)).toBeLessThanOrEqual(2)
        await expect(card.getByRole('button', { name: /^Weitere Aktionen für/ })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }
}

test('overflow supports Enter, Tab, confirmation, Escape, focus return and outside click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/admin-vorschau/zahlungen')
  const card = page.locator('.cp-mobile-card').first()
  const trigger = card.getByRole('button', { name: /^Weitere Aktionen für/ })
  await expect(card.getByRole('button', { name: 'Erlassen', exact: true })).toBeHidden()
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = card.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Verwendungszweck kopieren' })).toBeFocused()
  await page.keyboard.press('Tab')
  // The preview has no IBAN: the disabled reminder exposes a focusable hint.
  await expect(dialog.getByRole('button', { name: 'Erinnerung kopieren' })).toBeDisabled()
  await expect(dialog.locator('span[tabindex="0"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Erlassen', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toContainText('Wirklich erlassen?')
  await expect(dialog.getByRole('button', { name: 'Erlassen', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Space')
  await expect(dialog).toBeVisible()
  await page.getByRole('searchbox').click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

for (const screen of ['camp', 'zahlungen']) {
  test(`${screen}: mobile search and filters remain sticky and full width`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/dev/admin-vorschau/${screen}`)
    const controls = page.locator('.cp-mobile-filters')
    await expect(controls).toHaveCSS('position', 'sticky')
    await controls.scrollIntoViewIfNeeded()
    const input = controls.getByRole('searchbox')
    const box = await input.boundingBox()
    const controlBox = await controls.boundingBox()
    expect(Math.abs(box!.width - controlBox!.width)).toBeLessThanOrEqual(2)
    await page.evaluate(() => window.scrollBy(0, 250))
    expect((await controls.boundingBox())!.y).toBeGreaterThanOrEqual(0)
    await input.fill(screen === 'camp' ? 'Mila' : 'Nele')
    await expect(page.locator('.cp-mobile-card')).toHaveCount(1)
  })
}

for (const width of [640, 1024, 1440]) {
  for (const screen of screens) {
    test(`${screen}: unchanged desktop columns and geometry at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`/dev/admin-vorschau/${screen}`)
      await expect(page.locator('.cp-list-row').first()).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('[aria-haspopup="dialog"]').first()).toBeHidden()
      const baseline = JSON.parse(readFileSync(`e2e/cx15-baselines/${screen}-${width}.json`, 'utf8'))
      const current = await page.evaluate(() => {
        const rect = (el: Element) => {
          const r = el.getBoundingClientRect()
          return [r.x, r.y, r.width, r.height].map(n => Math.round(n))
        }
        return {
          // These screens use ListRow grids; no table headers existed at HEAD.
          columnHeaders: [...document.querySelectorAll('th, [role="columnheader"]')].map(el => el.textContent?.trim()),
          rows: [...document.querySelectorAll('.cp-list-row')].map(row => ({
            columns: getComputedStyle(row).gridTemplateColumns,
            slots: [...row.children].map(el => ({ slot: el.className, bounds: rect(el), text: getComputedStyle(el).display === 'none' ? '' : (el as HTMLElement).innerText.trim() })),
            actions: [...row.querySelectorAll<HTMLElement>('button, a')].filter(el => el.getClientRects().length > 0)
              .map(el => ({ text: el.innerText.trim(), bounds: rect(el) })).sort((a, b) => a.text.localeCompare(b.text)),
          })),
        }
      })
      // Preview fixtures move with the calendar. Preserve the recorded layout
      // and all static content while ignoring only their generated dates/ages.
      const normalize = (snapshot: typeof current) => ({ ...snapshot, rows: snapshot.rows.map(row => ({ ...row,
        // Responsive grouping changes DOM order; exact visible button positions
        // above still protect the desktop order of reminder, payment and waiver.
        slots: row.slots.map(slot => ({ ...slot, text: (slot.slot.includes('cp-row-action')
          ? slot.text.split('\n').filter(Boolean).sort().join('\n') : slot.text)
          .replace(/\d{2}\.\d{2}\.\d{4}/g, '<Datum>')
          .replace(/\(\d{4}\)/g, '(<Jahrgang>)')
          .replace(/wartet seit \d+ Tagen/g, 'wartet seit <Tagen>'),
        })),
      })) })
      expect(normalize(current)).toEqual(normalize(baseline))
    })
  }
}

test('settled and cancelled payments retain their primary link and applicable secondary actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/admin-vorschau/zahlungen?filter=all')
  await page.getByRole('button', { name: /^Alle \d+$/ }).click()
  for (const status of ['paid', 'waived', 'refunded', 'cancelled']) {
    const row = page.locator(`.cp-ledger-row[data-status="${status}"]`).first()
    await expect(row.getByRole('link', { name: 'Anmeldungen ansehen' })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Als bezahlt markieren', exact: true })).toHaveCount(0)
    const trigger = row.getByRole('button', { name: /^Weitere Aktionen für/ })
    await trigger.click()
    await expect(row.getByRole('dialog').getByRole('button', { name: 'Verwendungszweck kopieren' })).toBeVisible()
    const refund = row.getByRole('dialog').getByRole('button', { name: 'Als erstattet markieren', exact: true })
    if (status === 'paid') await expect(refund).toBeVisible()
    else await expect(refund).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  }
  const waiting = page.locator('.cp-ledger-row').filter({ hasText: 'Warteliste' }).first()
  await expect(waiting.getByRole('link', { name: 'Anmeldungen ansehen' })).toBeVisible()
  await expect(waiting.getByRole('button', { name: 'Als bezahlt markieren', exact: true })).toHaveCount(0)
})

test('org registrations: nonempty cards use the same CSS, dates, status and touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/admin-vorschau/anmeldungen')
  const fixture = getPreviewFixtures(false, new Date('2026-10-24T12:00:00Z'))
  const registration = fixture.registrationsByCamp[0][1]
  // The built-in Today preview is empty. Render this real component with a
  // synthetic nonempty dataset into the already loaded application stylesheet.
  const html = renderToStaticMarkup(createElement(TodayRegistrations, {
    entries: [{ camp: fixture.camps[0], registration }], orgSlug: 'demo', fullList: true,
  }))
  await page.locator('main').evaluate((main, html) => { main.innerHTML = html }, html)
  const card = page.locator('.cp-today-card')
  await expect(card.locator('strong')).toHaveText('Mila Sonnenbach')
  await expect(card.locator('.cp-camp-date')).toHaveText('Technikcamp Herbst · 7.–11. Jan. 2027')
  await expect(card.locator('span.cp-chip')).toHaveText('Bezahlt')
  const primary = card.getByRole('link', { name: 'Anmeldungen ansehen' })
  const box = await primary.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
  expect(Math.abs(box!.width - (await card.locator('.cp-mobile-actions').boundingBox())!.width)).toBeLessThanOrEqual(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: '.qa-cx15/after/anmeldungen-nonempty-390.png', fullPage: true })
})

test('mobile status and camp-date text keep at least 4.5:1 contrast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dev/admin-vorschau/camp')
  const measurements = await page.locator('.cp-participant-summary .cp-row-status > div > span.cp-chip, .cp-camp-date').evaluateAll(elements => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => {
        const c = n / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
    }
    return elements.map(el => {
      const color = getComputedStyle(el).color
      let ancestor: Element | null = el
      let background = 'rgba(0, 0, 0, 0)'
      while (ancestor && background === 'rgba(0, 0, 0, 0)') {
        background = getComputedStyle(ancestor).backgroundColor
        ancestor = ancestor.parentElement
      }
      const a = luminance(color), b = luminance(background)
      return { text: el.textContent, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) }
    })
  })
  expect(measurements.length).toBeGreaterThan(0)
  for (const item of measurements) expect(item.contrast, `${item.text}: ${item.contrast}`).toBeGreaterThanOrEqual(4.5)
  console.log(`Kontrast Minimum: ${Math.min(...measurements.map(item => item.contrast)).toFixed(2)}:1`)
})
