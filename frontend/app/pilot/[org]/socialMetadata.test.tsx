import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'

vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('../../lib/saasApi', () => ({ fetchOrganization: vi.fn(), fetchCamps: vi.fn() }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./ParentFlow', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({ publicFontClassName: () => '' }))

import { headers } from 'next/headers'
import { fetchOrganization } from '../../lib/saasApi'
import { generateMetadata } from './page'

const org: OrganizationPublic = {
  slug: 'testverein', name: 'Testverein', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'verein@example.com', contact_phone: null,
  logo_url: null, primary_color: '#123456', theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: '/verein/hero.jpg',
  trainer_image_url: null, trainer_text: null, terms_text: null,
}

const metadata = () => generateMetadata({ params: Promise.resolve({ org: org.slug }) })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example')
  vi.mocked(fetchOrganization).mockReset().mockResolvedValue(org)
  vi.mocked(headers).mockReset().mockResolvedValue(new Headers({ host: 'verein.example' }) as Awaited<ReturnType<typeof headers>>)
})
afterEach(() => vi.unstubAllEnvs())

describe('Öffentliche Vereinsmetadaten', () => {
  it('kürzt langen Introtext an der Wortgrenze und ergänzt eine Ellipse', async () => {
    const completeWords = 'Fußball macht Spaß. '.repeat(7).trimEnd()
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, intro_text: `${completeWords} Nachwuchstrainingslager mit viel Bewegung` })
    const result = await metadata()
    expect(result.description).toBe(`${completeWords}…`)
    expect(result.description!.length).toBeLessThanOrEqual(160)
    expect(result.description).toMatch(/…$/)
  })

  it.each([null, '', '   '])('verwendet den Ersatztext bei fehlendem Intro (%s)', async intro_text => {
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, intro_text })
    expect((await metadata()).description).toBe('Anmeldung zu den Fußballcamps von Testverein')
  })

  it('übernimmt kurzen Introtext ohne Ellipse', async () => {
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, intro_text: 'Entdecken Sie unsere Fußballcamps.' })
    expect((await metadata()).description).toBe('Entdecken Sie unsere Fußballcamps.')
  })

  it('behält ein vollständiges Wort genau an der Zeichengrenze', async () => {
    const intro = `${'Camp '.repeat(30)}Final`
    expect(intro.length).toBe(155)
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, intro_text: intro })
    expect((await metadata()).description).toBe(intro)
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, intro_text: `${intro} und mehr` })
    expect((await metadata()).description).toBe(`${intro}…`)
  })

  it('setzt Titel, Open Graph und Twitter einschließlich absolutem Hero-Bild', async () => {
    expect(await metadata()).toMatchObject({
      title: 'Camps 2027 – Testverein',
      openGraph: { title: 'Camps 2027 – Testverein', description: 'Anmeldung zu den Fußballcamps von Testverein', type: 'website', locale: 'de_DE', siteName: 'CampsPilot', images: [{ url: 'https://camps.example/verein/hero.jpg' }] },
      twitter: { card: 'summary_large_image', title: 'Camps 2027 – Testverein', images: [{ url: 'https://camps.example/verein/hero.jpg' }] },
    })
    expect(headers).not.toHaveBeenCalled()
  })

  it('behält absolute externe Hero-URLs und bevorzugt sie vor statischen Bildern', async () => {
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, slug: 'ksv-baunatal', hero_image_url: 'https://bilder.example/hero.jpg' })
    expect((await metadata()).openGraph).toMatchObject({ images: [{ url: 'https://bilder.example/hero.jpg' }] })
  })

  it('verwendet das statische Club-Hero als absolute URL', async () => {
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, slug: 'ksv-baunatal', hero_image_url: null })
    expect((await metadata()).openGraph).toMatchObject({ images: [{ url: 'https://camps.example/clubs/ksv/ksv-1-mannschaft.jpg' }] })
  })

  it('verlinkt ohne Hero das dynamische Vereinsbild', async () => {
    vi.mocked(fetchOrganization).mockResolvedValue({ ...org, hero_image_url: null })
    expect((await metadata()).openGraph).toMatchObject({ images: [{ url: 'https://camps.example/pilot/testverein/opengraph-image', width: 1200, height: 630 }] })
  })

  it('verwendet ohne konfigurierte Site-URL den Request-Host', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect((await metadata()).openGraph).toMatchObject({ images: [{ url: 'https://verein.example/verein/hero.jpg' }] })
  })

  it('berücksichtigt den öffentlichen Host und das Protokoll hinter einem Proxy', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    vi.mocked(headers).mockResolvedValue(new Headers({ host: 'internal:3000', 'x-forwarded-host': 'public.example', 'x-forwarded-proto': 'https' }) as Awaited<ReturnType<typeof headers>>)
    expect((await metadata()).openGraph).toMatchObject({ images: [{ url: 'https://public.example/verein/hero.jpg' }] })
  })

  it('liefert bei einem unbekannten Verein einen neutralen Titel ohne Fehler', async () => {
    vi.mocked(fetchOrganization).mockResolvedValue(null)
    await expect(metadata()).resolves.toMatchObject({ title: 'CampsPilot' })
    expect(headers).not.toHaveBeenCalled()
  })

  it('liefert auch bei einem API-Fehler neutrale Metadaten', async () => {
    vi.mocked(fetchOrganization).mockRejectedValue(new Error('API unavailable'))
    await expect(metadata()).resolves.toMatchObject({ title: 'CampsPilot' })
  })
})
