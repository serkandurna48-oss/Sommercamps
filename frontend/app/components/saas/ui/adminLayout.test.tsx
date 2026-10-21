// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import Field from './Field'
import PriceInput from './PriceInput'
import StatGrid from './StatGrid'
import StatCard from '../data/StatCard'
import ListRow from './ListRow'
import { waitingSince, de } from '../../../lib/i18n/de'
import { getPreviewFixtures } from '../../../dev/admin-vorschau/fixtures'

it('keeps four metrics in one desktop row and two mobile columns without wide spans', () => {
  const html = renderToStaticMarkup(<StatGrid><StatCard label="Belegung" value="16/20" /><StatCard label="Geld" value="2.457,00 € / 567,00 €" wide /><StatCard label="Warteliste" value="4" /><StatCard label="Aufgaben" value="3" /></StatGrid>)
  const document = window.document.implementation.createHTMLDocument()
  document.body.innerHTML = html
  expect(document.querySelector('.cp-stat-grid')?.children).toHaveLength(4)
  expect(document.querySelectorAll('.cp-stat-money .cp-stat-amount')).toHaveLength(2)
  const css = readFileSync('app/components/saas/tokens.css', 'utf8')
  expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
  expect(css).toContain('grid-auto-flow: column')
  expect(css).toContain('font-size: clamp(')
})

it('shares four aligned row slots and places the action beside mobile status', () => {
  const html = renderToStaticMarkup(<ListRow main="Kind" secondary="Eltern" status="Offen" action="Ansehen" />)
  for (const slot of ['main', 'secondary', 'status', 'action']) expect(html).toContain('cp-row-' + slot)
  const css = readFileSync('app/components/saas/tokens.css', 'utf8')
  expect(css).toContain("grid-template-areas: 'main main' 'secondary secondary' 'status action'")
  expect(css).toContain("grid-template-areas: 'main secondary status action'")
})

it('accepts German decimal input, formats on blur, and submits the displayed value with an accessible unit', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(() => root.render(<form><Field htmlFor="price" label="Preis" suffix="€" hint="Zum Beispiel 189,00 €."><PriceInput id="price" name="price_euros" required defaultValue="189,00" /></Field></form>))
    const input = container.querySelector('input')!
    expect(input.type).toBe('text')
    expect(input.inputMode).toBe('decimal')
    expect(input.checkValidity()).toBe(true)
    expect(input.getAttribute('aria-describedby')).toBe('price-unit price-hint')
    expect(new FormData(container.querySelector('form')!).get('price_euros')).toBe('189,00')
    input.value = '149.5'
    await act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(input.value).toBe('149,50')
    for (const value of ['-1', '1,234', 'abc']) { input.value = value; expect(input.checkValidity()).toBe(false) }
  } finally { await act(() => root.unmount()); container.remove() }
})

it('never describes a future registration as waiting since today, even later on the same day', () => {
  const now = new Date('2026-10-21T12:00:00Z')
  expect(waitingSince('2026-10-21T13:00:00Z', now)).toBe('Anmeldedatum liegt in der Zukunft')
  expect(waitingSince('2027-01-01T12:00:00Z', now)).toBe('Anmeldedatum liegt in der Zukunft')
  expect(de.waitlistPage.waitingSince(-1)).toBe('Anmeldedatum liegt in der Zukunft')
  expect(waitingSince('2026-10-21T10:00:00Z', now)).toBe('wartet seit heute')
  expect(waitingSince('2026-10-20T10:00:00Z', now)).toBe('wartet seit 1 Tag')
  expect(waitingSince('2026-10-18T10:00:00Z', now)).toBe('wartet seit 3 Tagen')
})

it.each(['2026-10-21T12:00:00Z', '2028-02-29T00:00:00Z', '2030-12-31T23:59:00Z'])('builds current coherent fixtures at %s', timestamp => {
  const now = new Date(timestamp)
  const data = getPreviewFixtures(false, now)
  const today = Date.parse(timestamp.slice(0, 10))
  for (const registration of data.registrationsByCamp.flat()) {
    expect(Date.parse(registration.created_at)).toBeLessThan(now.getTime())
    const ageDays = (today - Date.parse(registration.created_at.slice(0, 10))) / 86400000
    expect(ageDays).toBeGreaterThanOrEqual(3)
    expect(ageDays).toBeLessThanOrEqual(30)
  }
  for (const camp of data.camps) {
    const days = (Date.parse(camp.start_date) - today) / 86400000
    expect(days).toBeGreaterThanOrEqual(60)
    expect(days).toBeLessThanOrEqual(120)
    expect(camp.end_date >= camp.start_date).toBe(true)
  }
})
