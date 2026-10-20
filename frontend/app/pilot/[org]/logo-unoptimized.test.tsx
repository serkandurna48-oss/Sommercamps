/**
 * B5 — Externe und lokale Logo-URLs bleiben ungekürzt im img-src.
 * Mit unoptimized rendert next/image die Originalquelle direkt — kein /_next/image-Rewrite.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({
  publicFontClassName: () => '',
  fraunces: { variable: '--font-cp-public-display' },
  archivoTradition: { variable: '--font-cp-public-ui' },
  archivoAkademie: { variable: '--font-cp-public-akademie' },
  spaceGrotesk: { variable: '--font-cp-public-kompakt' },
}))
vi.mock('./login/actions', () => ({ loginAction: vi.fn() }))
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: <S,>(_action: unknown, initial: S) => [initial, vi.fn(), false] as [S, () => void, boolean],
  }
})

import ParentFlow from './ParentFlow'
import PublicFooter from './PublicFooter'
import LegalShell from './LegalShell'
import LoginForm from './login/LoginForm'

const base: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
}

const EXT = 'https://cdn.campspilot.example/logo.png'
const LOCAL = '/jk/logo.jpg'

it.each([EXT, LOCAL])('ParentFlow tradition: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, theme: 'tradition', logo_url: url }} camps={[]} />)
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})

it.each([EXT, LOCAL])('ParentFlow akademie: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, theme: 'akademie', logo_url: url }} camps={[]} />)
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})

it.each([EXT, LOCAL])('ParentFlow kompakt: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(<ParentFlow org={{ ...base, theme: 'kompakt', logo_url: url }} camps={[]} />)
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})

it.each([EXT, LOCAL])('PublicFooter: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(<PublicFooter org={{ ...base, logo_url: url }} />)
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})

it.each([EXT, LOCAL])('LegalShell: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(
    <LegalShell org={{ ...base, logo_url: url }}>
      <p>Inhalt</p>
    </LegalShell>
  )
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})

it.each([EXT, LOCAL])('LoginForm: Logo-src ist %s (kein /_next/image)', (url) => {
  const html = renderToStaticMarkup(
    <LoginForm orgSlug="demo" orgName="Demo FC" orgLogoUrl={url} />
  )
  expect(html).toContain(url)
  expect(html).not.toContain('/_next/image')
})
