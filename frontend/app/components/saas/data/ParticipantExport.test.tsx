// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CampAdmin, RegistrationAdmin, RegistrationQuestion } from '../../../lib/saasAdminApi'
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
async function render(rows = [registration], search = '', questions: RegistrationQuestion[] = []) {
  await act(() => root.render(<StrictMode><ParticipantExport registrations={rows} camp={camp} orgSlug="demo" orgName="Testverein" orgLogoUrl="/test-logo.svg" brandColor="#a01010" filter="all" search={search} allColumns={[{ header: 'Kind', value: row => row.child_first_name }]} questions={questions} onReset={reset} /></StrictMode>))
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
    for (const label of ['Als CSV', 'Als Excel', 'Drucken / Als PDF speichern']) expect(button(label).disabled).toBe(true)
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
  it('opens a daily print dialog with camp/date/count and safe default columns', async () => {
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
    await click('Drucken / Als PDF speichern')
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('Camp-Tagesliste · Sommercamp')
    expect(dialog.textContent).toContain('05.07.2027')
    expect(dialog.textContent).toContain('Stand:')
    expect(dialog.textContent).toContain('1 Teilnehmende')
    expect(dialog.textContent).toContain('Als PDF speichern')
    // camp 2027-07-05 (Mo) to 2027-07-09 (Fr) = 5 days → 5 attendance columns
    expect([...dialog.querySelectorAll('th')].map(c => c.textContent)).toEqual([
      'Nr.', 'Name', 'Jahrgang',
      'Mo 05.07.', 'Di 06.07.', 'Mi 07.07.', 'Do 08.07.', 'Fr 09.07.',
    ])
    expect(dialog.querySelector('tbody tr td:last-child')?.textContent).toBe('')
    // Trainer handout: club logo, brand color and the printed day marked.
    expect(dialog.querySelector<HTMLImageElement>('.cp-sheet-logo')?.getAttribute('src')).toBe('/test-logo.svg')
    expect(dialog.querySelector<HTMLElement>('.cp-print-sheet')?.style.getPropertyValue('--cp-sheet-brand')).toBe('#a01010')
    expect(dialog.querySelectorAll('th.cp-sheet-today')).toHaveLength(1)
    expect(dialog.querySelector('.cp-sheet-notes')).not.toBeNull()
    await click('Zurück zur Liste')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button('Exportieren'))
  })
})

