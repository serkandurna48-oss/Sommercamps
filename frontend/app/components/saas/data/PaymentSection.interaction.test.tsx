// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PaymentSection, { type PaymentEntry } from './PaymentSection'
import { setPaymentStatusAction } from '../actions/paymentActions'
import { buildPaymentReminder, type ReminderOrganization } from '../../../lib/zahlungserinnerung'

vi.mock('../actions/paymentActions', () => ({ setPaymentStatusAction: vi.fn() }))

const entry: PaymentEntry = {
  registration: {
    id: 'registration-1', registration_token: '1a2b3c4d-1234-5678-abcd-123456789abc', payment_reference: 'CP-1A2B3C4D',
    status: 'registered', payment_status: 'open',
    child_first_name: 'Mia', child_last_name: 'Muster', child_birth_date: '2018-05-10',
    parent_first_name: 'Alex', parent_last_name: 'Beispiel', parent_email: 'alex@example.com', parent_phone: '123',
    emergency_contact_name: null, emergency_contact_phone: null, medical_notes: null, allergies: null,
    jersey_size: null, pickup_authorized: null, photo_permission: false, created_at: '2027-01-01T00:00:00Z',
  },
  camp: {
    id: 'camp-1', organization_id: 'org-1', slug: 'summer', title: 'Sommercamp',
    start_date: '2027-07-05', end_date: '2027-07-09', registration_start: null, registration_end: null,
    age_min: 6, age_max: 12, capacity: 20, price_cents: 14900, currency: 'EUR', status: 'published',
    location: null, care_info: null, meals_info: null, includes: null,
  },
}
const paidEntry: PaymentEntry = { ...entry, registration: { ...entry.registration, payment_status: 'paid' } }
const org: ReminderOrganization = { name: 'Demo FC', legal_name: 'Demo Sportverein e. V.', iban: 'DE89370400440532013000', contact_person_name: 'Alex Verein', contact_email: 'verein@example.com' }
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.mocked(setPaymentStatusAction).mockImplementation(async (_org, _camp, _token, _status, success) => ({ error: null, success }))
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.resetAllMocks()
})

async function render(entries: PaymentEntry[] = [entry], organization = org) {
  await act(() => root.render(<PaymentSection entries={entries} org={organization} orgSlug="demo" brandColor="#112233"
    emptyLabel="Keine Anmeldungen" csvFilename="payments.csv" xlsxHref="/export" />))
}

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(b => b.textContent === label)
  expect(found, `Missing button: ${label}`).toBeDefined()
  return found!
}

async function click(label: string) {
  await act(async () => { button(label).click() })
}

