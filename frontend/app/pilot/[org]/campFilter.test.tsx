import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import CampFilter from './CampFilter'
import ParentFlow from './ParentFlow'
import {
  applyFilter,
  buildUrlSearch,
  EMPTY_FILTER,
  FILTER_THRESHOLD,
  getLocationOptions,
  getZeitraumOptions,
  NO_LOCATION_VALUE,
  parseUrlFilter,
  type FilterState,
} from './campFilterUtils'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

// ── Pure utility tests ──

it('parseUrlFilter liest ort aus der URL', () => {
  expect(parseUrlFilter('?ort=Kassel')).toEqual({ ort: 'Kassel', zeiten: [] })
})

it('parseUrlFilter liest ort und zeiten aus der URL', () => {
  expect(parseUrlFilter('?ort=Baunatal&zeit=sommer,herbst')).toEqual({
    ort: 'Baunatal',
    zeiten: ['sommer', 'herbst'],
  })
})

it('parseUrlFilter ignoriert ungültige Zeitraumwerte', () => {
  expect(parseUrlFilter('?zeit=invalid,sommer,SOMMER')).toEqual({ ort: '', zeiten: ['sommer'] })
})

it('parseUrlFilter gibt EMPTY_FILTER zurück bei leerem String', () => {
  expect(parseUrlFilter('')).toEqual(EMPTY_FILTER)
})

it('buildUrlSearch schreibt ort in die URL', () => {
  const s = buildUrlSearch({ ort: 'Kassel', zeiten: [] })
  expect(s).toContain('ort=Kassel')
  expect(s.startsWith('?')).toBe(true)
})

it('buildUrlSearch schreibt zeiten in die URL', () => {
  const s = buildUrlSearch({ ort: '', zeiten: ['sommer', 'herbst'] })
  expect(s).toContain('zeit=')
  expect(parseUrlFilter(s).zeiten).toEqual(['sommer', 'herbst'])
})

it('buildUrlSearch gibt leeren String zurück für EMPTY_FILTER', () => {
  expect(buildUrlSearch(EMPTY_FILTER)).toBe('')
})

it('parseUrlFilter → buildUrlSearch Roundtrip bleibt stabil', () => {
  const filter: FilterState = { ort: 'Baunatal', zeiten: ['sommer', 'herbst'] }
  expect(parseUrlFilter(buildUrlSearch(filter))).toEqual(filter)
})

it('getLocationOptions sortiert alphabetisch, Ohne Ortsangabe zuletzt', () => {
  const camps = [
    { location: 'Kassel', start_date: '2027-07-01', end_date: '2027-07-05' },
    { location: null, start_date: '2027-08-01', end_date: '2027-08-05' },
    { location: 'Baunatal', start_date: '2027-07-10', end_date: '2027-07-14' },
    { location: 'Kassel', start_date: '2027-09-01', end_date: '2027-09-05' },
  ] as CampPublic[]
  const opts = getLocationOptions(camps)
  expect(opts.map(o => o.label)).toEqual(['Baunatal', 'Kassel', 'Ohne Ortsangabe'])
  expect(opts.find(o => o.label === 'Kassel')!.count).toBe(2)
  expect(opts.find(o => o.label === 'Ohne Ortsangabe')!.count).toBe(1)
})

it('getZeitraumOptions liefert nur Optionen mit Treffern', () => {
  const camps = [
    { location: 'A', start_date: '2027-07-01', end_date: '2027-07-05' }, // sommer
    { location: 'A', start_date: '2027-08-10', end_date: '2027-08-14' }, // sommer
    { location: 'A', start_date: '2027-10-01', end_date: '2027-10-05' }, // herbst
  ] as CampPublic[]
  const opts = getZeitraumOptions(camps)
  expect(opts.map(o => o.key)).toEqual(['sommer', 'herbst'])
  expect(opts.find(o => o.key === 'sommer')!.count).toBe(2)
  expect(opts.find(o => o.key === 'herbst')!.count).toBe(1)
})

it('applyFilter filtert nach Ort', () => {
  const camps = [
    { location: 'Kassel', start_date: '2027-07-01', end_date: '2027-07-05' },
    { location: 'Baunatal', start_date: '2027-08-01', end_date: '2027-08-05' },
  ] as CampPublic[]
  const res = applyFilter(camps, { ort: 'Kassel', zeiten: [] })
  expect(res).toHaveLength(1)
  expect(res[0].location).toBe('Kassel')
})

