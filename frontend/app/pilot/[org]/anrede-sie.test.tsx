/**
 * K5 — Anrede-Regression: Kein gerendertes HTML für Eltern darf Du-Formen enthalten.
 *
 * Prüft: ParentFlow (alle drei Themes), DoneScreen (registriert mit/ohne IBAN,
 * Warteliste), Rechtsseiten-Wrapper LegalShell (alle drei Themes).
 *
 * Muster: Wortgrenzen-Regex über die Du-Pronomen-Liste aus K5-Auftrag Punkt 1
 * sowie exemplarische Du-Imperative (Schau, Melde, Sichere, Wähle, Gib).
 * „Sie" und „Ihr" sind erwünscht und werden nicht geprüft.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: vi.fn(),
}))
vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))
vi.mock('./GrainOverlay', () => ({ default: () => null }))
vi.mock('./publicFonts', () => ({
  publicFontClassName: () => '',
  fraunces: { variable: '--font-cp-public-display' },
  archivoTradition: { variable: '--font-cp-public-ui' },
  archivoAkademie: { variable: '--font-cp-public-akademie' },
  spaceGrotesk: { variable: '--font-cp-public-kompakt' },
}))

import ParentFlow from './ParentFlow'
import DoneScreen from './DoneScreen'
import LegalShell from './LegalShell'

const DU_RE =
  /\b(du|dir|dich|dein|deine|deinen|deinem|deiner|deines|Du|Dir|Dein|euch|euer|eure|Schau|Melde|Sichere|Wähle|Gib)\b/

function assertNoDu(html: string) {
  const m = DU_RE.exec(html)
  expect(m, m ? `Du-Form gefunden: „${m[0]}"` : undefined).toBeNull()
}

// ── Testdaten ───────────────────────────────────────────────────────────────

const org: OrganizationPublic = {
  slug: 'demo', name: 'Demo FC', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'demo@example.com', contact_phone: null,
  logo_url: null, primary_color: '#cc0000', theme: 'tradition', iban: null,
  intro_heading: 'Unser Fußballsommer', intro_text: 'Trainieren bei Demo FC.',
  hero_image_url: null, trainer_image_url: null, trainer_text: null,
}

const orgWithIban: OrganizationPublic = { ...org, iban: 'DE89370400440532013000' }

const camp: CampPublic = {
  slug: 'camp-a', title: 'Sommercamp A',
  start_date: '2027-07-05', end_date: '2027-07-09',
  registration_start: null, registration_end: null,
  age_min: 8, age_max: 14, capacity: 30,
  price_cents: 19900, currency: 'EUR',
  registration_open: true, location: 'Kassel',
  care_info: null, meals_info: null, includes: null,
  registered_count: 10, waitlist_count: 0, spots_remaining: 20, is_full: false,
}

const resultRegistered: RegistrationCreated = {
  registration_token: 'tok', status: 'registered',
  payment_status: 'open', payment_reference: 'CP-1234',
}

const resultWaitlist: RegistrationCreated = {
  registration_token: 'tok', status: 'waitlist',
  payment_status: 'open', payment_reference: 'CP-1234',
}

// ── ParentFlow × 3 Themes ──────────────────────────────────────────────────

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  'ParentFlow %s enthält keine Du-Formen',
  (theme) => {
    const html = renderToStaticMarkup(<ParentFlow org={{ ...org, theme }} camps={[camp]} />)
    assertNoDu(html)
  },
)

// ── DoneScreen × 3 Fälle ──────────────────────────────────────────────────

it('DoneScreen registriert mit IBAN enthält keine Du-Formen', () => {
  const html = renderToStaticMarkup(
    <DoneScreen
      org={orgWithIban} camp={camp} result={resultRegistered}
      childName="Mia" parentEmail="eva@example.de" onBackToOrg={() => {}}
    />,
  )
  assertNoDu(html)
})

it('DoneScreen registriert ohne IBAN enthält keine Du-Formen', () => {
  const html = renderToStaticMarkup(
    <DoneScreen
      org={org} camp={camp} result={resultRegistered}
      childName="Mia" parentEmail="eva@example.de" onBackToOrg={() => {}}
    />,
  )
  assertNoDu(html)
})

it('DoneScreen Warteliste enthält keine Du-Formen', () => {
  const html = renderToStaticMarkup(
    <DoneScreen
      org={orgWithIban} camp={camp} result={resultWaitlist}
      childName="Mia" parentEmail="eva@example.de" onBackToOrg={() => {}}
    />,
  )
  assertNoDu(html)
})

// ── Rechtsseiten-Wrapper LegalShell × 3 Themes ────────────────────────────
// LegalShell ist der gemeinsame Nav-/Footer-Wrapper aller drei Rechtsseiten
// (Datenschutz, Impressum, Teilnahmebedingungen). Der statische Seiteninhalt
// selbst enthält ausschließlich Sie-Form (geprüft per Inspektion, K5).

it.each(['tradition', 'akademie', 'kompakt'] as const)(
  'Rechtsseiten-LegalShell %s enthält keine Du-Formen',
  (theme) => {
    const html = renderToStaticMarkup(
      <LegalShell org={{ ...org, theme }}>
        <p>Seiteninhalt</p>
      </LegalShell>,
    )
    assertNoDu(html)
  },
)
