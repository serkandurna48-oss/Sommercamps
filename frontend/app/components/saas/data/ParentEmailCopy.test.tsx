// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import { parentEmails } from '../parentEmails'
import ParentEmailCopy from './ParentEmailCopy'
import ParticipantList from './ParticipantList'

vi.mock('./ParticipantExport', () => ({ default: () => null }))
vi.mock('./ParticipantRow', () => ({ default: () => null }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => <a {...props}>{children}</a> }))

function registration(id: string, status: RegistrationAdmin['status'], parent_email: string): RegistrationAdmin {
  return {
    id, registration_token: `token-${id}`, payment_reference: `CP-${id}`, status, parent_email, payment_status: 'paid',
    parent_first_name: 'Test', parent_last_name: 'Eltern', parent_phone: '123',
    child_first_name: 'Test', child_last_name: 'Kind', child_birth_date: '2018-01-01',
    emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
    jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2026-10-01T00:00:00Z',
  }
}
const rows = [
  registration('1', 'registered', ' Familie@Example.COM '),
  registration('2', 'confirmed', 'familie@example.com'),
  registration('3', 'confirmed', 'ZWEITE@example.com'),
  registration('4', 'cancelled', 'storniert@example.com'),
  registration('5', 'waitlist', 'WARTET@example.com'),
  registration('6', 'waitlist', 'FAMILIE@example.com'),
]

describe('Elternadressen auswählen', () => {
  it('normalisiert und dedupliziert Adressen von angemeldeten und bestätigten Teilnehmenden', () => {
    expect(parentEmails(rows)).toEqual(['familie@example.com', 'zweite@example.com'])
  })
  it.each([false, true])('schließt Stornierungen aus, auch mit Warteliste=%s und bezahlter Anmeldung', includeWaitlist => {
    expect(parentEmails([rows[3]], includeWaitlist)).toEqual([])
  })
  it('nimmt die Warteliste nur auf Wunsch hinzu und dedupliziert sie ebenfalls', () => {
    expect(parentEmails(rows, true)).toEqual(['familie@example.com', 'zweite@example.com', 'wartet@example.com'])
  })
  it('ignoriert leere Adressen', () => {
    expect(parentEmails([registration('leer', 'registered', '  ')])).toEqual([])
    expect(parentEmails([])).toEqual([])
  })
})

let container: HTMLDivElement
let root: Root
let writeText: ReturnType<typeof vi.fn>
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})
async function render(registrations = rows) {
  await act(() => root.render(<ParentEmailCopy registrations={registrations} />))
}
function button() {
  return [...container.querySelectorAll('button')].find(b => b.textContent === 'E-Mail-Adressen kopieren')!
}
async function copy() { await act(async () => { button().click() }) }
async function toggle() { await act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()) }
function expectFormalText() {
  expect(container.textContent).not.toMatch(/\b(du|dein\w*|dir|dich)\b/i)
}

describe('Elternadressen kopieren', () => {
  it('kopiert mit Semikolon-Trennung und zeigt Anzahl sowie den vollständigen BCC-Hinweis', async () => {
    await render()
    expect(container.querySelector<HTMLInputElement>('input')!.checked).toBe(false)
    expect(button().className).toContain('cp-btn-secondary')
    expectFormalText()
    await copy()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('familie@example.com; zweite@example.com')
    expect(container.querySelector('[role="status"]')!.textContent).toBe('2 Adressen kopiert – fügen Sie sie in Ihrem E-Mail-Programm in das BCC-Feld ein.')
    expectFormalText()
  })
  it('schaltet die Warteliste ein und wieder aus und entfernt dabei alte Rückmeldungen', async () => {
    await render()
    await copy()
    await toggle()
    expect(container.textContent).toContain('Auch Warteliste')
    expect(container.textContent).not.toContain('Adressen kopiert')
    await copy()
    expect(writeText).toHaveBeenLastCalledWith('familie@example.com; zweite@example.com; wartet@example.com')
    expect(container.textContent).toContain('3 Adressen kopiert')
    await toggle()
    await copy()
    expect(writeText).toHaveBeenLastCalledWith('familie@example.com; zweite@example.com')
  })
  it.each(['abgelehnt', 'nicht verfügbar'])('bietet ein beschriftetes, schreibgeschütztes Textfeld, wenn Clipboard %s ist', async mode => {
    if (mode === 'abgelehnt') writeText.mockRejectedValue(new Error('Clipboard nicht erlaubt'))
    else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    await render()
    await copy()
    const textarea = container.querySelector('textarea')!
    expect(textarea.readOnly).toBe(true)
    expect(textarea.value).toBe('familie@example.com; zweite@example.com')
    expect(container.querySelector(`label[for="${textarea.id}"]`)!.textContent).toBe('Bitte manuell kopieren')
    expect(document.getElementById(textarea.getAttribute('aria-describedby')!)!.textContent).toContain('BCC-Feld')
    expect(container.textContent).not.toContain('Adressen kopiert')
    expectFormalText()
    await act(() => textarea.focus())
    expect(textarea.selectionEnd).toBe(textarea.value.length)
    await toggle()
    expect(container.querySelector('textarea')).toBeNull()
  })
  it('löscht den manuellen Fallback nach erfolgreichem erneutem Kopieren', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard nicht erlaubt'))
    await render()
    await copy()
    expect(container.querySelector('textarea')).not.toBeNull()
    await copy()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('2 Adressen kopiert')
  })
  it('überträgt keine Adressen ans Netzwerk und protokolliert sie auch bei Fehlern nicht', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map(method => vi.spyOn(console, method))
    await render()
    await copy()
    writeText.mockRejectedValueOnce(new Error('Clipboard nicht erlaubt'))
    await copy()
    expect(fetch).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    for (const log of logs) expect(log).not.toHaveBeenCalled()
  })
  it('überschreibt bei fehlenden Adressen nicht die Zwischenablage', async () => {
    await render([rows[3], rows[4]])
    expect(button().disabled).toBe(true)
    expect(container.textContent).toContain('Keine E-Mail-Adressen zum Kopieren vorhanden.')
    expectFormalText()
    await copy()
    expect(writeText).not.toHaveBeenCalled()
    await toggle()
    expect(button().disabled).toBe(false)
    await copy()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('wartet@example.com')
  })
  it('entfernt veraltete Adressen aus dem Fallback nach Änderung der Camp-Daten', async () => {
    writeText.mockRejectedValue(new Error('Clipboard nicht erlaubt'))
    await render()
    await copy()
    await render([rows[0]])
    expect(container.querySelector('textarea')).toBeNull()
    await copy()
    expect(container.querySelector('textarea')!.value).toBe('familie@example.com')
  })
  it('kopiert in der Teilnehmerliste alle Camp-Adressen trotz aktivem Filter ohne Treffer', async () => {
    const camp = { slug: 'sommer', title: 'Sommercamp' } as CampAdmin
    await act(() => root.render(<ParticipantList registrations={rows} camp={camp} campSlug="sommer" orgSlug="demo" brandColor="#116644" initialFilter="payment-open" />))
    expect(container.textContent).toContain('0 Anmeldungen')
    await copy()
    expect(writeText).toHaveBeenCalledExactlyOnceWith('familie@example.com; zweite@example.com')
  })
})
