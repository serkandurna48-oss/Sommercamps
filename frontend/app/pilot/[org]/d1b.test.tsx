// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
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
  expect(assets!.heroImage).toBe('/clubs/ksv/ksv-gruppenfoto.jpg')
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

it('gallery-band shown for ksv-baunatal, hero not duplicated in gallery', () => {
  // Use ksv-kinder-pokal as hero_image_url — it also sits in clubAssets.galleryImages.
  // The gallery filter must remove it so it only appears in h-trad-shot, not gallery-band.
  const ksvOrg: OrganizationPublic = {
    ...org, slug: 'ksv-baunatal',
    hero_image_url: '/clubs/ksv/ksv-kinder-pokal.jpg',
    intro_text: 'Wir sind KSV.',
  }
  const html = renderToStaticMarkup(<ParentFlow org={ksvOrg} camps={[]} />)
  expect(html).toContain('gallery-band')
  // remaining gallery images (not the hero) are shown
  expect(html).toContain('ksv-torwart.jpg')
  expect(html).toContain('ksv-pokale.jpg')
  // ksv-kinder-pokal is the hero — must not also appear inside gallery-band
  const galleryStart = html.indexOf('gallery-band')
  const afterGalleryBand = galleryStart >= 0 ? html.slice(galleryStart) : ''
  const gallerySection = afterGalleryBand.slice(0, afterGalleryBand.indexOf('how-sec'))
  expect(gallerySection).not.toContain('ksv-kinder-pokal')
})

// ── SSR: no inline opacity:0 ──

it('SSR output does not contain inline opacity:0 (GSAP must not run in SSR)', () => {
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={[]} />)
  // opacity:0.55 (on svg) is fine — the regex ensures a bare 0 (not 0.xx)
  expect(html).not.toMatch(/opacity\s*:\s*0(?![0-9.])/)
})
