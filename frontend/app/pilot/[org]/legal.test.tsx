/**
 * M7 — Rechtsseiten, Footer und Login
 * Prüft: Nav mit Vereinsname, Footer-Links, Login-Logo und -Button.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { OrganizationPublic } from '../../lib/saasApi'

// GrainOverlay uses canvas (client-only) — render as null in SSR tests
vi.mock('./GrainOverlay', () => ({ default: () => null }))

// next/font/google functions can't run in test environment
vi.mock('./publicFonts', () => ({
  publicFontClassName: () => '',
  fraunces: { variable: '--font-cp-public-display' },
  archivoTradition: { variable: '--font-cp-public-ui' },
  archivoAkademie: { variable: '--font-cp-public-akademie' },
  spaceGrotesk: { variable: '--font-cp-public-kompakt' },
}))

// next/navigation not needed in static render, but LegalShell imports Link which is fine
// LoginForm mocks
vi.mock('./login/actions', () => ({
  loginAction: vi.fn(),
}))

// useActionState: return initial state in SSR context
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: <S,>(_action: unknown, initial: S) => [initial, vi.fn(), false] as [S, () => void, boolean],
  }
})

import LegalShell from './LegalShell'
import LoginForm from './login/LoginForm'

const org: OrganizationPublic = {
  slug: 'demo',
  name: 'Demo FC',
  legal_name: null,
  legal_address: null,
  contact_person_name: null,
  contact_email: 'demo@example.com',
  contact_phone: null,
  logo_url: null,
  primary_color: '#cc0000',
  theme: 'tradition',
  iban: null,
  intro_heading: 'Unser Fußballsommer',
  intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: null,
  trainer_image_url: null,
  trainer_text: null,
  terms_text: null,
}

// ── LegalShell: Nav + Footer ──

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  'LegalShell %s rendert Nav mit Vereinsname',
  (theme) => {
    const html = renderToStaticMarkup(
      <LegalShell org={{ ...org, theme }}>
        <p>Inhalt</p>
      </LegalShell>,
    )
    expect(html).toContain('Demo FC')
    expect(html).toContain('Zur Übersicht')
    expect(html).toContain(`/pilot/demo`)
  },
)

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  'LegalShell %s rendert Footer mit allen drei Rechtslinks',
  (theme) => {
    const html = renderToStaticMarkup(
      <LegalShell org={{ ...org, theme }}>
        <p>Inhalt</p>
      </LegalShell>,
    )
    expect(html).toContain('/pilot/demo/impressum')
    expect(html).toContain('/pilot/demo/datenschutz')
    expect(html).toContain('/pilot/demo/teilnahmebedingungen')
    expect(html).toContain('CampsPilot')
  },
)

it('LegalShell Footer zeigt Vereins-E-Mail', () => {
  const html = renderToStaticMarkup(
    <LegalShell org={org}>
      <p>Inhalt</p>
    </LegalShell>,
  )
  expect(html).toContain('demo@example.com')
})

it('LegalShell Logo-img wenn logo_url gesetzt', () => {
  const html = renderToStaticMarkup(
    <LegalShell org={{ ...org, logo_url: 'https://example.com/logo.png' }}>
      <p>Inhalt</p>
    </LegalShell>,
  )
  // next/image URL-encodiert den src; alt-Attribut ist stabiler Nachweis
  expect(html).toContain('alt="Demo FC"')
})

// ── Login ──

it('LoginForm rendert Logo und Submit-Button', () => {
  const html = renderToStaticMarkup(
    <LoginForm
      orgSlug="demo"
      orgName="Demo FC"
      orgLogoUrl="https://example.com/logo.png"
      orgTheme="tradition"
      brandStrong="#9b2020"
      brandOn="#ffffff"
    />,
  )
  // next/image URL-encodiert den src; alt-Attribut ist stabiler Nachweis
  expect(html).toContain('alt="Demo FC"')
  expect(html).toContain('type="submit"')
  expect(html).toContain('Anmelden')
})

it('LoginForm rendert Vereinsname als Label', () => {
  const html = renderToStaticMarkup(
    <LoginForm orgSlug="demo" orgName="Demo FC" orgTheme="akademie" />,
  )
  expect(html).toContain('Demo FC')
  expect(html).toContain('type="submit"')
})

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  'LoginForm %s rendert data-theme und Login-Karte',
  (theme) => {
    const html = renderToStaticMarkup(
      <LoginForm orgSlug="demo" orgTheme={theme} />,
    )
    expect(html).toContain(`data-theme="${theme}"`)
    expect(html).toContain('login-card')
    expect(html).toContain('type="submit"')
  },
)
