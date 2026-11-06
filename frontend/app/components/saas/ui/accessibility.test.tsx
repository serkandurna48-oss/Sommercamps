// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Field from './Field'
import Button, { ButtonLink } from './Button'
import FilterButton from './FilterButton'
import ExportBar from './ExportBar'
import { INPUT_CLASS } from './formFieldStyles'
import { __internal } from '../brandPipeline'
import ParticipantList from '../data/ParticipantList'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'

vi.mock('../actions/waitlistActions', () => ({ resendRegistrationMailAction: vi.fn(),
  cancelRegistrationAction: vi.fn(), deleteRegistrationAction: vi.fn(), updateRegistrationDetailsAction: vi.fn(),
}))
vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))
vi.mock('../shell/logoutAction', () => ({ logoutAction: vi.fn() }))

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
})
const registration: RegistrationAdmin = {
  payment_reference: 'CP-TEST0001',
  id: 'test-one', registration_token: 'token-one', status: 'registered', payment_status: 'open',
  parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'test@example.com', parent_phone: '123',
  child_first_name: 'Test', child_last_name: 'Child', child_birth_date: '2018-05-10',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
  jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
}
const camp = { title: 'Testcamp', slug: 'camp', start_date: '2027-07-05', end_date: '2027-07-09', price_cents: 5000 } as CampAdmin
function minimumTarget(element: Element) {
  expect(element.classList.contains('min-h-[44px]') || element.classList.contains('min-h-[50px]')).toBe(true)
  expect(element.classList.contains('min-w-[44px]')).toBe(true)
}
const contrast = (a: string, b: string) => __internal.contrastRatio(__internal.hexToRgb(a), __internal.hexToRgb(b))

