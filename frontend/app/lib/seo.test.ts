import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalUrl, getSiteUrl, pageMetadata, shortDescription } from './seo'
import robots from '../robots'

// Expected paths intentionally live in the test, independent of the implementation.
afterEach(() => vi.unstubAllEnvs())

describe('Canonical-URLs', () => {
  it.each(['', '   '])('verwendet bei leerer Site-URL den festen Fallback (%j)', value => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', value)
    expect(getSiteUrl().href).toBe('https://campspilot.de/')
    expect(canonicalUrl('/campspilot')).toBe('https://campspilot.de/campspilot')
  })

  it.each(['https://camps.example', 'https://camps.example/'])('baut absolute URLs ohne doppelte Schrägstriche (%s)', base => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', base)
    expect(canonicalUrl('/campspilot/datenschutz')).toBe('https://camps.example/campspilot/datenschutz')
    expect(canonicalUrl('campspilot')).toBe('https://camps.example/campspilot')
    expect(canonicalUrl('/pilot/verein?camp=sommer%202027#anmeldung')).toBe('https://camps.example/pilot/verein?camp=sommer%202027')
  })
})

describe('Beschreibung mit höchstens 155 Zeichen', () => {
  it('normalisiert Leerraum und lässt kurze Texte vollständig', () => {
    expect(shortDescription('  Fußballcamps\n für   Kinder.  ')).toBe('Fußballcamps für Kinder.')
    expect(shortDescription('')).toBe('')
  })

  it('behält genau 155 Zeichen ohne Ellipse', () => {
    const text = `${'Camp '.repeat(30)}Final`
    expect(text).toHaveLength(155)
    expect(shortDescription(text)).toBe(text)
  })

  it('reserviert die Ellipse innerhalb des Limits und schneidet nur ganze Wörter ab', () => {
    const text = `${'Camp '.repeat(30)}Final und mehr`
    expect(shortDescription(text)).toBe(`${'Camp '.repeat(30).trimEnd()}…`)
    expect(shortDescription(text).length).toBeLessThanOrEqual(155)
  })

  it('behält ein ganzes Wort bis Position 154 und ergänzt die Ellipse', () => {
    const text = `${'Camp '.repeat(30)}Ball und mehr`
    expect(shortDescription(text)).toBe(`${'Camp '.repeat(30)}Ball…`)
    expect(shortDescription(text)).toHaveLength(155)
  })

  it('zerteilt auch ein überlanges Einzelwort nicht', () => {
    expect(shortDescription('A'.repeat(180))).toBe('…')
  })

  it('verwendet denselben gekürzten Text in HTML, Open Graph und Twitter', () => {
    const metadata = pageMetadata('/campspilot', 'Fußballcamps', 'Camp '.repeat(50), '/bild.png')
    expect(metadata.description!.length).toBeLessThanOrEqual(155)
    expect(metadata.openGraph).toMatchObject({ description: metadata.description, locale: 'de_DE', type: 'website' })
    expect(metadata.twitter).toMatchObject({ description: metadata.description })
  })
})

describe('Robots', () => {
  it.each(['/pilot/', '/platform/', '/api/'])('sperrt %s ausdrücklich', path => {
    expect(robots().rules).toMatchObject({ userAgent: '*', disallow: expect.arrayContaining([path]) })
  })

  it('verweist auf die Sitemap der konfigurierten Domain', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example/')
    expect(robots().sitemap).toBe('https://camps.example/sitemap.xml')
  })
})
