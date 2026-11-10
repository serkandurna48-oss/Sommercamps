// @vitest-environment jsdom
import { readFileSync } from 'fs'
import { join } from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import { readableTextOn } from '../../lib/readableTextOn'
import { filterFutureCamps, getTodayBerlin, truncateIntroForHero } from './campUtils'
import { getClubAssets } from './clubAssets'
import CampRow from './CampRow'
import ParentFlow from './ParentFlow'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({
  useParentFlowMotion: () => {},
  _isMotionEnabled: () => true,
}))

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: 'https://images.example.com/demo.jpg',
  trainer_image_url: null, trainer_text: null, terms_text: null,
}

const mockCamp: CampPublic = {
  slug: 'camp-a', title: 'Sommercamp A', start_date: '2027-07-07', end_date: '2027-07-11',
  registration_start: null, registration_end: null,
  age_min: 8, age_max: 14, capacity: 30, price_cents: 19900, currency: 'EUR',
  registration_open: true, location: 'Kassel', care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
}

// ── clubAssets ──

it('getClubAssets returns hero and gallery for ksv-baunatal', () => {
  const assets = getClubAssets('ksv-baunatal')
  expect(assets).not.toBeNull()
  expect(assets!.heroImage).toBe('/clubs/ksv/ksv-1-mannschaft.jpg')
  expect(assets!.galleryImages).toHaveLength(3)
  expect(assets!.galleryImages).not.toContain(assets!.heroImage)
})

it('getClubAssets returns null for unknown slug', () => {
  expect(getClubAssets('unknown-verein')).toBeNull()
})

// ── truncateIntroForHero ──

it('truncateIntroForHero returns text unchanged when ≤ 140 chars', () => {
  const short = 'Kurzer Text.'
  expect(truncateIntroForHero(short)).toBe(short)
})

it('truncateIntroForHero cuts at sentence boundary', () => {
  // Total length > 140; first sentence "Erster Satz." is 12 chars (fits)
  const padding = ' Sehr langer zweiter Satz, der das Limit von hundertundvierzig Zeichen eindeutig überschreitet und daher abgeschnitten werden muss.'
  const long = 'Erster Satz.' + padding
  expect(long.length).toBeGreaterThan(140)
  expect(truncateIntroForHero(long)).toBe('Erster Satz.')
})

it('truncateIntroForHero cuts at word boundary when no sentence fits within 140 chars', () => {
  // 35 words × 5 chars = 175 chars, no period → no sentence boundary
  const long = ('wort1 '.repeat(35)).trimEnd()
  const result = truncateIntroForHero(long)
  expect(result.endsWith('…')).toBe(true)
  expect(result.length).toBeLessThanOrEqual(141)
})

// ── filterFutureCamps — Mutations-Probe ──

it('filterFutureCamps: today\'s camp is still visible', () => {
  const today = getTodayBerlin()
  const camp = { ...mockCamp, end_date: today }
  expect(filterFutureCamps([camp])).toHaveLength(1)
})

it('filterFutureCamps: yesterday\'s camp is removed (mutation probe — change >= to > to fail this)', () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const yesterday = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const camp = { ...mockCamp, end_date: yesterday }
  expect(filterFutureCamps([camp])).toHaveLength(0)
})

// ── CampRow spots chip ──

it('CampRow shows spots chip when spots_remaining ≤ 10', () => {
  const camp = { ...mockCamp, spots_remaining: 8 }
  const html = renderToStaticMarkup(<CampRow camp={camp} onSelect={() => {}} />)
  expect(html).toContain('Noch 8 Plätze')
})

it('CampRow does not show spots chip when spots_remaining > 10', () => {
  const camp = { ...mockCamp, spots_remaining: 20 }
  const html = renderToStaticMarkup(<CampRow camp={camp} onSelect={() => {}} />)
  expect(html).not.toMatch(/Noch \d+ Plätze?/)
})

it('CampRow shows "Platz sichern" CTA for available camps', () => {
  const html = renderToStaticMarkup(<CampRow camp={mockCamp} onSelect={() => {}} />)
  expect(html).toContain('Platz sichern')
})

// ── Gallery band ──

it('gallery-band not shown for org without club assets (unknown slug)', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...org, slug: 'demo' }} camps={[]} />)
  expect(html).not.toContain('gallery-band')
})

it('with intro text the club images sit in "Über uns", hero not duplicated', () => {
  // ksv-kinder-pokal is the hero and also in clubAssets.galleryImages; it must be filtered out.
  const ksvOrg: OrganizationPublic = {
    ...org, slug: 'ksv-baunatal',
    hero_image_url: '/clubs/ksv/ksv-kinder-pokal.jpg',
    intro_text: 'Wir sind KSV.',
  }
  const html = renderToStaticMarkup(<ParentFlow org={ksvOrg} camps={[]} />)
  expect(html).not.toContain('gallery-band')
  const about = html.slice(html.indexOf('id="s-ueber-uns"'))
  const media = about.slice(about.indexOf('about-media'), about.indexOf('how-sec') >= 0 ? about.indexOf('how-sec') : undefined)
  expect(html).toContain('about-media-2')
  expect(media).toContain('ksv-torwart.jpg')
  expect(media).toContain('ksv-kinder-2027.jpg')
  expect(media).not.toContain('ksv-kinder-pokal')
})

it('without intro text the club images stay a gallery band', () => {
  const ksvOrg: OrganizationPublic = { ...org, slug: 'ksv-baunatal', hero_image_url: null, intro_text: null }
  const html = renderToStaticMarkup(<ParentFlow org={ksvOrg} camps={[]} />)
  expect(html).toContain('gallery-band')
  expect(html).not.toContain('about-media')
})

