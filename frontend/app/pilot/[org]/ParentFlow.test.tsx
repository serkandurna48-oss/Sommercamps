import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import ParentFlow, { CampScreen, headlineScale } from './ParentFlow'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: 'https://images.example.com/demo.jpg',
  trainer_image_url: null, trainer_text: null,
}

it.each(['tradition', 'akademie', 'kompakt'] as const)('%s uses the organization heading and intro', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[]} />)
  expect(html).toContain('Unser Fußballsommer')
  expect(html).toContain('Trainieren bei Demo FC.')
  expect(html).not.toContain('/jk/hero.jpg')
  if (theme !== 'kompakt') expect(html).toContain(org.hero_image_url)
})

it.each(['tradition', 'akademie', 'kompakt'] as const)('%s handles missing editorial content without another club image', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{
    ...org, theme, intro_heading: ' ', intro_text: null, hero_image_url: null,
  }} camps={[]} />)
  expect(html).toMatch(/<h1[^>]*>Demo FC<\/h1>/)
  expect(html).toContain('Alle Camps auf einen Blick')
  expect(html).not.toContain('/jk/')
  expect(html).not.toContain('/pilot/leibchen.webp')
})

it('renders trainer section when trainer_image_url is set', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{
    ...org,
    contact_person_name: 'Jan Koch',
    trainer_image_url: '/jk/camp.jpg',
    trainer_text: 'Leitet die Academy und trainiert jede Camp-Gruppe selbst.',
  }} camps={[]} />)
  expect(html).toContain('Dein Trainer')
  expect(html).toContain('Jan Koch')
  expect(html).toContain('Leitet die Academy und trainiert jede Camp-Gruppe selbst.')
  expect(html).toContain('/jk/camp.jpg')
})

it('does not render trainer section when trainer_image_url is null', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, trainer_image_url: null }} camps={[]} />)
  expect(html).not.toContain('Dein Trainer')
})

it.each(['tradition', 'akademie', 'kompakt'] as const)('%s does not render img-strip', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[]} />)
  expect(html).not.toContain('img-strip')
})

const mockCamp = {
  slug: 'camp-a', title: 'Sommercamp A', start_date: '2026-07-07', end_date: '2026-07-11',
  registration_start: null, registration_end: null,
  age_min: 8, age_max: 14, capacity: 30, price_cents: 19900, currency: 'EUR',
  registration_open: true, location: 'Kassel', care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
} as const

it('akademie hero contains label, headline, both buttons and stats bar', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'akademie' }} camps={[mockCamp]} />)
  expect(html).toContain('hero-label')
  expect(html).toContain('Unser Fußballsommer')
  expect(html).toContain('Camps ansehen')
  expect(html).toContain('Jetzt anmelden')
  expect(html).toContain('hero-stats')
  expect(html).toContain('Plätze gesamt')
})

it.each(['tradition', 'kompakt'] as const)('%s still renders heading in its own hero', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[]} />)
  expect(html).toContain('Unser Fußballsommer')
})

// ── headlineScale unit tests ──
const jkLeitsatz = 'DU willst DICH weiterentwickeln, wir bringen DICH auf DEIN nächstes Level.'

it('headlineScale: ≤24 Zeichen → xl', () => {
  expect(headlineScale('Unser Fußballsommer')).toBe('xl')
})

it('headlineScale: 40 Zeichen → lg', () => {
  expect(headlineScale('Starte jetzt mit dem besten Fußballcamp!')).toBe('lg')
})

it('headlineScale: JKs langer Leitsatz (>48 Zeichen) → md', () => {
  expect(headlineScale(jkLeitsatz)).toBe('md')
})

it('akademie h1 trägt data-scale="md" bei JKs Leitsatz', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'akademie', intro_heading: jkLeitsatz }} camps={[]} />)
  expect(html).toContain('data-scale="md"')
})

// ── M3: CampScreen ──
it('CampScreen rendert Camp-Titel, Preis und CTA', () => {
  const camp: CampPublic = {
    slug: 'camp-a', title: 'Sommercamp A', start_date: '2026-07-07', end_date: '2026-07-11',
    registration_start: null, registration_end: null,
    age_min: 8, age_max: 14, capacity: 30, price_cents: 19900, currency: 'EUR',
    registration_open: true, location: 'Kassel', care_info: null, meals_info: null, includes: null,
    registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
  }
  const html = renderToStaticMarkup(
    <CampScreen org={{ ...org, theme: 'tradition' }} camp={camp} onBack={() => {}} onRegister={() => {}} />,
  )
  expect(html).toContain('Sommercamp A')
  expect(html).toContain('dock')  // Preis/CTA-Leiste vorhanden
  expect(html).toContain('199') // Preis 199,00 € enthält "199"
  expect(html).toContain('Jetzt anmelden')
})

// ── M4: tradition und kompakt Hero-Struktur ──
it.each(['tradition', 'kompakt'] as const)('%s hero rendert hero-label, Headline und beide Buttons', theme => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[mockCamp]} />)
  expect(html).toContain('hero-label')
  expect(html).toContain('Unser Fußballsommer')
  expect(html).toContain('Camps ansehen')
  expect(html).toContain('Jetzt anmelden')
})

it('tradition hero rendert Foto wenn hero_image_url gesetzt', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'tradition' }} camps={[]} />)
  expect(html).toContain('h-trad-shot')
  expect(html).toContain(org.hero_image_url)
})

it('tradition hero rendert kein Foto-Element ohne hero_image_url', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'tradition', hero_image_url: null }} camps={[]} />)
  expect(html).not.toContain('h-trad-shot')
})

it('kompakt hero rendert kein Foto (Text-Hero)', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'kompakt' }} camps={[mockCamp]} />)
  expect(html).not.toContain('h-trad-shot')
  expect(html).not.toContain(org.hero_image_url)
})

it('tradition hero rendert Kennzahlen-Leiste wenn Camps vorhanden', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'tradition' }} camps={[mockCamp]} />)
  expect(html).toContain('h-trad-stats')
  expect(html).toContain('hstat-w')
})

it('kompakt hero rendert Kennzahlen-Zeile wenn Camps vorhanden', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme: 'kompakt' }} camps={[mockCamp]} />)
  expect(html).toContain('h-komp-stats')
  expect(html).toContain('hstat-w')
})
