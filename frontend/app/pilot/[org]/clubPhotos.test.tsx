// @vitest-environment jsdom
import { existsSync } from 'fs'
import { join } from 'path'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import AboutSlideshow from './AboutSlideshow'
import { getClubAssets } from './clubAssets'
import ParentFlow from './ParentFlow'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({
  useParentFlowMotion: () => {},
  _isMotionEnabled: () => true,
}))

const base: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#C79B3B', theme: 'akademie', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
}

const camp: CampPublic = {
  slug: 'camp-a', title: 'Wintercamp', start_date: '2027-01-11', end_date: '2027-01-12',
  registration_start: null, registration_end: null,
  age_min: 6, age_max: 14, capacity: 30, price_cents: 14900, currency: 'EUR',
  registration_open: true, location: 'Kassel', care_info: null, meals_info: null, includes: null,
  registered_count: 0, waitlist_count: 0, spots_remaining: 30, is_full: false,
}

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

it('every JK asset path points to an existing file in public/', () => {
  const assets = getClubAssets('jk-performance-academy')!
  const paths = [
    assets.heroImage,
    ...assets.galleryImages,
    ...assets.campGallery!.images.map(image => image.src),
    assets.team!.photo!.src,
    ...assets.team!.members.flatMap(member => member.imageSrc ? [member.imageSrc] : []),
    ...assets.sponsor!.entries.flatMap(entry => entry.imageSrc ? [entry.imageSrc] : []),
  ]
  for (const path of paths) expect(existsSync(join(process.cwd(), 'public', path)), path).toBe(true)
})

it('JK page shows the slideshow in "Über uns", camp photos, the trainer team and the partner', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'jk-performance-academy' }} camps={[camp]} />)
  const about = html.slice(html.indexOf('id="s-ueber-uns"'))
  expect(about).toContain('about-slides')
  expect(about).not.toContain('about-media')
  expect((about.match(/class="about-slide( is-active)?"/g) ?? [])).toHaveLength(5)

  const camps = html.slice(html.indexOf('id="s-camps"'), html.indexOf('id="s-ueber-uns"'))
  expect(camps).toContain('Eindrücke aus unseren Camps')
  expect((camps.match(/camp-gallery-item /g) ?? [])).toHaveLength(4)

  expect(html).toContain('id="team-heading"')
  for (const name of ['Jan Baruschka', 'Christian Andrecht', 'Danny Breitfelder', 'Jil Krug', 'Serkan Durna']) expect(html).toContain(name)
  expect(html).toContain('Gast-Profi und IT-Koordinator')
  // A member without a photo gets initials instead of a broken image.
  expect(html).toContain('<span class="team-initials" aria-hidden="true">SD</span>')

  expect(html).toContain('Sporthaus Kassel')
  expect(html).toContain('sponsor-photo')
})

it('clubs without these assets render none of the new blocks', () => {
  for (const slug of ['ksv-baunatal', 'unknown-verein']) {
    const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug, theme: 'tradition' }} camps={[camp]} />)
    for (const marker of ['about-slides', 'camp-gallery', 'team-sec', 'sponsor-photo']) expect(html, `${slug}: ${marker}`).not.toContain(marker)
  }
})

it('without an "Über uns" text the slideshow is not rendered', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'jk-performance-academy', intro_text: null }} camps={[camp]} />)
  expect(html).not.toContain('about-slides')
})

it('slideshow: arrows and dots switch the visible image and wrap around', () => {
  const images = [{ src: '/a.jpg', alt: 'A' }, { src: '/b.jpg', alt: 'B' }, { src: '/c.jpg', alt: 'C' }]
  const host = document.body.appendChild(document.createElement('div'))
  const root = createRoot(host)
  act(() => root.render(<AboutSlideshow images={images} />))
  const active = () => [...host.querySelectorAll('.about-slide')].findIndex(el => el.classList.contains('is-active'))
  const click = (selector: string) => act(() => { (host.querySelector(selector) as HTMLButtonElement).click() })

  expect(active()).toBe(0)
  click('button[aria-label="Nächstes Bild"]')
  expect(active()).toBe(1)
  click('button[aria-label="Vorheriges Bild"]')
  click('button[aria-label="Vorheriges Bild"]')
  expect(active()).toBe(2)
  click('button[aria-label="Bild 1 von 3"]')
  expect(active()).toBe(0)
  // Only the visible slide exposes its alt text.
  expect([...host.querySelectorAll('img')].map(img => img.getAttribute('alt'))).toEqual(['A', '', ''])
  act(() => root.unmount())
})

it('slideshow: advances on its own, but not with reduced motion', () => {
  const images = [{ src: '/a.jpg', alt: 'A' }, { src: '/b.jpg', alt: 'B' }]
  const run = (reduced: boolean) => {
    vi.useFakeTimers()
    window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    act(() => root.render(<AboutSlideshow images={images} />))
    act(() => { vi.advanceTimersByTime(5100) })
    const index = [...host.querySelectorAll('.about-slide')].findIndex(el => el.classList.contains('is-active'))
    act(() => root.unmount())
    vi.useRealTimers()
    return index
  }
  expect(run(false)).toBe(1)
  expect(run(true)).toBe(0)
})

it('camp detail: the price bar stays short so the register button fits on a phone', () => {
  const memberCamp = { ...camp, slug: 'camp-m', price_member_cents: 12900 }
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'jk-performance-academy' }} camps={[memberCamp]} initialCampSlug="camp-m" />)
  const dock = html.slice(html.indexOf('class="dock"'))
  expect(dock).toContain('129,00')
  expect(dock).toContain('Mitglieder 129,00 € · sonst 149,00 €')
  expect(dock).not.toContain('geprüft bei der Anmeldung')
  expect(dock).toContain('Jetzt anmelden')
})

it('"Über uns": several blank lines in the stored text collapse to one paragraph gap', () => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'demo', intro_text: 'Eins.\n\n\n\nZwei.\n \n\t\n\nDrei.' }} camps={[camp]} />)
  expect(html).toContain('Eins.\n\nZwei.\n\nDrei.')
})

it('JK hero: wide photo plus a separate image for narrow screens; other clubs have one image', () => {
  const jk = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'jk-performance-academy', hero_image_url: '/jk/hero.jpg' }} camps={[camp]} />)
  expect(jk).toContain('hero-image-wide')
  expect(jk).toContain('hero-image-narrow')
  expect(jk).toContain('/jk/hero-mobile.jpg')
  expect(existsSync(join(process.cwd(), 'public', 'jk', 'hero-mobile.jpg'))).toBe(true)
  const other = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'demo', hero_image_url: '/x.jpg' }} camps={[camp]} />)
  expect(other).not.toContain('hero-image-narrow')
  expect(other).not.toContain('hero-image-wide')
})