async function search(value: string) {
  const input = container.querySelector<HTMLInputElement>('input[type="search"]')!
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('payment workflow', () => {
  it('copies a complete reminder and confirms inline', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await click('Erinnerung kopieren')
    expect(writeText).toHaveBeenCalledWith(buildPaymentReminder(entry, org))
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Text kopiert')
    expect(container.textContent).not.toMatch(/\b(du|dein|deine|dir|dich)\b/i)
    expect(setPaymentStatusAction).not.toHaveBeenCalled()
  })

  it.each([null, '', '   '])('disables the reminder without an IBAN (%s)', async iban => {
    await render([entry], { ...org, iban })
    expect(button('Erinnerung kopieren').disabled).toBe(true)
    expect(button('Erinnerung kopieren').title).toBe('IBAN in den Vereinseinstellungen fehlt')
    expect(button('Alle offenen als Liste kopieren').disabled).toBe(false)
  })

  it('only offers reminders for active open payments, even in the All filter', async () => {
    const entries = ['paid', 'waived', 'refunded', 'cancelled'].map((payment_status, i) => ({
      ...entry, registration: { ...entry.registration, id: `r-${i}`, payment_status: payment_status as PaymentEntry['registration']['payment_status'] },
    }))
    entries.push({ ...entry, registration: { ...entry.registration, id: 'cancelled', status: 'cancelled' } })
    entries.push({ ...entry, registration: { ...entry.registration, id: 'waitlist', status: 'waitlist' } })
    await render(entries)
    await click('Alle6')
    expect(container.textContent).not.toContain('Erinnerung kopieren')
    expect(button('Alle offenen als Liste kopieren').disabled).toBe(true)
  })

  it('copies all open entries across camps independently of search and status filters', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const second = { ...entry, camp: { ...entry.camp, title: 'Herbstcamp', price_cents: 9900 },
      registration: { ...entry.registration, id: 'second', payment_reference: 'CP-Second' } }
    await render([entry, second, { ...paidEntry, registration: { ...paidEntry.registration, id: 'paid' } },
      { ...entry, registration: { ...entry.registration, id: 'cancelled', status: 'cancelled' } }])
    await click('Bezahlt1')
    await search('unrelated')
    await click('Alle offenen als Liste kopieren')
    expect(writeText).toHaveBeenCalledWith('Alex Beispiel – Mia Muster – Sommercamp – 149,00 € – CP-1A2B3C4D\nAlex Beispiel – Mia Muster – Herbstcamp – 99,00 € – CP-Second')
    expect(container.textContent).toContain('Text kopiert')
  })

  it.each(['Erinnerung kopieren', 'Alle offenen als Liste kopieren'])('offers a read-only fallback for %s and recovers on retry', async label => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await click(label)
    const textarea = container.querySelector('textarea')!
    expect(textarea.readOnly).toBe(true)
    expect(textarea.value).toBe(writeText.mock.calls[0][0])
    expect(textarea.value).toContain('CP-1A2B3C4D')
    expect(container.textContent).toContain('Bitte wählen Sie den Text aus')
    expect(container.textContent).not.toContain('Text kopiert')
    expect(container.textContent).not.toMatch(/\b(du|dein|deine|dir|dich)\b/i)
    textarea.focus()
    expect(textarea.selectionEnd).toBe(textarea.value.length)
    writeText.mockResolvedValue(undefined)
    await click(label)
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('Text kopiert')
  })

  it('also falls back when the Clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    await render()
    await click('Erinnerung kopieren')
    expect(container.querySelector('textarea')?.value).toBe(buildPaymentReminder(entry, org))
  })

  it.each(['CP-1A2B3C4D', 'CP- 1A2B 3C4D', ' cp-1a2b3c4d ', 'mIa mUsTeR', ' aLeX  bEiSpIeL '])('finds reference, child or parent: %s', async query => {
    await render([entry, { ...entry, registration: {
      ...entry.registration, id: 'registration-2', registration_token: '87654321-1234-5678-abcd-123456789abc',
      payment_reference: 'CP-87654321', child_first_name: 'Noah', child_last_name: 'Anders',
      parent_first_name: 'Sam', parent_last_name: 'Anders', parent_email: 'sam@example.com',
    } }])
    await search(query)
    expect(container.querySelectorAll('.cp-ledger-row')).toHaveLength(1)
    expect(container.querySelector('.cp-ledger-row')?.textContent).toContain('CP-1A2B3C4D')
    expect(button('Offen2').getAttribute('aria-pressed')).toBe('true')
    const input = container.querySelector('input')!
    expect(container.querySelector('label')?.htmlFor).toBe(input.id)
    expect(input.placeholder).toBe('CP-XXXXXXXX')
  })

  it('excludes an open payment that does not match the search', async () => {
    await render()
    await search('CP-00000000')
    expect(container.querySelector('.cp-ledger-row')).toBeNull()
    expect(container.textContent).toContain('Keine offene Zahlung zu „CP-00000000“.')
  })

  it('switches from an empty open search to all while retaining the query', async () => {
    await render([paidEntry])
    await search('cp-1a2b3c4d')
    expect(container.textContent).toContain('Keine offene Zahlung zu „cp-1a2b3c4d“.')
    expect(container.querySelector('.cp-ledger-row')).toBeNull()
    await click('Auch bezahlte durchsuchen')
    expect(button('Alle1').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('.cp-ledger-row')?.textContent).toContain('Mia Muster')
    expect(container.querySelector('input')?.value).toBe('cp-1a2b3c4d')
  })

  it('shows the settled empty state and offers a visible All filter', async () => {
    await render([paidEntry])
    expect(container.textContent).toContain('Alle aktiven Anmeldungen sind bezahlt oder erlassen.')
    await click('Alle1')
    expect(container.querySelector('.cp-ledger-row')).not.toBeNull()
  })

  it('does not call refunded registrations paid or waived', async () => {
    await render([{ ...entry, registration: { ...entry.registration, payment_status: 'refunded' } }])
    expect(container.textContent).not.toContain('Alle aktiven Anmeldungen sind bezahlt oder erlassen.')
  })

  it('keeps the payment receipt after the refreshed row disappears, and undo calls open', async () => {
    await render()
    await click('Als bezahlt markieren')
    await render([paidEntry])
    expect(container.querySelector('.cp-ledger-row')).toBeNull()
    expect(container.textContent?.replace(/\s/g, ' ')).toContain('149,00 € für Mia als bezahlt erfasst – CP-1A2B3C4D')
    await search('unrelated')
    expect(button('Rückgängig: wieder auf Offen')).toBeDefined()
    await click('Rückgängig: wieder auf Offen')
    expect(setPaymentStatusAction).toHaveBeenLastCalledWith('demo', 'summer', entry.registration.registration_token, 'open', 'Wieder auf Offen gesetzt.', expect.any(Object))
    await render([entry])
    await search('')
    expect(container.querySelector('.cp-ledger-row')).not.toBeNull()
    expect(container.textContent).toContain('CP-1A2B3C4D wieder auf Offen gesetzt.')
  })

  it('does not show a successful receipt when saving fails', async () => {
    vi.mocked(setPaymentStatusAction).mockResolvedValue({ error: 'Speichern fehlgeschlagen', success: null })
    await render()
    await click('Als bezahlt markieren')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Speichern fehlgeschlagen')
    expect(container.textContent).not.toContain('als bezahlt erfasst')
  })

  it('keeps undo available when reopening fails', async () => {
    await render()
    await click('Als bezahlt markieren')
    await render([paidEntry])
    vi.mocked(setPaymentStatusAction).mockResolvedValue({ error: 'Speichern fehlgeschlagen', success: null })
    await click('Rückgängig: wieder auf Offen')
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('Speichern fehlgeschlagen')
    expect(button('Rückgängig: wieder auf Offen')).toBeDefined()
  })

  it('copies the payment reference', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await render()
    await click('Kopieren')
    expect(writeText).toHaveBeenCalledWith('CP-1A2B3C4D')
    expect(button('Kopiert')).toBeDefined()
  })

  it('requires an honest confirmation before recording an already completed refund', async () => {
    await render([paidEntry])
    await click('Alle1')
    await click('Als erstattet markieren')
    expect(container.textContent).toContain('Bereits erfolgte Rückzahlung als erstattet markieren? CampsPilot überweist kein Geld.')
    expect(setPaymentStatusAction).not.toHaveBeenCalled()
    await click('Als erstattet markieren')
    expect(vi.mocked(setPaymentStatusAction).mock.calls[0].slice(0, 4)).toEqual(['demo', 'summer', entry.registration.registration_token, 'refunded'])
  })
})
