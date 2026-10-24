// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import DoneScreen from './DoneScreen'

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein', theme: 'tradition', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.de', contact_phone: null, logo_url: null,
  primary_color: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null, iban: null,
}
const camp: CampPublic = {
  slug: 'wintercamp', title: 'Wintercamp für Groß & Klein', start_date: '2027-12-29', end_date: '2027-12-31',
  registration_start: null, registration_end: null, age_min: 6, age_max: 12, capacity: 20,
  price_cents: 14900, currency: 'EUR', registration_open: true, location: 'Sportplatz', care_info: '08:00–16:00 Uhr',
  meals_info: null, includes: null, registered_count: 1, waitlist_count: 0, spots_remaining: 19, is_full: false,
}
const result: RegistrationCreated = {
  registration_token: 'test-token', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234',
}
let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  window.history.replaceState(null, '', '/pilot/testverein?filter=privat#anmeldung')
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
async function render(theme: OrganizationPublic['theme'] = 'tradition', status = 'registered') {
  await act(async () => root.render(<DoneScreen org={{ ...org, theme }} camp={camp} result={{ ...result, status }}
    childName="Mia Muster" parentEmail="eva@example.de" onBackToOrg={() => {}} />))
}

it.each(['tradition', 'akademie', 'kompakt'] as const)('zeigt beide sekundären Aktionen im Theme %s mit korrekt kodiertem WhatsApp-Link', async theme => {
  await render(theme)
  const button = [...host.querySelectorAll('button')].find(node => node.textContent === 'In den Kalender eintragen')!
  const link = host.querySelector<HTMLAnchorElement>('a[href^="https://wa.me/"]')!
  expect(button).toBeTruthy()
  expect(button.className).toBe('btn btn-pill')
  expect(link.textContent).toBe('Per WhatsApp teilen')
  expect(link.className).toBe('btn btn-pill')
  expect(link.href).toBe(`https://wa.me/?text=${encodeURIComponent(`Ich habe mein Kind für ${camp.title} angemeldet: ${window.location.origin}/pilot/testverein`)}`)
  expect(link.target).toBe('_blank')
  expect(link.rel).toBe('noopener noreferrer')
  expect(link.href).not.toMatch(/test-token|Muster|eva|filter|anmeldung/)
})

it('lädt die ICS-Datei lokal mit Camp-Slug, korrektem Ende und ohne Personendaten herunter', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-24T12:34:56Z'))
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:test-calendar')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', class extends URL { static createObjectURL = createObjectURL; static revokeObjectURL = revokeObjectURL })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('wintercamp.ics')
    expect(this.href).toBe('blob:test-calendar')
    expect(this.isConnected).toBe(true)
  })
  await render()
  const button = [...host.querySelectorAll('button')].find(node => node.textContent === 'In den Kalender eintragen')!
  await act(async () => button.click())
  expect(click).toHaveBeenCalledOnce()
  const blob = createObjectURL.mock.calls[0][0] as Blob
  expect(blob.type).toBe('text/calendar;charset=utf-8')
  const content = await new Promise<string>(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
  expect(content).toContain('DTEND;VALUE=DATE:20280101\r\n')
  expect(content).toContain('DTSTAMP:20261024T123456Z\r\n')
  expect(content).toContain('LOCATION:Sportplatz\r\n')
  expect(content).toContain('DESCRIPTION:Betreuungszeiten: 08:00–16:00 Uhr\r\n')
  expect(content).not.toMatch(/Mia|Muster|eva@example.de|CP-1234/)
  expect(document.querySelector('a[download]')).toBeNull()
  expect(revokeObjectURL).not.toHaveBeenCalled()
  vi.runAllTimers()
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-calendar')
})

it('behauptet auf der Warteliste keine feste Camp-Teilnahme', async () => {
  await render('tradition', 'waitlist')
  expect(host.textContent).not.toContain('In den Kalender eintragen')
  expect(host.textContent).not.toContain('Per WhatsApp teilen')
})

it.each(['registered', 'waitlist'])('CX32: fokussiert die Statusüberschrift und druckt bei %s', async status => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  await render('tradition', status)
  const heading = host.querySelector('h1')!
  expect(heading.textContent?.trim()).toBe('Anmeldung eingegangen')
  expect(heading.getAttribute('role')).toBe('status')
  expect(heading.tabIndex).toBe(-1)
  expect(document.activeElement).toBe(heading)
  expect(host.querySelector('.done-email')?.textContent?.trim()).toBe('Wir haben eine Bestätigung an eva@example.de geschickt.')
  const button = [...host.querySelectorAll('button')].find(node => node.textContent === 'Seite drucken')!
  expect(button).toBeTruthy()
  await act(async () => button.click())
  expect(print).toHaveBeenCalledOnce()
})