describe('participant list print dialog', () => {
  beforeEach(() => {
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
  })

  async function openParticipantPrint() {
    await render()
    await click('Exportieren')
    const select = container.querySelector<HTMLSelectElement>('select')!
    await act(() => {
      select.value = 'participants'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await click('Drucken / Als PDF speichern')
  }

  it('shows heading, count and safe default columns', async () => {
    await openParticipantPrint()
    const dialog = document.querySelector('dialog')!
    expect(dialog.textContent).toContain('Teilnehmerliste · Sommercamp')
    expect(dialog.textContent).toContain('Stand:')
    expect(dialog.textContent).toContain('1 Anmeldungen')
    expect(dialog.textContent).toContain('Als PDF speichern')
    expect([...dialog.querySelectorAll('th')].map(c => c.textContent)).toEqual([
      'Nr.', 'Name', 'Jahrgang',
    ])
  })
  it('first row shows the participant name', async () => {
    await openParticipantPrint()
    const dialog = document.querySelector('dialog')!
    expect(dialog.querySelector('tbody tr td:nth-child(2)')?.textContent).toBe('Lena Zimmer')
  })
  it('closes and returns focus to the Exportieren button', async () => {
    await openParticipantPrint()
    await click('Zurück zur Liste')
    expect(document.querySelector('dialog')).toBeNull()
    expect(document.activeElement).toBe(button('Exportieren'))
  })
  it('disables Drucken / Als PDF speichern when no participants match the search', async () => {
    await render([registration], 'unbekannt')
    await click('Exportieren')
    const select = container.querySelector<HTMLSelectElement>('select')!
    await act(() => {
      select.value = 'participants'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(button('Drucken / Als PDF speichern').disabled).toBe(true)
  })

  it('changes printed data immediately and retains selection after closing while CSV stays unchanged', async () => {
    await openParticipantPrint()
    const checkbox = [...document.querySelectorAll('label')].find(l => l.textContent === 'Zahlungsstatus')!.querySelector('input')!
    await act(() => checkbox.click())
    expect(document.querySelector('dialog table')?.textContent).toContain('Zahlung offen')
    expect(document.querySelector('dialog table')?.textContent).not.toContain(registration.parent_email)
    await click('Zurück zur Liste')
    await click('Exportieren')
    await click('Als CSV')
    expect(downloadCsv).toHaveBeenCalledWith('sommer-participants.csv', 'Kind\r\nLena')
    await click('Drucken / Als PDF speichern')
    expect(document.querySelector('dialog table')?.textContent).toContain('Zahlung offen')
  })

  it('blocks printing with an empty selection, explains recovery and restores safe defaults', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await openParticipantPrint()
    await click('Alle abwählen')
    expect(document.querySelector('dialog [role="alert"]')?.textContent).toBe('Bitte wählen Sie mindestens eine Spalte für die Druckausgabe.')
    expect(document.querySelector('dialog table')).toBeNull()
    expect(button('Drucken / Als PDF speichern').disabled).toBe(true)
    await click('Drucken / Als PDF speichern')
    expect(print).not.toHaveBeenCalled()
    await click('Standardauswahl')
    expect([...document.querySelectorAll('dialog th')].map(c => c.textContent)).toEqual(['Nr.', 'Name', 'Jahrgang'])
    await click('Drucken / Als PDF speichern')
    expect(print).toHaveBeenCalledOnce()
  })

  it('offers configured origin questions without printing answers until selected', async () => {
    const question: RegistrationQuestion = { key: 'club', label: 'Herkunftsverein laut Anmeldung', type: 'text', options: null, other_label: null, required: false }
    await render([{ ...registration, extra_answers: { club: 'Testverein', deleted: 'Vertrauliche Altantwort' } }], '', [question])
    await click('Exportieren')
    await click('Drucken / Als PDF speichern')
    expect(document.querySelector('dialog table')?.textContent).not.toContain('Testverein')
    const checkbox = [...document.querySelectorAll('label')].find(l => l.textContent === question.label)!.querySelector('input')!
    await act(() => checkbox.click())
    expect(document.querySelector('dialog table')?.textContent).toContain(question.label)
    expect(document.querySelector('dialog table')?.textContent).toContain('Testverein')
    expect(document.querySelector('dialog table')?.textContent).not.toContain('Vertrauliche Altantwort')
  })

  it('exports configured position and origin in participant CSV and keeps print answers opt-in', async () => {
    const questions: RegistrationQuestion[] = [
      { key: 'position', label: 'Position', type: 'choice', options: ['Feldspieler', 'Torwart'], other_label: null, required: true },
      { key: 'verein', label: 'Herkunftsverein', type: 'choice', options: ['KSV Baunatal', 'Kein Verein'], other_label: 'Anderer Verein', required: false },
    ]
    await render([{ ...registration, extra_answers: { position: 'Torwart', verein: 'FC Teststadt' } }], '', questions)
    await click('Exportieren')
    const select = container.querySelector('select')!
    await act(() => { select.value = 'participants'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await click('Als CSV')
    expect(downloadCsv).toHaveBeenCalledWith('sommer-participants.csv', 'Kind;Position;Herkunftsverein\r\nLena;Torwart;FC Teststadt')
    await click('Drucken / Als PDF speichern')
    expect(document.querySelector('dialog table')?.textContent).not.toContain('FC Teststadt')
    const checkbox = [...document.querySelectorAll('dialog label')].find(label => label.textContent === 'Herkunftsverein')!.querySelector('input')!
    await act(() => checkbox.click())
    expect(document.querySelector('dialog table')?.textContent).toContain('FC Teststadt')
  })

  it('exports a linebreak-shifted extra answer as text in participant CSV', async () => {
    const question: RegistrationQuestion = { key: 'verein', label: 'Herkunftsverein', type: 'text', options: null, other_label: null, required: false }
    await render([{ ...registration, extra_answers: { verein: 'Herkunftsverein\r\n=1+1' } }], '', [question])
    await click('Exportieren')
    const select = container.querySelector('select')!
    await act(() => { select.value = 'participants'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await click('Als CSV')
    expect(downloadCsv).toHaveBeenCalledWith('sommer-participants.csv', 'Kind;Herkunftsverein\r\nLena;"Herkunftsverein\r\n\'=1+1"')
  })

  it('prints only filtered active daily rows and includes tenant identity', async () => {
    await render([registration, { ...registration, status: 'waitlist', child_first_name: 'Wartelistenkind' }, { ...registration, status: 'cancelled', child_first_name: 'Stornokind' }], 'Lena')
    await click('Exportieren')
    await click('Drucken / Als PDF speichern')
    const dialog = document.querySelector('dialog')!
    expect(dialog.querySelector('header')?.textContent).toContain('Testverein')
    expect(dialog.querySelector('header')?.textContent).toContain('Suche: „Lena“')
    expect(dialog.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(dialog.querySelector('tbody')?.textContent).toContain('Lena Zimmer')
  })

  it('keeps the original payment CSV and Excel endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false })
    vi.stubGlobal('fetch', fetchMock)
    await render()
    await click('Exportieren')
    const select = container.querySelector('select')!
    await act(() => { select.value = 'payments'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    await click('Als CSV')
    expect(downloadCsv).toHaveBeenCalledWith('sommer-payments.csv', `Kind;Elternteil;E-Mail;Preis (EUR);Zahlungsstatus\r\nLena Zimmer;Test Parent;${registration.parent_email};50,00;Zahlung offen`)
    await click('Als Excel')
    expect(fetchMock).toHaveBeenCalledWith('/pilot/demo/camps/sommer/export?view=payments')
    expect([...container.querySelectorAll('button')].some(b => b.textContent?.includes('Drucken / Als PDF speichern'))).toBe(false)
  })
})