describe('admin accessibility primitives', () => {
  it('shares a 2px focus outline with 2px offset across fields, buttons and scoped controls', async () => {
    await act(() => root.render(<><input className={INPUT_CLASS} /><Button>Speichern</Button></>))
    for (const control of container.querySelectorAll('input,button')) expect(control.classList.contains('cp-focus')).toBe(true)
    expect(INPUT_CLASS).not.toContain('outline-none')
    const css = readFileSync(resolve('app/components/saas/ui/focus.css'), 'utf8')
    expect(css).toContain('.cp-focus:focus-visible')
    expect(css).toContain('.cp-scope:where(.cp-admin) :is(input, textarea, select, button, a[href], summary, [tabindex]):focus-visible')
    expect(css).toContain('outline: 2px solid')
    expect(css).toContain('outline-offset: 2px')
    expect(css).toContain('.cp-scope:where(.cp-admin) .cp-band')
    const tokens = readFileSync(resolve('app/components/saas/tokens.css'), 'utf8')
    // Launch-UX: no bottom tab bar; the fixed selection bar keeps the safe area.
    expect(tokens).toMatch(/\.cp-selection-bar\s*\{\s*bottom: 0;\s*padding-bottom: calc\(16px \+ var\(--cp-safe-area-bottom\)\);/)
    // Sidebar entries and drawer controls keep the 44 px target.
    expect(tokens).toMatch(/\.cp-nav-item \{[^}]*min-height: 44px;/)
    expect(tokens).toMatch(/\.cp-icon-btn \{[^}]*width: 44px;\s*height: 44px;/)
  })

  it('connects hints and errors to a wrapped input and preserves external descriptions', async () => {
    const render = (error?: string) => <Field label="Vereinsfarbe" htmlFor="brand" hint="Wähle deine Farbe." error={error}>
      <div><input id="brand" aria-describedby="extra" /><span id="extra">Weitere Hilfe</span></div>
    </Field>
    await act(() => root.render(render('Bitte prüfe deine Farbe.')))
    const input = container.querySelector('input')!
    expect(container.querySelector('label')!.control).toBe(input)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('extra brand-hint brand-error')
    for (const id of input.getAttribute('aria-describedby')!.split(' ')) expect(document.getElementById(id)?.textContent).toBeTruthy()
    await act(() => root.render(render()))
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.getAttribute('aria-describedby')).toBe('extra brand-hint')
    expect(document.getElementById('brand-error')).toBeNull()
  })

  it.each(['input', 'textarea', 'select'] as const)('connects errors to %s controls', async tag => {
    const control = tag === 'input' ? <input id="field" /> : tag === 'textarea' ? <textarea id="field" /> : <select id="field"><option>Test</option></select>
    await act(() => root.render(<Field label="Test" htmlFor="field" error="Prüfe deine Eingabe.">{control}</Field>))
    expect(container.querySelector(tag)!.getAttribute('aria-describedby')).toBe('field-error')
    expect(container.querySelector(tag)!.getAttribute('aria-invalid')).toBe('true')
  })

  it('gives export a 44px target and restores focus when export closes with Escape', async () => {
    await act(() => root.render(<ExportBar rows={[registration]} columns={[]} csvFilename="test.csv" xlsxHref="/test.xlsx" />))
    const trigger = container.querySelector('button')!
    minimumTarget(trigger)
    await act(() => trigger.click())
    const group = container.querySelector('[role="group"]')!
    expect(group.id).toBe(trigger.getAttribute('aria-controls'))
    expect(container.querySelector('[role="menu"]')).toBeNull()
    for (const item of group.querySelectorAll('button,a')) minimumTarget(item)
    ;(group.querySelector('button') as HTMLButtonElement).focus()
    await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(container.querySelector('[role="group"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('gives navigation actions an explicit 44px minimum target', async () => {
    await act(() => root.render(<ButtonLink href="/pilot/demo/camps/new" variant="primary">Camp anlegen</ButtonLink>))
    const link = container.querySelector('a')!
    minimumTarget(link)
    expect(link.classList.contains('cp-focus')).toBe(true)
    expect(link.querySelector('button')).toBeNull()
  })

  // Redesign R1: admin controls use the CampsPilot orange, whatever the club colour.
  it.each(['#B8912B', '#CC0000'])('uses CampsPilot accent with safe contrast for filters, selection actions and editing: %s', async color => {
    await act(() => root.render(<><FilterButton label="Alle" count={1} active onClick={() => {}} />
      <ParticipantList camp={camp} registrations={[registration]} orgSlug="test" campSlug="camp" brandColor={color} /></>))
    const filter = container.querySelector('button')!
    expect(filter.style.color).toBe('var(--cp-accent-ink)')
    expect(filter.style.background).toBe('var(--cp-accent-soft)')
    // Brand kit values from tokens.css: accent-ink on accent-soft/white/paper, on-accent on both gradient stops.
    expect(contrast('#a8460f', '#fbe3d6')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#a8460f', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#a8460f', '#f4f3ef')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1b0d06', '#e8672b')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1b0d06', '#f27a3d')).toBeGreaterThanOrEqual(4.5)
    const checkbox = container.querySelector('.cp-roster-row input[type="checkbox"]') as HTMLInputElement
    minimumTarget(checkbox.closest('label')!)
    await act(() => checkbox.closest('label')!.click())
    const action = container.querySelector('a[href^="mailto:?bcc"]') as HTMLAnchorElement
    expect(action.classList.contains('cp-btn-primary')).toBe(true)
    expect(action.style.background).toBe('')
    expect(action.querySelector('button')).toBeNull()
    // The roster disclosure is separate from both export and selection.
    const row = container.querySelector('.cp-roster-row')!
    const rowTrigger = row.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(rowTrigger.getAttribute('aria-expanded')).toBe('false')
    await act(() => rowTrigger.click())
    const edit = [...row.querySelectorAll('button')].find(button => button.textContent === 'Bearbeiten')!
    minimumTarget(edit)
    await act(() => edit.click())
    const save = row.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(save.classList.contains('cp-btn-primary')).toBe(true)
    expect(save.style.background).toBe('')
  })

  it('makes closed details inert and keeps labels unique across simultaneous participant editors', async () => {
    await act(() => root.render(<ParticipantList camp={camp} registrations={[registration, { ...registration, id: 'test-two', registration_token: 'token-two' }]} orgSlug="test" campSlug="camp" brandColor="#B8912B" />))
    const rows = [...container.querySelectorAll('.cp-roster-row')]
    for (const row of rows) {
      const trigger = row.querySelector('button[aria-expanded]') as HTMLButtonElement
      const detail = document.getElementById(trigger.getAttribute('aria-controls')!)!
      expect(detail.hasAttribute('inert')).toBe(true)
      expect(detail.getAttribute('aria-hidden')).toBe('true')
      await act(() => trigger.click())
      expect(detail.hasAttribute('inert')).toBe(false)
      const edit = [...row.querySelectorAll('button')].find(button => button.textContent === 'Bearbeiten')!
      await act(() => edit.click())
    }
    const controls = [...container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.cp-roster-row input[name], .cp-roster-row textarea[name]')]
    expect(controls).toHaveLength(12)
    expect(new Set(controls.map(control => control.id)).size).toBe(12)
    for (const control of controls) expect(control.labels?.[0]?.htmlFor).toBe(control.id)
    const firstTrigger = rows[0].querySelector('button[aria-expanded]') as HTMLButtonElement
    controls[0].value = 'Changed first name'
    await act(() => firstTrigger.click())
    expect(controls[0].closest('[inert]')).not.toBeNull()
    expect(controls[6].closest('[inert]')).toBeNull()
    await act(() => firstTrigger.click())
    expect(controls[0].isConnected).toBe(true)
    expect(controls[0].value).toBe('Changed first name')
    expect(controls[0].closest('[inert]')).toBeNull()
  })
})