it('applyFilter filtert nach Zeitraum (Mehrfachauswahl)', () => {
  const camps = [
    { location: 'A', start_date: '2027-07-01', end_date: '2027-07-05' }, // sommer
    { location: 'A', start_date: '2027-10-01', end_date: '2027-10-05' }, // herbst
    { location: 'A', start_date: '2027-03-10', end_date: '2027-03-14' }, // ostern
  ] as CampPublic[]
  const res = applyFilter(camps, { ort: '', zeiten: ['sommer', 'herbst'] })
  expect(res).toHaveLength(2)
  expect(res.map(c => c.start_date)).toContain('2027-07-01')
  expect(res.map(c => c.start_date)).toContain('2027-10-01')
})

it('applyFilter kombiniert Ort und Zeitraum', () => {
  const camps = [
    { location: 'Kassel', start_date: '2027-07-01', end_date: '2027-07-05' }, // Kassel, sommer
    { location: 'Baunatal', start_date: '2027-07-10', end_date: '2027-07-14' }, // Baunatal, sommer
    { location: 'Kassel', start_date: '2027-10-01', end_date: '2027-10-05' }, // Kassel, herbst
  ] as CampPublic[]
  const res = applyFilter(camps, { ort: 'Kassel', zeiten: ['sommer'] })
  expect(res).toHaveLength(1)
  expect(res[0].start_date).toBe('2027-07-01')
})

it('applyFilter mit NO_LOCATION_VALUE filtert Camps ohne Ort', () => {
  const camps = [
    { location: null, start_date: '2027-07-01', end_date: '2027-07-05' },
    { location: 'Kassel', start_date: '2027-07-10', end_date: '2027-07-14' },
  ] as CampPublic[]
  const res = applyFilter(camps, { ort: NO_LOCATION_VALUE, zeiten: [] })
  expect(res).toHaveLength(1)
  expect(res[0].location).toBeNull()
})

// ── Fixture: 24 Camps an 8 Orten ──
// Locations sorted: Baunatal(3) Fulda(3) Gießen(3) Hanau(3) Kassel(3) Marburg(3) Wetzlar(3) Wiesbaden(3)
// All start dates in July/August → all Sommer

const LOCS = ['Baunatal', 'Fulda', 'Gießen', 'Hanau', 'Kassel', 'Marburg', 'Wetzlar', 'Wiesbaden']
const DATE_TRIPLES: Array<[string, string]> = [
  ['2027-07-07', '2027-07-11'],
  ['2027-07-14', '2027-07-18'],
  ['2027-08-04', '2027-08-08'],
]

function makeCamp(i: number): CampPublic {
  return {
    slug: `camp-${i}`,
    title: `Fußballcamp ${i + 1}`,
    start_date: DATE_TRIPLES[Math.floor(i / 8)][0],
    end_date: DATE_TRIPLES[Math.floor(i / 8)][1],
    registration_start: null,
    registration_end: null,
    age_min: 8,
    age_max: 14,
    capacity: 20,
    price_cents: 19900,
    currency: 'EUR',
    registration_open: true,
    location: LOCS[i % 8],
    care_info: null,
    meals_info: null,
    includes: null,
    registered_count: 5,
    waitlist_count: 0,
    spots_remaining: 15,
    is_full: false,
  }
}

const camps24 = Array.from({ length: 24 }, (_, i) => makeCamp(i))
const camps6 = camps24.slice(0, 6)

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Sommer', intro_text: null,
  hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
}

// ── Schwellentest (Mutationsprobe: FILTER_THRESHOLD → 0 macht diesen Test rot) ──

it('≤6 Camps: keine Filterleiste — FILTER_THRESHOLD muss 6 sein', () => {
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={camps6} />)
  expect(html).not.toContain('campfilter')
  // Mutationsprobe: ist FILTER_THRESHOLD != 6, schlägt der Test hier fehl
  expect(FILTER_THRESHOLD).toBe(6)
})

it('7 Camps: Filterleiste erscheint', () => {
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={camps24.slice(0, 7)} />)
  expect(html).toContain('campfilter')
})

it('12 Camps: Filterleiste vorhanden und Ortsliste korrekt gezählt', () => {
  // 12 camps: i=0..11 → Baunatal(2), Fulda(2), Gießen(2), Hanau(2), Kassel(1), Marburg(1), Wetzlar(1), Wiesbaden(1)
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={camps24.slice(0, 12)} />)
  expect(html).toContain('campfilter')
  expect(html).toContain('Baunatal (2)')
  expect(html).toContain('Kassel (1)')
})

// ── CampFilter-Komponente direkt ──

it('CampFilter zeigt korrekte Trefferzahl', () => {
  const html = renderToStaticMarkup(
    <CampFilter camps={camps24} filter={EMPTY_FILTER} filteredCount={24} onFilterChange={() => {}} />
  )
  expect(html).toContain('24 Camps')
})

