import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../../lib/saasApi'
import HeroLab from './HeroLab'

const org: OrganizationPublic = {
  slug: 'jk-academy-demo',
  name: 'JK Academy',
  legal_name: null,
  legal_address: null,
  contact_person_name: null,
  contact_email: 'info@jk.example',
  contact_phone: null,
  logo_url: null,
  primary_color: '#d4581f',
  theme: 'akademie',
  iban: null,
  intro_heading: 'Trainiere wie ein Profi',
  intro_text: 'Sommer-Fußballcamps für Kinder und Jugendliche.',
  hero_image_url: 'https://images.example.com/jk-hero.jpg',
  trainer_image_url: null,
  trainer_text: null,
}

const camp: CampPublic = {
  slug: 'camp-a',
  title: 'Sommercamp A',
  start_date: '2027-07-07',
  end_date: '2027-07-11',
  registration_start: null,
  registration_end: null,
  age_min: 8,
  age_max: 14,
  capacity: 30,
  price_cents: 19900,
  currency: 'EUR',
  registration_open: true,
  location: 'Kassel',
  care_info: null,
  meals_info: null,
  includes: null,
  registered_count: 10,
  waitlist_count: 0,
  spots_remaining: 20,
  is_full: false,
}

it.each([1, 2, 3] as const)(
  'Variante %i rendert Headline und Jetzt-anmelden-Button',
  v => {
    const html = renderToStaticMarkup(<HeroLab org={org} camps={[camp]} variant={v} />)
    // V1 renders the headline as word-level spans; check for a distinctive word
    expect(html).toContain('Trainiere')
    expect(html).toContain('Jetzt anmelden')
  },
)

it('ohne variant werden alle drei Varianten-Labels gerendert', () => {
  const html = renderToStaticMarkup(<HeroLab org={org} camps={[camp]} />)
  expect(html).toContain('Variante 1')
  expect(html).toContain('Variante 2')
  expect(html).toContain('Variante 3')
  expect(html).toContain('Trainiere wie ein Profi')
  expect(html).toContain('Jetzt anmelden')
})

it('kein opacity:0 als Inline-Style im SSR-Output', () => {
  ;([1, 2, 3] as const).forEach(v => {
    const html = renderToStaticMarkup(<HeroLab org={org} camps={[camp]} variant={v} />)
    expect(html).not.toMatch(/style="[^"]*opacity\s*:\s*0(?![\d.])/)
  })
})

// ── Variante 3 Mosaik: Verein-Unabhängigkeit ──

const neutralOrg: OrganizationPublic = { ...org, hero_image_url: 'https://example.org/a.jpg' }
const noHeroOrg: OrganizationPublic = { ...org, hero_image_url: null }
const jkOrg: OrganizationPublic = { ...org, hero_image_url: '/jk/hero.jpg' }

it('V3 neutraler Verein (externer hero): kein /jk/-Pfad im Mosaik', () => {
  const html = renderToStaticMarkup(<HeroLab org={neutralOrg} camps={[camp]} variant={3} />)
  expect(html).not.toContain('/jk/')
})

it('V3 ohne hero_image_url: rendert ohne Fehler und kein /jk/-Pfad', () => {
  const html = renderToStaticMarkup(<HeroLab org={noHeroOrg} camps={[camp]} variant={3} />)
  expect(html).not.toContain('/jk/')
})

it('V3 JK-Verein (hero /jk/hero.jpg): Mosaik enthält /jk/team.jpg', () => {
  const html = renderToStaticMarkup(<HeroLab org={jkOrg} camps={[camp]} variant={3} />)
  expect(html).toContain('/jk/team.jpg')
})
