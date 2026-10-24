// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'
import * as assets from './clubAssets'
import ParentFlow from './ParentFlow'
import { _isMotionEnabled } from './motion'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const org: OrganizationPublic = {
  slug: 'neutral', name: 'Testverein', theme: 'akademie', primary_color: '#cc0000',
  legal_name: null, legal_address: null, contact_person_name: null,
  contact_email: 'team@example.com', contact_phone: null, logo_url: null, iban: null,
  intro_heading: 'Gemeinsam Fußball spielen', intro_text: 'Camps für alle Kinder.',
  hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
}
const css = readFileSync(join(__dirname, 'publicTheme.css'), 'utf8')

function renderHero(overrides: Partial<OrganizationPublic> = {}) {
  const container = document.createElement('div')
  container.innerHTML = renderToStaticMarkup(<ParentFlow org={{ ...org, ...overrides }} camps={[]} />)
  return container.querySelector<HTMLElement>('.hero')!
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(['tradition', 'akademie', 'kompakt'] as const)('%s photo hero', (theme) => {
  it.each(['provided', 'club fallback'] as const)('%s image protects the complete copy with a scrim', (source) => {
    const hero = renderHero({ theme, ...(source === 'provided'
      ? { hero_image_url: '/photo.jpg' }
      : { slug: 'ksv-baunatal' }) })
    expect(hero.querySelector('.hero-image')).not.toBeNull()
    const scrim = hero.querySelector('.hero-scrim')
    expect(scrim, 'The hero photo must have a scrim behind its copy').not.toBeNull()
    expect(scrim!.querySelector('h1')?.textContent).toBe(org.intro_heading)
    expect(scrim!.querySelector('.intro')?.textContent).toBe(org.intro_text)
    expect(hero.classList.contains('hero-photo')).toBe(true)
    expect(hero.querySelector('.veil')).toBeNull()
  })

  it.each([null, '   '])('has no image or scrim for an unconfigured club (%s)', (hero_image_url) => {
    const hero = renderHero({ theme, hero_image_url })
    expect(hero.querySelector('.hero-image')).toBeNull()
    expect(hero.querySelector('.hero-scrim')).toBeNull()
    expect(hero.classList.contains('hero-photo')).toBe(false)
    expect(hero.textContent).not.toContain('KSV')
  })

  it('sets independent KSV positions without an inline object-position override', () => {
    const image = renderHero({ theme, slug: 'ksv-baunatal' }).querySelector<HTMLElement>('.hero-image')!
    expect(image.style.getPropertyValue('--hero-position')).toBe('center 30%')
    expect(image.style.getPropertyValue('--hero-position-mobile')).toBe('center 15%')
    expect(image.style.objectPosition).toBe('')
  })

  it('falls back to the configured desktop position when the mobile position is missing', () => {
    vi.spyOn(assets, 'getClubAssets').mockReturnValue({ heroImage: '/photo.jpg', heroPosition: 'right 40%', galleryImages: [] })
    const image = renderHero({ theme }).querySelector<HTMLElement>('.hero-image')!
    expect(image.style.getPropertyValue('--hero-position-mobile')).toBe('right 40%')
    expect(image.style.getPropertyValue('--hero-position')).toBe('right 40%')
  })

  it('uses the shared default position when neither club position is configured', () => {
    const image = renderHero({ theme, hero_image_url: '/photo.jpg' }).querySelector<HTMLElement>('.hero-image')!
    expect(image.style.getPropertyValue('--hero-position-mobile')).toBe('center 20%')
    expect(image.style.getPropertyValue('--hero-position')).toBe('center 20%')
  })

  it('keeps photo protection and its position when reduced motion is requested', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    expect(_isMotionEnabled()).toBe(false)
    const hero = renderHero({ theme, slug: 'ksv-baunatal' })
    expect(hero.querySelector('.hero-scrim')).not.toBeNull()
    expect(hero.querySelector<HTMLElement>('.hero-image')!.style.getPropertyValue('--hero-position-mobile')).toBe('center 15%')
    expect(hero.innerHTML).not.toMatch(/style="[^"]*opacity:\s*0(?:;|")/)
  })
})

it('switches object-position only below 768px using the CSS variables', () => {
  expect(css).toMatch(/\.hero \.hero-image\s*\{[^}]*object-position: var\(--hero-position\)/)
  expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.cp-public \.hero \.hero-image\s*\{\s*object-position: var\(--hero-position-mobile, var\(--hero-position\)\)/)
  // A more specific legacy image rule must not override either responsive value.
  for (const selector of ['.cp-public .h-akad .bg img', '.cp-public .h-trad-shot img']) {
    const rule = css.slice(css.indexOf(`${selector} {`)).split('}')[0]
    expect(rule).not.toContain('object-position:')
  }
})

it('keeps a static scrim under the whole copy, with the fade outside the text bounds', () => {
  const rule = css.match(/\.cp-public \.hero-scrim::before\s*\{([^}]+)\}/)![1]
  expect(rule).toContain('pointer-events: none')
  expect(rule).toContain('z-index: -1')
  expect(rule).toContain('calc(-1 * var(--hero-scrim-rise))')
  expect(rule).toContain('var(--hero-scrim-opacity)) var(--hero-scrim-rise)')
  expect(rule).toContain('mask-image: linear-gradient(to right')
  expect(rule).not.toMatch(/animation|transition/)
})

it('exceeds 4.5:1 for body and label text even over a white photo', () => {
  const opacity = Number(css.match(/--hero-scrim-opacity:\s*([.\d]+)/)![1])
  const textAlpha = Number(css.match(/--hero-photo-muted:\s*rgb\(255 255 255 \/ ([.\d]+)\)/)![1])
  expect(css).toContain('--hero-scrim-rgb: 0 0 0')
  const background = 1 - opacity
  const foreground = textAlpha + background * (1 - textAlpha)
  const luminance = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4
  expect((luminance(foreground) + .05) / (luminance(background) + .05)).toBeGreaterThanOrEqual(4.5)
})

it('keeps the sibling statistics above the scrim extending below the copy', () => {
  const rule = css.match(/\.hero-photo :is\(\.hero-stats, \.h-trad-stats, \.h-komp-stats\)\s*\{([^}]+)\}/)![1]
  expect(rule).toContain('position: relative')
  expect(rule).toContain('z-index: 1')
})
