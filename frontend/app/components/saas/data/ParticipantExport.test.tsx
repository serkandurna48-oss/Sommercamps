// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'
import ParticipantExport from './ParticipantExport'
import { downloadCsv } from '../../../lib/exportCsv'

vi.mock('../../../lib/exportCsv', async importOriginal => ({ ...await importOriginal<typeof import('../../../lib/exportCsv')>(), downloadCsv: vi.fn() }))

const registration: RegistrationAdmin = {
  id: '1', registration_token: 'token-1', payment_reference: 'CP-TOKEN-1', status: 'registered', payment_status: 'open',
  parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'test@example.com', parent_phone: '123',
  child_first_name: 'Lena', child_last_name: 'Zimmer', child_birth_date: '2018-05-10',
  emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
  jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
}
const camp = { title: 'Sommercamp', slug: 'sommer', start_date: '2027-07-05', end_date: '2027-07-09', price_cents: 5000 } as CampAdmin
let container: HTMLDivElement
let root: Root
const reset = vi.fn()
const dialogDescriptors = Object.fromEntries(['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  for (const [name, descriptor] of Object.entries(dialogDescriptors)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor)
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name)
  }
})
async function render(rows = [registration], search = '') {
  await act(() => root.render(<StrictMode><ParticipantExport registrations={rows} camp={camp} orgSlug="demo" filter="all" search={search} allColumns={[]} onReset={reset} /></StrictMode>))
}
function button(label: string) {
  const found = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(found, label).toBeDefined()
  return found!
}
async function click(label: string) { await act(() => button(label).click()) }

describe('participant export workflow', () => {
  it('defaults to daily list, displays count, and exports the same CSV rows', async () => {
    await render([registration, { ...registration, status: 'waitlist', registration_token: 'waiting' }])
    expect(container.textContent).toContain('Tagesliste enthält 1 Teilnehmende (ohne Warteliste und Stornierungen)')
    await click('Exportieren')
    expect(container.querySelector('select')?.value).toBe('daylist')
    expect([...container.querySelectorAll('option')].map(o => o.textContent)).toEqual(['Camp-Tagesliste', 'Zahlungsübersicht', 'Alle Anmeldungen'])
    await click('Als CSV')
    expect(downloadCsv).toHaveBeenCalledWith('sommer-daylist.csv', 'Kind;Jahrgang/Alter;Notfallkontakt Telefon;Abholberechtigt;Hinweise/Allergien;Anwesenheit\r\nLena Zimmer;2018;;;;')
    expect(container.textContent).toContain('Download gestartet')
  })
  it('disables all exports at zero results and offers filter reset', async () => {
    await render([registration], 'unbekannt')
    expect(container.textContent).toContain('Tagesliste enthält 0 Teilnehmende (ohne Warteliste und Stornierungen)')
    expect(container.textContent).toContain('Suche: „unbekannt“')
    await click('Exportieren')
    for (const label of ['Als CSV', 'Als Excel', 'Druckansicht']) expect(button(label).disabled).toBe(true)
    await click('Als CSV')
    expect(downloadCsv).not.toHaveBeenCalled()
    await click('Filter zurücksetzen')
    expect(reset).toHaveBeenCalledOnce()
  })
  it('uses regular tab controls and returns focus to the 44px trigger on Escape', async () => {
    await render()
    await click('Exportieren')
    expect(container.querySelector('[role="menu"]')).toBeNull()
    button('Als CSV').focus()
    await act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.activeElement).toBe(button('Exportieren'))
    expect(button('Exportieren').className).toContain('min-h-[44px]')
    expect(button('Exportieren').getAttribute('aria-expanded')).toBe('false')
  })
  it('keeps Excel failure in the screen with a retry action', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    await render([registration, { ...registration, status: 'cancelled' }])
    await click('Exportieren')
    await click('Als Excel')
    expect(fetchMock).toHaveBeenCalledWith('/pilot/demo/camps/sommer/export?view=daylist&tokens=token-1')
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Export fehlgeschlagen')
    await click('Erneut versuchen')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('opens a separate daily print dialog with camp/date/count and all columns', async () => {
    // jsdom does not implement the native dialog lifecycle.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true
        this.querySelector('button')?.focus()
      },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) { this.open = false },
    })
    await render()
    await click('Exportieren')
    await click('Druckansicht')
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('Camp-Tagesliste · Sommercamp')
    expect(dialog.textContent).toContain('05.07.2027')
    expect(dialog.textContent).toContain('Erstellt:')
    expect(dialog.textContent).toContain('1 Teilnehmende')
    expect([...dialog.querySelectorAll('th')].map(c => c.textContent)).toEqual(['Kind', 'Jahrgang/Alter', 'Notfallkontakt Telefon', 'Abholberechtigt', 'Hinweise/Allergien', 'Anwesenheit'])
    expect(dialog.querySelector('tbody tr td:last-child')?.textContent).toBe('')
    await click('Zurück zur Liste')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button('Exportieren'))
  })
})
