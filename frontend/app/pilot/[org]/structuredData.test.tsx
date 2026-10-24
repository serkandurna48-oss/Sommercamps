import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'

vi.mock('../../lib/saasApi', () => ({ fetchOrganization: vi.fn(), fetchCamps: vi.fn() }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./ParentFlow', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({ publicFontClassName: () => '' }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('notFound') } }))

import { fetchCamps, fetchOrganization } from '../../lib/saasApi'
import PilotOrgPage from './page'

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein <Fußball>', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.com', contact_phone: null,
  logo_url: null, primary_color: null, theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
}
const camp: CampPublic = {
  slug: 'sommercamp', title: 'Fußballcamp </script><script>alert(1)</script>',
  start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12,
  capacity: 20, price_cents: 12345, currency: 'EUR', registration_open: true,
  location: 'Sportplatz <West>', care_info: null, meals_info: null, includes: null,
  registered_count: 0, waitlist_count: 0, spots_remaining: 20, is_full: false,
}
const renderPage = async () => renderToStaticMarkup(await PilotOrgPage({ params: Promise.resolve({ org: org.slug }) }))
const scriptsFrom = (html: string) => Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g), match => match[1])

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  vi.mocked(fetchOrganization).mockReset().mockResolvedValue(org)
  vi.mocked(fetchCamps).mockReset().mockResolvedValue([camp])
})
afterEach(() => vi.useRealTimers())

it('rendert gültiges SportsEvent-JSON pro veröffentlichtem Camp mit Preis, Ort und Veranstalter', async () => {
  vi.mocked(fetchCamps).mockResolvedValue([
    camp,
    { ...camp, slug: 'geschlossen', title: 'Herbstcamp', registration_open: false, location: null, price_cents: 0 },
  ])
  const scripts = scriptsFrom(await renderPage())
  expect(scripts).toHaveLength(2)
  expect(JSON.parse(scripts[0])).toEqual({
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: camp.title,
    startDate: camp.start_date, endDate: camp.end_date,
    location: { '@type': 'Place', name: camp.location },
    offers: { '@type': 'Offer', price: 123.45, priceCurrency: 'EUR' },
    organizer: { '@type': 'SportsOrganization', name: org.name },
  })
  expect(JSON.parse(scripts[1])).not.toHaveProperty('location')
  expect(JSON.parse(scripts[1]).offers.price).toBe(0)
  expect(fetchCamps).toHaveBeenCalledWith(org.slug)
})

it('maskiert jedes < und verhindert das Ausbrechen aus dem JSON-LD-Script', async () => {
  const html = await renderPage()
  const scripts = scriptsFrom(html)
  expect(scripts).toHaveLength(1)
  expect(scripts[0]).not.toContain('<')
  expect(scripts[0]).toContain('\\u003c/script>')
  expect(scripts[0]).toContain('\\u003cFußball>')
  expect(scripts[0]).toContain('\\u003cWest>')
  expect(html.match(/<script\b/g)).toHaveLength(1)
  expect(JSON.parse(scripts[0]).name).toBe(camp.title)
})

it('gibt für eine leere öffentliche Campliste keine Ereignisse aus', async () => {
  vi.mocked(fetchCamps).mockResolvedValue([])
  expect(scriptsFrom(await renderPage())).toEqual([])
})

it('gibt bei einem Ladefehler keine erfundenen Ereignisse aus', async () => {
  vi.mocked(fetchCamps).mockRejectedValue(new Error('API nicht verfügbar'))
  expect(scriptsFrom(await renderPage())).toEqual([])
})