it('CampFilter zeigt aktive Zeitraum-Chips mit aria-pressed="true"', () => {
  const html = renderToStaticMarkup(
    <CampFilter
      camps={camps24}
      filter={{ ort: '', zeiten: ['sommer'] }}
      filteredCount={24}
      onFilterChange={() => {}}
    />
  )
  expect(html).toContain('aria-pressed="true"')
})

it('CampFilter zeigt "Filter zurücksetzen" nur bei aktivem Filter', () => {
  const inactiveHtml = renderToStaticMarkup(
    <CampFilter camps={camps24} filter={EMPTY_FILTER} filteredCount={24} onFilterChange={() => {}} />
  )
  expect(inactiveHtml).not.toContain('Filter zurücksetzen')

  const activeHtml = renderToStaticMarkup(
    <CampFilter camps={camps24} filter={{ ort: 'Kassel', zeiten: [] }} filteredCount={3} onFilterChange={() => {}} />
  )
  expect(activeHtml).toContain('Filter zurücksetzen')
})

// ── Ort-Filter über testFilter-Prop ──

it('Ort-Filter: zeigt nur passende Camps', () => {
  // Kassel: i=4, i=12, i=20 → 3 Camps
  const html = renderToStaticMarkup(
    <ParentFlow org={org} camps={camps24} testFilter={{ ort: 'Kassel', zeiten: [] }} />
  )
  expect(html).toContain('3 Camps')
})

// ── Zeitraum-Mehrfachauswahl ──

it('Zeitraum-Mehrfachauswahl sommer + herbst', () => {
  const herbstCamp: CampPublic = {
    ...makeCamp(0),
    slug: 'camp-herbst',
    start_date: '2027-10-06',
    end_date: '2027-10-10',
    location: 'Kassel',
  }
  const mixed = [...camps24, herbstCamp]

  // Nur Sommer: 24 Treffer
  const htmlSommer = renderToStaticMarkup(
    <ParentFlow org={org} camps={mixed} testFilter={{ ort: '', zeiten: ['sommer'] }} />
  )
  expect(htmlSommer).toContain('24 Camps')

  // Sommer + Herbst: 25 Treffer
  const htmlBeide = renderToStaticMarkup(
    <ParentFlow org={org} camps={mixed} testFilter={{ ort: '', zeiten: ['sommer', 'herbst'] }} />
  )
  expect(htmlBeide).toContain('25 Camps')
})

// ── Kombination Ort + Zeitraum ──

it('Kombination Ort + Zeitraum', () => {
  // Kassel sommer: i=4 (07-07), i=12 (07-14), i=20 (08-04) → 3 Treffer
  const html = renderToStaticMarkup(
    <ParentFlow org={org} camps={camps24} testFilter={{ ort: 'Kassel', zeiten: ['sommer'] }} />
  )
  expect(html).toContain('3 Camps')
})

// ── URL-Parameter werden gelesen (pure function test) ──

it('URL-Parameter ort und zeit werden korrekt gelesen', () => {
  const filter = parseUrlFilter('?ort=Kassel&zeit=sommer,herbst')
  expect(filter.ort).toBe('Kassel')
  expect(filter.zeiten).toContain('sommer')
  expect(filter.zeiten).toContain('herbst')
})

// ── URL-Parameter werden geschrieben (pure function test) ──

it('URL-Parameter ort und zeit werden korrekt geschrieben', () => {
  const url = buildUrlSearch({ ort: 'Kassel', zeiten: ['sommer', 'herbst'] })
  expect(url).toMatch(/ort=Kassel/)
  expect(url).toMatch(/zeit=/)
  // Roundtrip-Verifikation
  const back = parseUrlFilter(url)
  expect(back.ort).toBe('Kassel')
  expect(back.zeiten).toContain('sommer')
  expect(back.zeiten).toContain('herbst')
})

// ── Ungültige Parameter werden ignoriert ──

it('Ungültige URL-Parameter werden ignoriert', () => {
  const filter = parseUrlFilter('?ort=X&zeit=invalid,sommer,ALSO-INVALID')
  expect(filter.ort).toBe('X')         // ort wird nicht validiert (unbekannter Ort → leere Trefferliste)
  expect(filter.zeiten).toEqual(['sommer'])  // nur gültiger Wert bleibt
})

// ── Leere Trefferliste zeigt Hinweis ──

it('Leere Trefferliste zeigt freundlichen Hinweis und Reset-Knopf', () => {
  // 'Berlin' ist kein Ort in camps24 → 0 Treffer
  const html = renderToStaticMarkup(
    <ParentFlow org={org} camps={camps24} testFilter={{ ort: 'Berlin', zeiten: [] }} />
  )
  expect(html).toContain('Kein Camp passt')
  expect(html).toContain('Alle Camps zeigen')
})
