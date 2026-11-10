// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { de } from '../../../lib/i18n/de'
import type { RegistrationAdmin, RegistrationInvoices } from '../../../lib/saasAdminApi'
import { loadRegistrationInvoicesAction } from '../actions/invoiceActions'
import ParticipantDetail from '../data/ParticipantDetail'
import InvoiceSection from './InvoiceSection'

vi.mock('../actions/waitlistActions', () => ({
  cancelRegistrationAction: vi.fn(),
  updateRegistrationDetailsAction: vi.fn(),
}))

vi.mock('../actions/invoiceActions', () => ({
  loadRegistrationInvoicesAction: vi.fn(),
  createInvoiceAction: vi.fn(),
}))

const TOKEN = '11111111-1111-4111-8111-111111111111'
const INVOICE_ID = '22222222-2222-4222-8222-222222222222'

function payload(overrides: Partial<RegistrationInvoices> = {}): RegistrationInvoices {
  return {
    invoices: [
      {
        id: INVOICE_ID,
        number: 'KSV-2026-0001',
        kind: 'invoice',
        issue_date: '2026-11-10',
        gross_cents: 14900,
        net_cents: 14900,
        vat_cents: 0,
        recipient_name: 'Max Mustermann',
        description: 'Camp: Sommerwoche (05.07.2027 - 09.07.2027)',
        cancels_number: null,
        registration_token: TOKEN,
        sent_at: null,
        send_error: null,
      },
    ],
    pending_reason: null,
    can_create: false,
    ...overrides,
  }
}

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
  vi.clearAllMocks()
})

async function render() {
  await act(async () => {
    root.render(<InvoiceSection orgSlug="demo-fc" registrationToken={TOKEN} />)
  })
}

describe('InvoiceSection', () => {
  it('shows the invoice number, the amount and a same-origin PDF link', async () => {
    vi.mocked(loadRegistrationInvoicesAction).mockResolvedValue(payload())
    await render()
    const text = container.textContent ?? ''
    expect(text).toContain('KSV-2026-0001')
    expect(text).toContain('149,00')
    expect(text).not.toContain('2018-05-10')
    expect(text).not.toContain('Allergie')
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe(`/pilot/demo-fc/rechnungen/${INVOICE_ID}`)
  })

  it('shows the missing-profile hint and no create button', async () => {
    vi.mocked(loadRegistrationInvoicesAction).mockResolvedValue(
      payload({ invoices: [], pending_reason: 'missing_billing_profile', can_create: true }),
    )
    await render()
    expect(container.textContent).toContain(de.invoices.missingProfile)
    expect(container.querySelector('button')).toBeNull()
  })

  it('offers create when the booking is paid and has no invoice yet', async () => {
    vi.mocked(loadRegistrationInvoicesAction).mockResolvedValue(
      payload({ invoices: [], pending_reason: 'not_created', can_create: true }),
    )
    await render()
    expect(container.querySelector('button')?.textContent).toBe(de.invoices.create)
  })

  it('mounts inside the participant detail once the booking is paid', async () => {
    vi.mocked(loadRegistrationInvoicesAction).mockResolvedValue(payload())
    const registration: RegistrationAdmin = {
      id: 'reg',
      registration_token: TOKEN,
      status: 'registered',
      payment_status: 'paid',
      parent_first_name: 'Max',
      parent_last_name: 'Mustermann',
      parent_email: 'max@example.com',
      parent_phone: '123',
      child_first_name: 'Ayşe',
      child_last_name: 'Geheim',
      child_birth_date: '2018-05-10',
      emergency_contact_name: null,
      emergency_contact_phone: null,
      medical_notes: null,
      allergies: 'Nüsse',
      jersey_size: null,
      pickup_authorized: null,
      photo_permission: false,
      created_at: '2026-11-01T00:00:00Z',
    }
    await act(async () => {
      root.render(
        <ParticipantDetail
          registration={registration}
          orgSlug="demo-fc"
          campSlug="sommer"
          brandStrong="#123456"
          brandOn="#ffffff"
        />,
      )
    })
    const section = container.querySelector('section[aria-label="Rechnung"]')
    const text = section?.textContent ?? ''
    expect(text).toContain('KSV-2026-0001')
    expect(text).not.toContain('Nüsse')
    expect(text).not.toContain('2018-05-10')
    expect(text).not.toContain('Geheim')
  })
})
