// @vitest-environment jsdom
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { CampPublic } from '../../lib/saasApi'
import CampRow from './CampRow'

const base: CampPublic = {
  slug: 'a', title: 'Sommercamp', start_date: '2027-07-07', end_date: '2027-07-11',
  registration_start: null, registration_end: null, age_min: 8, age_max: 14, capacity: 30, price_cents: 19900,
  currency: 'EUR', registration_open: true, location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
}
const css = readFileSync(join(__dirname, 'publicTheme.css'), 'utf8')

it('jede Campkarte traegt die gemeinsame Groessenklasse, Titel mit Volltext-Tooltip', () => {
  const html = renderToStaticMarkup(<CampRow camp={{ ...base, title: 'Ein sehr langer Titel '.repeat(6) }} onSelect={() => {}} />)
  expect(html).toContain('class="camp camp-card')
  expect(html).toMatch(/class="c-name" title="Ein sehr langer Titel/)
})

it('zeigt hoechstens zwei Leistungen und fasst den Rest zusammen', () => {
  const html = renderToStaticMarkup(<CampRow camp={{ ...base, includes: ['A', 'B', 'C', 'D', 'E'] }} onSelect={() => {}} />)
  expect((html.match(/<li>/g) ?? []).length).toBe(2)
  expect(html).toContain('+3 weitere')
})

it('CSS: gleich hohe Zeilen, Titel auf 2 Zeilen, Knopf unten angeheftet (alle Themes)', () => {
  const block = css.slice(css.indexOf('Campkarten kompakt und gleich gross'))
  expect(block).toMatch(/\.camps \{[^}]*grid-auto-rows: 1fr/)
  expect(block).toMatch(/\.camps \{[^}]*align-items: stretch/)
  expect(block).toMatch(/\.camps \.camp \{[^}]*flex-direction: column/)
  expect(block).toMatch(/\.c-name \{[^}]*-webkit-line-clamp: 2/)
  expect(block).toMatch(/\.c-foot \{[^}]*margin-top: auto/)
  expect(block).toMatch(/\.inc \{[^}]*min-height/)
})
