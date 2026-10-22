// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import HilfeScreen from './HilfeScreen'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'

vi.mock('next/navigation', () => ({ usePathname: () => '/pilot/demo/hilfe' }))
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

const org: OrganizationAdmin = {
  id: 'test-org', slug: 'demo', name: 'Test FC', legal_name: null, legal_address: null,
  contact_email: 'test@example.com', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: '#cc0000', plan_status: 'active', theme: 'tradition',
  iban: null, intro_heading: 'Test', intro_text: 'Test.', hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
  billing_notes: null, site_published: true, camp_count: 0,
}

it('renders all 7 sections', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toContain('In 3 Schritten zur Anmeldeseite')
  expect(html).toContain('Camp anlegen und veröffentlichen')
  expect(html).toContain('Anmeldelink teilen')
  expect(html).toContain('Zahlungen prüfen und als bezahlt markieren')
  expect(html).toContain('Warteliste und Storno')
  expect(html).toContain('Tagesliste exportieren')
  expect(html).toContain('Häufige Eltern-Fragen')
})

it('header contains a Hilfe link', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  const doc = window.document.implementation.createHTMLDocument()
  doc.body.innerHTML = html
  const header = doc.querySelector('header')!
  const hilfeLink = [...header.querySelectorAll('a')].find(a => a.textContent?.trim() === 'Hilfe')
  expect(hilfeLink).not.toBeUndefined()
  expect(hilfeLink?.getAttribute('href')).toBe('/pilot/demo/hilfe')
})

it('copy text templates use Sie form for parents', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toMatch(/\bSie\b/)
})

it('FAQ answers use Sie form', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="demo" org={org} />)
  expect(html).toContain('Wie läuft die Bezahlung ab?')
  expect(html).toContain('Sie eine Anmeldebestätigung')
})

it('includes the orgSlug in the copy templates', () => {
  const html = renderToStaticMarkup(<HilfeScreen orgSlug="testverein" org={{ ...org, slug: 'testverein' }} />)
  expect(html).toContain('/pilot/testverein')
})
