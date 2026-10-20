// @vitest-environment jsdom

/**
 * M8 Barrierefreiheit — drei Kernanforderungen:
 *   1. Fokus landet nach jedem Screenwechsel auf der h1 des neuen Screens
 *   2. DoneScreen-Headline trägt role="status" (Live-Region)
 *   3. Laufband ist aria-hidden (Screen-Reader überspringt es)
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import ParentFlow, { CampScreen } from './ParentFlow'
import DoneScreen from './DoneScreen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: null,
  hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
}

const camp: CampPublic = {
  slug: 'camp-a', title: 'Sommercamp A', start_date: '2026-07-07', end_date: '2026-07-11',
  registration_start: null, registration_end: null,
  age_min: 8, age_max: 14, capacity: 30, price_cents: 19900, currency: 'EUR',
  registration_open: true, location: 'Kassel', care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
}

const doneResult: RegistrationCreated = {
  registration_token: 'tok', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234',
}

// ── Statische Checks via SSR ──────────────────────────────────────────────

it('marquee-band trägt aria-hidden="true"', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'akademie' }} camps={[camp]} />)
  expect(html).toContain('marquee-band')
  expect(html).toMatch(/class="marquee-band[^"]*"[^>]*aria-hidden="true"/)
})

it('DoneScreen h1 trägt role="status"', () => {
  const html = renderToStaticMarkup(
    <DoneScreen org={{ ...org, iban: 'DE89370400440532013000' }} camp={camp}
      result={doneResult} childName="Mia" parentEmail="test@test.de" onBackToOrg={() => {}} />,
  )
  expect(html).toContain('role="status"')
})

it('DoneScreen h1 trägt tabindex="-1"', () => {
  const html = renderToStaticMarkup(
    <DoneScreen org={org} camp={camp}
      result={doneResult} childName="Mia" parentEmail="test@test.de" onBackToOrg={() => {}} />,
  )
  expect(html).toContain('tabindex="-1"')
})

it('CampScreen h1 trägt tabindex="-1"', () => {
  const html = renderToStaticMarkup(
    <CampScreen org={org} camp={camp} onBack={() => {}} onRegister={() => {}} />,
  )
  expect(html).toContain('tabindex="-1"')
})

// ── DOM-Tests: tatsächlicher Fokus nach Mount ─────────────────────────────

let container: HTMLDivElement

afterEach(() => {
  if (container && document.body.contains(container)) {
    document.body.removeChild(container)
  }
})

it('CampScreen fokussiert h1 nach Mount', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<CampScreen org={org} camp={camp} onBack={() => {}} onRegister={() => {}} />)
  })
  expect(document.activeElement?.tagName).toBe('H1')
  await act(async () => { root.unmount() })
})

it('DoneScreen fokussiert h1 nach Mount', async () => {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <DoneScreen org={org} camp={camp} result={doneResult}
        childName="Mia" parentEmail="test@test.de" onBackToOrg={() => {}} />,
    )
  })
  expect(document.activeElement?.tagName).toBe('H1')
  await act(async () => { root.unmount() })
})
