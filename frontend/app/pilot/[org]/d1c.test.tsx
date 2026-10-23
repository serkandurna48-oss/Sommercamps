// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import CampRow from './CampRow'
import { publicUI } from '../../lib/i18n/de'
import type { CampPublic } from '../../lib/saasApi'
import { formatCampDateRange } from '../../lib/parentFlowFormat'

const css = readFileSync('app/pilot/[org]/publicTheme.css', 'utf8')

const mockCamp: CampPublic = {
  slug: 'test', title: 'Testcamp', start_date: '2027-01-04', end_date: '2027-01-07',
  registration_start: null, registration_end: null,
  age_min: 8, age_max: 14, capacity: 30, price_cents: 19900, currency: 'EUR',
  registration_open: true, location: null, care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
}

// ── Tracking-Variable je Theme ──

it('tradition theme defines --h-tracking: -0.01em (serif headline tracking)', () => {
  // -0.01em appears only in the tradition theme block; akademie/kompakt use -0.03em
  expect(css).toContain('--h-tracking: -0.01em')
  expect(css).toContain('--h-tracking: -0.03em')
})

// ── Camp-Karte ohne Datums-Chip (Mutations-Probe: Chip wieder einfügen → Test rot) ──

it('CampRow does not render date chip in tags area (mutation probe)', () => {
  const html = renderToStaticMarkup(<CampRow camp={mockCamp} onSelect={() => {}} />)
  const dateRange = formatCampDateRange(mockCamp.start_date, mockCamp.end_date)
  // Date still appears as dateline under title
  expect(html).toContain(dateRange)
  // But NOT as a class="tag" chip in the tags area
  expect(html).not.toContain(`class="tag">${dateRange}`)
})

it('CampRow still shows age chip after date chip removal', () => {
  const html = renderToStaticMarkup(<CampRow camp={mockCamp} onSelect={() => {}} />)
  expect(html).toContain('8–14 Jahre')
})

// ── Abschnittsköpfe linksbündig ──

it('CSS: no .sec-head rule contains text-align: center', () => {
  const matches = [...css.matchAll(/\.sec-head[^{]*\{([^}]+)\}/g)]
  for (const m of matches) {
    expect(m[1]).not.toContain('text-align: center')
  }
})

it('CSS: tradition .sec-head::after separator is removed', () => {
  expect(css).not.toContain("[data-theme='tradition'] .sec-head::after")
})

// ── Schritt-1-Text enthält „Platz sichern" ──

it('howItWorks step 1 body references „Platz sichern"', () => {
  expect(publicUI.howItWorks.steps[0].body).toContain('Platz sichern')
})
