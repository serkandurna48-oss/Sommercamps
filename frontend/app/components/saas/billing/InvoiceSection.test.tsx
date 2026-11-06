// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import InvoiceSection from './InvoiceSection'
import InvoiceList from './InvoiceList'
import PendingInvoicesNotice from './PendingInvoicesNotice'
import type { Invoice, RegistrationInvoices } from '../../../lib/saasAdminApi'
import {
  createInvoiceAction, generatePendingInvoicesAction, loadRegistrationInvoicesAction, refundPaymentAction, resendInvoiceAction,
} from '../actions/invoiceActions'

vi.mock('../actions/invoiceActions', () => ({
  loadRegistrationInvoicesAction: vi.fn(), resendInvoiceAction: vi.fn(), createInvoiceAction: vi.fn(),
  refundPaymentAction: vi.fn(), generatePendingInvoicesAction: vi.fn(),
}))

const TOKEN = '11111111-1111-4111-8111-111111111111'
const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: '22222222-2222-4222-8222-222222222222', number: 'TV-2026-0001', kind: 'invoice', issue_date: '2026-11-07',
  gross_cents: 14900, net_cents: 12521, vat_cents: 2379, recipient_name: 'Max Muster', description: 'Camp: Sommer',
  cancels_number: null, registration_token: TOKEN, sent_at: '2026-11-07T10:00:00Z', send_error: null, ...over,
})
const data = (over: Partial<RegistrationInvoices> = {}): RegistrationInvoices => ({
  invoices: [invoice()], pending_reason: null, can_create: false, refund: { possible: false, remaining_cents: 0 }, ...over,
})

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

async function render(value: RegistrationInvoices | null) {
  vi.mocked(loadRegistrationInvoicesAction).mockResolvedValue(value)
  await act(async () => root.render(<InvoiceSection orgSlug="demo" registrationToken={TOKEN} />))
}
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent === label)!

it('zeigt Rechnungen mit Download und erneutem Senden', async () => {
  vi.mocked(resendInvoiceAction).mockResolvedValue({ error: null, success: 'TV-2026-0001 wurde erneut gesendet.' })
  await render(data({ invoices: [invoice(), invoice({ id: '33333333-3333-4333-8333-333333333333', number: 'TV-2026-0002', kind: 'storno', gross_cents: -14900, sent_at: null, send_error: 'http_500' })] }))
  expect(loadRegistrationInvoicesAction).toHaveBeenCalledWith('demo', TOKEN)
  const links = [...container.querySelectorAll('a[download]')].map(a => a.getAttribute('href'))
  expect(links).toEqual(['/pilot/demo/rechnungen/22222222-2222-4222-8222-222222222222', '/pilot/demo/rechnungen/33333333-3333-4333-8333-333333333333'])
  expect(container.textContent).toContain('Storno TV-2026-0002')
  expect(container.textContent).toContain('Versand fehlgeschlagen')
  expect(container.textContent).toContain('149,00')
  await act(async () => [...container.querySelectorAll('button')][0].click())
  expect(resendInvoiceAction).toHaveBeenCalledWith('demo', '22222222-2222-4222-8222-222222222222', { error: null, success: null })
  expect(container.querySelector('[role="status"]')!.textContent).toContain('erneut gesendet')
})

it('Rechnungsdaten fehlen: Hinweis und Rechnung erstellen', async () => {
  vi.mocked(createInvoiceAction).mockResolvedValue({ error: null, success: 'Rechnung TV-2026-0001 erstellt und an die Familie gesendet.' })
  await render(data({ invoices: [], pending_reason: 'missing_billing_profile', can_create: true }))
  expect(container.textContent).toContain('Rechnung ausstehend – Rechnungsdaten fehlen')
  expect(container.querySelector('a[href="/pilot/demo/konfiguration#rechnungsdaten"]')).not.toBeNull()
  await act(async () => button('Rechnung erstellen').click())
  expect(createInvoiceAction).toHaveBeenCalledWith('demo', TOKEN, { error: null, success: null })
  expect(loadRegistrationInvoicesAction).toHaveBeenCalledTimes(2)  // reloaded
})

