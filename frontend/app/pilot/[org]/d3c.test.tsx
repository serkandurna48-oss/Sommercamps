import { beforeEach, expect, it, vi } from 'vitest'
import type { CampPublic, OrganizationPublic, RegistrationCreated } from '../../lib/saasApi'
import DoneScreen from './DoneScreen'

// ── React mock (same pattern as RegistrationFormScreen.test.tsx) ──
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }))

vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: unknown) => {
      hooks.slots[index] = typeof value === 'function' ? (value as (p: unknown) => unknown)(hooks.slots[index]) : value
    }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial }
    return hooks.slots[index]
  },
  useMemo: (factory: () => unknown) => factory(),
  useEffect: () => {},
}))

vi.mock('../../lib/saasApi', () => ({
  submitRegistration: vi.fn(async () => ({ ok: true, data: { registration_token: 'test' } })),
}))

vi.mock('./motion', () => ({ useParentFlowMotion: () => {} }))

import RegistrationFormScreen from './RegistrationFormScreen'

type ElementNode = { type: string; props: Record<string, unknown> }

function walk(node: unknown): ElementNode[] {
  if (Array.isArray(node)) return node.flatMap(walk)
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const el = node as ElementNode
  return [el, ...walk(el.props.children)]
}

const CAMP = {
  slug: 'sommer', title: 'Sommercamp', start_date: '2026-07-01', end_date: '2026-07-05',
  price_cents: 14900, currency: 'EUR', is_full: false, capacity: 30, spots_remaining: 10,
  age_min: 6, age_max: 14, registration_open: true, location: 'Kassel',
  registration_start: null, registration_end: null, care_info: null, meals_info: null,
  includes: null, registered_count: 5, waitlist_count: 0,
} satisfies CampPublic

function renderForm() {
  hooks.cursor = 0
  return walk(RegistrationFormScreen({
    orgSlug: 'testverein', orgName: 'Testverein', hasBankDetails: true,
    camp: CAMP, onBack: vi.fn(), onSubmitted: vi.fn(),
  }))
}

beforeEach(() => { hooks.slots = []; hooks.cursor = 0; vi.clearAllMocks() })

// ── 1. Field name snapshot (mutation probe) ──
it('renders all required fields with expected name attributes', () => {
  const nodes = renderForm()
  const expectedNames = [
    'child_first_name', 'child_last_name', 'child_birth_date',
    'parent_name', 'parent_email', 'parent_phone', 'emergency_phone',
  ]
  for (const name of expectedNames) {
    expect(
      nodes.some(n => (n.type === 'input' || n.type === 'select' || n.type === 'textarea') && n.props.name === name),
      `Expected field with name="${name}" to be present`,
    ).toBe(true)
  }
})

// ── 2. autocomplete attributes ──
it('has autocomplete attributes on key fields', () => {
  const nodes = renderForm()
  const findAC = (name: string) => nodes.find(n => n.type === 'input' && n.props.name === name)?.props.autoComplete as string | undefined
  expect(findAC('child_first_name')).toContain('given-name')
  expect(findAC('child_last_name')).toContain('family-name')
  expect(findAC('child_birth_date')).toContain('bday')
  expect(findAC('parent_email')).toBe('email')
  expect(findAC('parent_phone')).toBe('tel')
})

// ── 3. Submit area shows price ──
it('submit dock shows the formatted price', () => {
  const nodes = renderForm()
  const sumNode = nodes.find(n => typeof n.props.className === 'string' && n.props.className.includes('sum'))
  expect(sumNode).toBeDefined()
  // 14900 cents = 149,00 € — must contain "149"
  expect(JSON.stringify(sumNode?.props.children)).toContain('149')
})

