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
  for (const name of ['Jan Baruschka', 'Christian Andrecht', 'Danny Breitfelder', 'Jil Krug']) expect(html).toContain(name)
  // Members without a photo stay hidden until a photo exists.
  expect(html).not.toContain('Serkan Durna')
  expect(html).not.toContain('team-initials')

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

it('JK hero: one photo for every screen, shown as a banner above the text on phones', () => {
  const jk = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'jk-performance-academy', hero_image_url: '/jk/hero.jpg' }} camps={[camp]} />)
  expect(jk).toContain('hero h-akad hero-photo hero-banner')
  expect((jk.match(/class="hero-image"/g) ?? [])).toHaveLength(1)
  expect(existsSync(join(process.cwd(), 'public', 'jk', 'hero-mobile.jpg'))).toBe(false)
  const other = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'demo', hero_image_url: '/x.jpg' }} camps={[camp]} />)
  expect(other).not.toContain('hero-banner')
})

it('JK: founder leads the team section, no separate trainer block; partner comes after the team with its own label', () => {
  const org = { ...base, slug: 'jk-performance-academy', contact_person_name: 'Jan-Maximilian Krug', trainer_image_url: '/jk/training.jpg', trainer_text: 'Gründer der JK Performance Academy.' }
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={[camp]} />)
  expect(html).not.toContain('class="trainer-sec"')
  const team = html.slice(html.indexOf('id="team-heading"'))
  expect(team).toContain('team-lead')
  expect(team.indexOf('Jan-Maximilian Krug')).toBeLessThan(team.indexOf('Jan Baruschka'))
  expect(html.indexOf('id="s-ueber-uns"')).toBeLessThan(html.indexOf('id="team-heading"'))
  expect(html.indexOf('id="team-heading"')).toBeLessThan(html.indexOf('id="sponsor-heading"'))
  expect(html).not.toContain('Sponsor / Anzeige')
  expect(html).toContain('sponsor-entry-wide')
})

it('clubs without a team keep the single trainer block and the sponsor block after the trainings', () => {
  const org = { ...base, slug: 'ksv-baunatal', theme: 'tradition' as const, contact_person_name: 'Trainer', trainer_image_url: '/t.jpg', trainer_text: 'Text.' }
  const html = renderToStaticMarkup(<ParentFlow org={org} camps={[camp]} />)
  expect(html).toContain('class="trainer-sec"')
  expect(html).toContain('Sponsor / Anzeige')
  expect(html.indexOf('id="sponsor-heading"')).toBeLessThan(html.indexOf('id="s-ueber-uns"'))
})

it('training cards show the offer price and "Termine folgen" while no session is planned', () => {
  const offer = { slug: 'athletik', title: 'Athletik', kind: 'gruppe', description: '', duration_minutes: 60, location: 'Platz', price_member_cents: 3900, price_nonmember_cents: 4900, category: 'athletik', from_price_member_cents: null, from_price_nonmember_cents: null }
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'demo' }} camps={[camp]} trainings={[offer] as never} />)
  expect(html).toContain('Termine folgen')
  expect(html).toContain('ab 39')
  const planned = renderToStaticMarkup(<ParentFlow org={{ ...base, slug: 'demo' }} camps={[camp]} trainings={[{ ...offer, from_price_member_cents: 3900, from_price_nonmember_cents: 4900 }] as never} />)
  expect(planned).not.toContain('Termine folgen')
})