it('Erstattung: komplett mit Rückfrage, Teilbetrag mit Betragsfeld', async () => {
  vi.mocked(refundPaymentAction).mockResolvedValue({ error: null, success: 'Erstattung über 149,00 € ist veranlasst.' })
  await render(data({ refund: { possible: true, remaining_cents: 14900 } }))
  expect(container.textContent).toContain('Komplett (149,00')
  expect(container.querySelector('input[name="amount"]')).toBeNull()
  const requestId = container.querySelector<HTMLInputElement>('input[name="request_id"]')!.value
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/)
  await act(async () => button('Erstatten').click())
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('149,00'))
  expect(refundPaymentAction).toHaveBeenCalledWith('demo', TOKEN, 14900, { error: null, success: null }, expect.any(FormData))
  const sent = vi.mocked(refundPaymentAction).mock.calls[0][4] as FormData
  expect(sent.get('mode')).toBe('full')
  expect(sent.get('request_id')).toBe(requestId)
  // A new refund intent gets a new request id.
  expect(container.querySelector<HTMLInputElement>('input[name="request_id"]')!.value).not.toBe(requestId)

  await act(async () => container.querySelector<HTMLInputElement>('input[value="partial"]')!.click())
  expect(container.querySelector('input[name="amount"]')).not.toBeNull()
})

it('Erstattung abgebrochen: nichts passiert', async () => {
  vi.mocked(window.confirm).mockReturnValue(false)
  await render(data({ refund: { possible: true, remaining_cents: 5000 } }))
  await act(async () => button('Erstatten').click())
  expect(refundPaymentAction).not.toHaveBeenCalled()
})

it('ohne Online-Zahlung keine Erstattung; Ladefehler sichtbar', async () => {
  await render(data())
  expect(container.textContent).not.toContain('Erstatten')
  await act(() => root.unmount())
  root = createRoot(container)
  await render(null)
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('nicht geladen')
})

it('Rechnungsliste unter Zahlungen', () => {
  const html = renderToStaticMarkup(<InvoiceList orgSlug="demo" data={{
    billing_profile_complete: false,
    invoices: [invoice(), invoice({ id: '44444444-4444-4444-8444-444444444444', number: 'TV-2026-0002', kind: 'storno', cancels_number: 'TV-2026-0001', gross_cents: -5000, sent_at: null })],
    pending: [{ registration_token: TOKEN, camp_title: 'Sommer', reason: 'missing_billing_profile' }],
  }} />)
  expect(html).toContain('1 Rechnung ausstehend')
  expect(html).toContain('Storno zu TV-2026-0001')
  expect(html).toContain('href="/pilot/demo/rechnungen/44444444-4444-4444-8444-444444444444"')
  expect(html).toContain('Nicht gesendet')
  expect(renderToStaticMarkup(<InvoiceList orgSlug="demo" data={null} />)).toContain('nicht geladen')
  expect(renderToStaticMarkup(<InvoiceList orgSlug="demo" data={{ billing_profile_complete: true, invoices: [], pending: [] }} />)).toContain('entstehen automatisch')
})

it('Einstellungen: ausstehende Rechnungen erst nach vollständigen Rechnungsdaten erzeugen', async () => {
  vi.mocked(generatePendingInvoicesAction).mockResolvedValue({ error: null, success: '2 Rechnungen erstellt und gesendet.' })
  await act(async () => root.render(<PendingInvoicesNotice orgSlug="demo" count={2} profileComplete={false} />))
  expect(container.textContent).toContain('2 Rechnungen sind ausstehend')
  expect(container.querySelector('button')).toBeNull()
  await act(async () => root.render(<PendingInvoicesNotice orgSlug="demo" count={2} profileComplete />))
  await act(async () => container.querySelector('button')!.click())
  expect(generatePendingInvoicesAction).toHaveBeenCalledWith('demo', { error: null, success: null })
  expect(container.querySelector('[role="status"]')!.textContent).toBe('2 Rechnungen erstellt und gesendet.')
})