// ── 4. DoneScreen IBAN, Verwendungszweck, Betrag with copy buttons ──
const ORG: OrganizationPublic = {
  slug: 'tv', name: 'TV', legal_name: null, legal_address: null,
  contact_person_name: null, contact_email: 'k@tv.de', contact_phone: null,
  logo_url: null, primary_color: null, theme: 'tradition',
  intro_heading: null, intro_text: null, hero_image_url: null,
  trainer_image_url: null, trainer_text: null, terms_text: null,
  iban: 'DE89370400440532013000',
}
const RESULT: RegistrationCreated = {
  registration_token: 'tok', status: 'registered', payment_status: 'open', payment_reference: 'CP-1234',
}

it('DoneScreen shows IBAN, Verwendungszweck and Betrag each with a copy button', () => {
  hooks.cursor = 0
  const nodes = walk(DoneScreen({
    org: ORG, camp: CAMP, result: RESULT, childName: 'Mia', parentEmail: 'x@y.de', onBackToOrg: () => {},
  }))
  const serialized = JSON.stringify(nodes.map((n) => n.props))
  expect(serialized).toContain('DE89370400440532013000')
  expect(serialized).toContain('CP-1234')
  // Price "149" in there (14900 cents -> 149,00 €)
  expect(serialized).toContain('149')
  // Three copy buttons (IBAN, Betrag, Verwendungszweck) by aria-label containing "kopieren"
  const copyBtns = nodes.filter((n) => {
    const label = n.props['aria-label']
    return typeof label === 'string' && label.includes('kopieren')
  })
  expect(copyBtns.length).toBeGreaterThanOrEqual(3)
})

// ── 5. No inline opacity:0 in SSR ──
it('no inline opacity:0 style in SSR output', () => {
  const nodes = renderForm()
  const offenders = nodes.filter(n => n.props.style && (n.props.style as Record<string, unknown>).opacity === 0)
  expect(offenders.length).toBe(0)
})

// ── 6. Reduced-motion: sec-rise elements have no inline opacity style ──
it('sec-rise elements have no inline opacity style', () => {
  const nodes = renderForm()
  const riseNodes = nodes.filter(n => typeof n.props.className === 'string' && n.props.className.includes('sec-rise'))
  for (const n of riseNodes) {
    expect((n.props.style as Record<string, unknown> | undefined)?.opacity).not.toBe(0)
  }
})

// ── 7. No old CampSummary table ("Preis pro Kind") in form step ──
it('no "Preis pro Kind" row in form step', () => {
  const nodes = renderForm()
  const serialized = JSON.stringify(nodes.map(n => n.props))
  expect(serialized).not.toContain('Preis pro Kind')
})

// ── 8. Step heads: no circles (.step class), label "SCHRITT 1 VON 3" present ──
it('step heads use labels not circles; "SCHRITT 1 VON 3" present', () => {
  const nodes = renderForm()
  // No numbered circle: no element whose className is exactly or contains the word "step"
  const circles = nodes.filter(n => typeof n.props.className === 'string' && /(?:^| )step(?:$| )/.test(n.props.className))
  expect(circles.length).toBe(0)
  // Step label present
  const serialized = JSON.stringify(nodes.map(n => n.props))
  expect(serialized).toContain('SCHRITT 1 VON 3')
})

// ── 9. Submit button text includes price (mutation probe: removing price fails this test) ──
it('submit button text is exactly "Verbindlich anmelden · 149,00 €" for 149€ camp', () => {
  const nodes = renderForm()
  const btn = nodes.find(n => n.type === 'button' && n.props.type === 'submit')
  expect(btn?.props.children).toBe('Verbindlich anmelden · 149,00 €')
})

// ── 10. Consent cards are labels containing their checkbox ──
it('consent cards are labels that contain their checkbox', () => {
  const nodes = renderForm()
  const consentLabels = nodes.filter(n => n.type === 'label' && typeof n.props.className === 'string' && n.props.className.includes('consent'))
  expect(consentLabels.length).toBeGreaterThan(0)
  for (const label of consentLabels) {
    const inner = walk(label.props.children)
    const checkbox = inner.find(n => n.type === 'input' && n.props.type === 'checkbox')
    expect(checkbox, `consent label missing checkbox: ${JSON.stringify(label.props.className)}`).toBeDefined()
  }
})
