// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampAdmin, OrganizationAdmin } from '../../lib/saasAdminApi'
import EinrichtungScreen from './screens/EinrichtungScreen'
import CampConfigScreen from './screens/CampConfigScreen'
import OnboardingCard from './state/OnboardingCard'
import OrgDashboardScreen from './screens/OrgDashboardScreen'

vi.mock('./shell/MatchdayBand', () => ({ default: () => null }))
vi.mock('./actions/wizardActions', () => ({ saveAuftrittAction: vi.fn(), saveRechtlichesAction: vi.fn() }))
vi.mock('./actions/configActions', () => ({ createCampAction: vi.fn(), updateCampConfigAction: vi.fn() }))
vi.mock('./state/reviewActions', () => ({ submitReviewAction: vi.fn() }))

const org: OrganizationAdmin = {
  id: 'org', slug: 'testverein', name: 'Testverein', legal_name: null, legal_address: 'Musterstraße 1',
  contact_email: 'verein@example.test', contact_phone: null, contact_person_name: null,
  logo_url: null, primary_color: '#116644', plan_status: 'active', theme: 'default',
  iban: null, intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: 'Teilnahmebedingungen', site_published: false,
  review_status: 'draft', review_note: null,
}
const camp: CampAdmin = {
  id: 'camp', organization_id: 'org', slug: 'sommer', title: 'Sommercamp',
  start_date: '2099-07-05', end_date: '2099-07-09', registration_start: null, registration_end: null,
  age_min: 6, age_max: 12, capacity: 20, price_cents: 10000, currency: 'EUR',
  location: null, care_info: null, meals_info: null, includes: null, status: 'draft',
}
function markup(element: React.ReactNode) {
  const dom = document.createElement('div')
  dom.innerHTML = renderToStaticMarkup(element)
  return dom
}
function link(dom: HTMLElement, label: string, href: string) {
  const anchor = [...dom.querySelectorAll('a')].find(a => a.textContent?.trim() === label)
  expect(anchor, label).toBeDefined()
  expect(anchor!.getAttribute('href')).toBe(href)
}
function wizard(overrides: Partial<OrganizationAdmin> = {}) {
  return markup(<EinrichtungScreen orgSlug={org.slug} org={{ ...org, ...overrides }} camps={[camp]} requestedStep={4} />)
}

it('Entwurf: erklärt die noch nicht erreichbare Elternseite und bietet die Freigabe statt eines 404-Links', () => {
  const dom = wizard()
  expect(dom.textContent).toContain('Die Elternseite ist erst nach der Veröffentlichung erreichbar.')
  expect(dom.querySelector('a[href="/pilot/testverein"]')).toBeNull()
  expect([...dom.querySelectorAll('button')].some(b => b.textContent === 'Zur Freigabe einreichen')).toBe(true)
})

it('Freigegebener Wizard: führt direkt zur Vereins- und Camp-Veröffentlichung', () => {
  const dom = wizard({ review_status: 'approved' })
  link(dom, 'Vereinsseite veröffentlichen', '/pilot/testverein/konfiguration#publication')
  link(dom, 'Camp prüfen und veröffentlichen', '/pilot/testverein/camps/sommer/konfiguration')
})

it.each([false, true])('Freigegebene Übersicht mit veröffentlichter Vereinsseite %s: keine Wizard-Dashboard-Schleife', site_published => {
  const dom = markup(<OnboardingCard orgSlug={org.slug} org={{ ...org, review_status: 'approved', site_published }} camps={[camp]} brandStrong="#116644" brandOn="#fff" />)
  link(dom, 'Jetzt veröffentlichen', site_published ? '/pilot/testverein/camps/sommer/konfiguration' : '/pilot/testverein/konfiguration#publication')
})

it('Wartende Übersicht: Dauer, Hilfe und Status-Aktualisierung statt voreiliger Veröffentlichung', () => {
  const dom = markup(<OnboardingCard orgSlug={org.slug} org={{ ...org, review_status: 'submitted' }} camps={[camp]} brandStrong="#116644" brandOn="#fff" />)
  expect(dom.textContent).toContain('meist innerhalb eines Werktags')
  expect(dom.textContent).not.toContain('Jetzt veröffentlichen')
  link(dom, 'Freigabestatus aktualisieren', '/pilot/testverein/einrichtung?schritt=4')
  link(dom, 'Hilfe zur Einrichtung', '/pilot/testverein/hilfe')
})

it('Wartender Wizard: bietet eine erneute Statusabfrage auf derselben Route', () => {
  const dom = wizard({ review_status: 'submitted' })
  expect(dom.textContent).toContain('Sie müssen nichts erneut einreichen.')
  link(dom, 'Freigabestatus aktualisieren', '/pilot/testverein/einrichtung?schritt=4')
})

it('Erstes Camp angelegt: erklärt Speichern und verlinkt zurück zum vierten Einrichtungsschritt', () => {
  const dom = markup(<CampConfigScreen orgSlug={org.slug} campSlug={camp.slug} org={org} camp={camp} created />)
  expect(dom.textContent).toContain('Speichern Sie zuerst Ihre Camp-Angaben.')
  link(dom, 'Weiter zur Einrichtung und Freigabe', '/pilot/testverein/einrichtung?schritt=4')
})

it('Noch kein Camp: Übersicht führt zum ersten Camp im Assistenten', () => {
  const dom = markup(<OrgDashboardScreen orgSlug={org.slug} org={org} camps={[]} registrationsByCamp={[]} />)
  link(dom, 'Camp anlegen', '/pilot/testverein/einrichtung?schritt=3')
})
