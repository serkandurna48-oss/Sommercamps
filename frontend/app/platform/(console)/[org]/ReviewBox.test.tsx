// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SubmittedOrgsSection from '../SubmittedOrgsSection'
import ReviewBox from './ReviewBox'
import { reviewOrganizationAction, type ReviewActionState } from './reviewActions'
import type { OrganizationAdmin } from '../../../lib/saasAdminApi'

vi.mock('./reviewActions', () => ({ reviewOrganizationAction: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}))

const baseOrg: OrganizationAdmin = {
  id: 'org-1',
  slug: 'test-verein',
  name: 'Test Verein',
  legal_name: 'Test Verein e.V.',
  legal_address: 'Teststraße 1, 34289 Zulsdorf',
  contact_email: 'kontakt@test-verein.de',
  contact_phone: null,
  contact_person_name: 'Max Mustermann',
  logo_url: null,
  primary_color: null,
  plan_status: 'pilot',
  theme: 'tradition',
  iban: 'DE89370400440532013000',
  intro_heading: null,
  intro_text: null,
  hero_image_url: null,
  trainer_image_url: null,
  trainer_text: null,
  terms_text: null,
  site_published: false,
  review_status: 'submitted',
  submitted_at: '2026-10-20T10:00:00Z',
  avv_version: '2026-v1',
  review_note: null,
  approved_at: null,
}

// ── Abschnitt-Tests (SubmittedOrgsSection) ───────────────────────────────────

it('shows submitted section when there are orgs waiting for review', () => {
  const html = renderToStaticMarkup(<SubmittedOrgsSection orgs={[baseOrg]} />)
  expect(html).toContain('Wartet auf Freigabe')
  expect(html).toContain('Test Verein')
})

it('hides submitted section when no orgs are waiting', () => {
  const html = renderToStaticMarkup(<SubmittedOrgsSection orgs={[]} />)
  expect(html).toBe('')
})

// ── ReviewBox-Tests ──────────────────────────────────────────────────────────

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(reviewOrganizationAction).mockResolvedValue({
    error: null,
    done: true,
    decision: 'approve',
  } satisfies ReviewActionState)
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.resetAllMocks()
})

async function renderBox(org: OrganizationAdmin = baseOrg, campCount = 1) {
  await act(() => root.render(<ReviewBox org={org} campCount={campCount} />))
}

function getBtn(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(b =>
    b.textContent?.includes(text),
  )
}

function getForm(decision: 'approve' | 'reject'): HTMLFormElement {
  const forms = Array.from(container.querySelectorAll<HTMLFormElement>('form'))
  return forms.find(
    f => (f.querySelector<HTMLInputElement>('input[name="decision"]')?.value ?? '') === decision,
  )!
}

async function submitForm(decision: 'approve' | 'reject') {
  await act(async () => {
    getForm(decision).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

// Test 1 — Freigeben ruft die Action mit decision 'approve'
it('approve submits with decision approve', async () => {
  await renderBox()
  await submitForm('approve')
  expect(reviewOrganizationAction).toHaveBeenCalledOnce()
  const [slug, , formData] = vi.mocked(reviewOrganizationAction).mock.calls[0]
  expect(slug).toBe('test-verein')
  expect(formData.get('decision')).toBe('approve')
})

// Test 2 — Ablehnen ohne Grund: Fehlermeldung, kein Action-Aufruf
it('reject without reason shows error and does not call action', async () => {
  await renderBox()
  // Ablehnungsformular öffnen
  await act(() => {
    getBtn('Ablehnen')!.click()
  })
  // Formular ohne Begründung absenden
  await submitForm('reject')
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Ablehnungsgrund')
  expect(reviewOrganizationAction).not.toHaveBeenCalled()
})

// Test 3 — Ablehnen mit Grund: Action wird mit note aufgerufen
it('reject with reason calls action with note', async () => {
  vi.mocked(reviewOrganizationAction).mockResolvedValue({
    error: null,
    done: true,
    decision: 'reject',
  })
  await renderBox()
  await act(() => {
    getBtn('Ablehnen')!.click()
  })
  const textarea = container.querySelector<HTMLTextAreaElement>('textarea[name="note"]')!
  textarea.value = 'Vereinsname klingt nicht vertrauenswürdig.'
  await submitForm('reject')
  expect(reviewOrganizationAction).toHaveBeenCalledOnce()
  const [slug, , formData] = vi.mocked(reviewOrganizationAction).mock.calls[0]
  expect(slug).toBe('test-verein')
  expect(formData.get('decision')).toBe('reject')
  expect(formData.get('note')).toBe('Vereinsname klingt nicht vertrauenswürdig.')
})

// Test 4 — API-Fehler: Meldung bleibt sichtbar, Knöpfe sind wieder aktiv
it('api error keeps error message and re-enables buttons', async () => {
  vi.mocked(reviewOrganizationAction).mockResolvedValue({
    error: 'Server nicht erreichbar',
    done: false,
    decision: null,
  })
  await renderBox()
  await submitForm('approve')
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('Server nicht erreichbar')
  expect(getBtn('Freigeben')?.disabled).toBe(false)
})

// Mutationsprobe: Pflichtprüfung des Grunds entfernen → dieser Test wird rot
// Wenn die Längenprüfung (< 10 Zeichen) aus ReviewBox.tsx entfernt wird,
// wird reviewOrganizationAction aufgerufen und not.toHaveBeenCalled() schlägt fehl.
