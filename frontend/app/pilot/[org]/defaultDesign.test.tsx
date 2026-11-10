// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'
import { effectiveTheme } from './defaultDesign'
import PublicClubView from './PublicClubView'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {}, _isMotionEnabled: () => true }))

vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({ publicFontClassName: () => '' }))

const org = (slug: string, theme: OrganizationPublic['theme']): OrganizationPublic => ({
  slug, name: 'SV Beispiel', legal_name: null, legal_address: null, contact_person_name: null,
  contact_email: 'a@example.com', contact_phone: null, logo_url: null, primary_color: '#1F6FB5', theme, iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null, trainer_image_url: null, trainer_text: null, terms_text: null,
})

it('Standard-Theme tradition wird fuer Vereine ohne eigene Gestaltung wie JK (akademie) dargestellt', () => {
  expect(effectiveTheme(org('sv-abnahme-staging', 'tradition'))).toBe('akademie')
  expect(effectiveTheme(org('x', 'kompakt'))).toBe('kompakt')
  expect(effectiveTheme(org('jk-performance-academy', 'akademie'))).toBe('akademie')
})

it('KSV behaelt seine eigene Gestaltung', () => {
  expect(effectiveTheme(org('ksv-baunatal', 'tradition'))).toBe('tradition')
})

it('Standardseite: akademie-Layout, Vereinsfarbe, kein JK-Bild, kein JK-Text', () => {
  const html = renderToStaticMarkup(<PublicClubView org={org('sv-abnahme-staging', 'tradition')} allCamps={[]} camps={[]} trainings={[]} hadPastCamps={false} demo />)
  expect(html).toContain('data-theme="akademie"')
  expect(html).toContain('h-akad')
  expect(html).not.toContain('hero-photo')
  expect(html).not.toContain('/jk/')
  expect(html).toContain('--brand')
})