it('camp cards show "ab <member price>" only for camps with a lower member price', () => {
  const base = {
    slug: 'winter', title: 'Winter Camp', start_date: '2027-01-11', end_date: '2027-01-12',
    registration_start: null, registration_end: null, age_min: 6, age_max: 14, capacity: 30,
    price_cents: 16900, currency: 'EUR', registration_open: true, location: null, care_info: null,
    meals_info: null, includes: null, registered_count: 0, waitlist_count: 0, spots_remaining: 30, is_full: false,
  } as unknown as CampPublic
  const withMember = renderToStaticMarkup(<ParentFlow org={org} camps={[{ ...base, price_member_cents: 14900 }]} />)
  expect(withMember).toMatch(/c-price-from">ab<\/span>149,00/)
  const onePrice = renderToStaticMarkup(<ParentFlow org={org} camps={[base]} />)
  expect(onePrice).not.toContain('c-price-from')
  expect(onePrice).toContain('169,00')
})

// ── Hero objectPosition ──

it('clubAssets heroPosition is center 30% for ksv-baunatal', () => {
  const assets = getClubAssets('ksv-baunatal')
  expect(assets!.heroPosition).toBe('center 30%')
})

it('ParentFlow hero uses center 30% objectPosition for ksv-baunatal', () => {
  const ksvOrg: OrganizationPublic = {
    ...org, slug: 'ksv-baunatal', hero_image_url: null,
  }
  const html = renderToStaticMarkup(<ParentFlow org={ksvOrg} camps={[]} />)
  expect(html).toContain('center 30%')
})

it('ParentFlow hero falls back to center 20% when no clubAssets heroPosition', () => {
  const demoOrg: OrganizationPublic = { ...org, slug: 'demo' }
  const html = renderToStaticMarkup(<ParentFlow org={demoOrg} camps={[]} />)
  expect(html).toContain('center 20%')
})

// ── readableTextOn ──

it('readableTextOn: white text on KSV red (#CC0000)', () => {
  expect(readableTextOn('#CC0000')).toBe('#ffffff')
})

it('readableTextOn: dark text on JK gold (#B8912B)', () => {
  expect(readableTextOn('#B8912B')).toBe('#111111')
})

it('readableTextOn: dark text on white (#FFFFFF)', () => {
  expect(readableTextOn('#FFFFFF')).toBe('#111111')
})

// Mutationsprobe: readableTextOn immer Weiß zurückgeben ⇒ dieser Test muss rot werden
it('readableTextOn mutation probe: #B8912B must not return #ffffff', () => {
  expect(readableTextOn('#B8912B')).not.toBe('#ffffff')
})

// ── Checkbox 20px ──

it('consent checkbox is 20×20 px in publicTheme.css', () => {
  const css = readFileSync(join(__dirname, 'publicTheme.css'), 'utf-8')
  const match = css.match(/\.cp-public \.consent input\s*\{([^}]+)\}/)
  expect(match).not.toBeNull()
  const rule = match![1]
  expect(rule).toContain('width: 20px')
  expect(rule).toContain('height: 20px')
})

// ── SSR: no inline opacity:0 ──

it('SSR output does not contain inline opacity:0 (GSAP must not run in SSR)', () => {
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={[]} />)
  // opacity:0.55 (on svg) is fine — the regex ensures a bare 0 (not 0.xx)
  expect(html).not.toMatch(/opacity\s*:\s*0(?![0-9.])/)
})

it('getClubAssets returns the same JK gallery for prod and staging demo slug', () => {
  const prod = getClubAssets('jk-performance-academy')
  const demo = getClubAssets('jk-academy-demo')
  expect(prod).not.toBeNull()
  expect(demo).toEqual(prod)
  expect(prod!.galleryImages).toEqual(['/jk/slideshow/01.jpg'])
  expect(prod!.galleryImages).not.toContain(prod!.heroImage)
  for (const src of prod!.galleryImages) expect(prod!.galleryAltTexts[src]).toBeTruthy()
})

it('past camps sit collapsed under "Vergangene Camps", preview camps show "Vorschau" and the start of registration', () => {
  const base = {
    registration_end: null, age_min: 6, age_max: 14, capacity: 30, price_cents: 14900, currency: 'EUR',
    location: null, care_info: null, meals_info: null, includes: null, registered_count: 0, waitlist_count: 0,
    spots_remaining: 30, is_full: false,
  }
  const preview = { ...base, slug: 'ostern', title: 'Ostercamp', start_date: '2099-03-22', end_date: '2099-03-24',
    registration_start: '2099-01-15T08:00:00Z', registration_open: false } as unknown as CampPublic
  const past = { ...base, slug: 'sommer-alt', title: 'Sommercamp Alt', start_date: '2020-07-08', end_date: '2020-07-10',
    registration_start: null, registration_open: false } as unknown as CampPublic
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={[preview]} pastCamps={[past]} />)
  expect(html).toContain('Vorschau')
  expect(html).toContain('Anmeldung ab 15. Jan. 2099')
  const archive = html.slice(html.indexOf('past-camps'))
  expect(archive).toContain('Vergangene Camps (1)')
  expect(archive).toContain('Sommercamp Alt')
  expect(archive).toContain('Vorbei')
  expect(html.slice(0, html.indexOf('past-camps'))).not.toContain('Sommercamp Alt')
})
