/**
 * K3 – Inhaltsprüfungen für Teilnahmebedingungen- und Datenschutz-Seiten.
 * Renderiert die async Server-Komponenten direkt (ohne Next.js-Runtime).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({
  publicFontClassName: () => '',
  fraunces: { variable: '--font-cp-public-display' },
  archivoTradition: { variable: '--font-cp-public-ui' },
  archivoAkademie: { variable: '--font-cp-public-akademie' },
  spaceGrotesk: { variable: '--font-cp-public-kompakt' },
}))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: <S,>(_action: unknown, initial: S) => [initial, vi.fn(), false] as [S, () => void, boolean],
  }
})
vi.mock('../../lib/saasApi', () => ({
  fetchOrganization: vi.fn(),
}))

import { fetchOrganization } from '../../lib/saasApi'
import type { OrganizationPublic } from '../../lib/saasApi'

const DEFAULT_ORG: OrganizationPublic = {
  slug: 'test',
  name: 'Test FC',
  legal_name: null,
  legal_address: null,
  contact_person_name: null,
  contact_email: 'test@example.com',
  contact_phone: null,
  logo_url: null,
  primary_color: null,
  theme: 'tradition',
  iban: null,
  intro_heading: null,
  intro_text: null,
  hero_image_url: null,
  trainer_image_url: null,
  trainer_text: null,
  terms_text: null,
}

import { beforeEach } from 'vitest'
beforeEach(() => {
  vi.mocked(fetchOrganization).mockResolvedValue(DEFAULT_ORG)
})
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
}))

import TeilnahmebedingungenPage from './teilnahmebedingungen/page'
import DatenschutzPage from './datenschutz/page'

const params = Promise.resolve({ org: 'test' })

it('Teilnahmebedingungen: keine feste Gebühr (20) und keine feste Frist (vier/4 Wochen)', async () => {
  const el = await TeilnahmebedingungenPage({ params })
  const html = renderToStaticMarkup(el)
  expect(html).not.toContain('20')
  expect(html).not.toContain('vier Wochen')
  expect(html).not.toContain('4 Wochen')
})

it('Teilnahmebedingungen: keine Haftungs-, Erstattungs- oder Gesundheitsregeln auf der Plattformseite', async () => {
  const el = await TeilnahmebedingungenPage({ params })
  const html = renderToStaticMarkup(el)
  // "haftet" (Verb) zeigt eine eigene Haftungsregel an; "Haftungsbedingungen" (Verweis) ist erlaubt
  expect(html).not.toMatch(/haftet/i)
  expect(html).not.toMatch(/erstattet|Erstattung/i)
  expect(html).not.toMatch(/Gesundheit/i)
})

it('Datenschutz: Brevo als Dienstleister genannt, keine Kinderdaten übermittelt', async () => {
  const el = await DatenschutzPage({ params })
  const html = renderToStaticMarkup(el)
  expect(html).toContain('Brevo')
  expect(html).not.toContain('Vorname und Nachname des Kindes')
})

it('Teilnahmebedingungen: mit terms_text zeigt Abschnitt mit zwei Absätzen', async () => {
  vi.mocked(fetchOrganization).mockResolvedValueOnce({
    ...DEFAULT_ORG,
    terms_text: 'Erster Absatz.\n\nZweiter Absatz.',
  })
  const el = await TeilnahmebedingungenPage({ params })
  const html = renderToStaticMarkup(el)
  expect(html).toContain('tb-4')
  expect(html).toContain('Bedingungen von Test FC')
  expect(html).toContain('Erster Absatz.')
  expect(html).toContain('Zweiter Absatz.')
  // Verweis-Platzhalter darf nicht erscheinen
  expect(html).not.toContain('Es gelten die Teilnahme-')
})

it('Teilnahmebedingungen: terms_text mit spitzen Klammern wird escaped', async () => {
  vi.mocked(fetchOrganization).mockResolvedValueOnce({
    ...DEFAULT_ORG,
    terms_text: '<script>alert(1)</script>',
  })
  const el = await TeilnahmebedingungenPage({ params })
  const html = renderToStaticMarkup(el)
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;')
})

it('Teilnahmebedingungen: ohne terms_text zeigt Verweis auf Anbieterbedingungen', async () => {
  const el = await TeilnahmebedingungenPage({ params })
  const html = renderToStaticMarkup(el)
  expect(html).toContain('Es gelten die Teilnahme-')
  expect(html).not.toContain('tb-4')
})
