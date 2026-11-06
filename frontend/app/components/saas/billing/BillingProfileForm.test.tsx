// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import BillingProfileForm from './BillingProfileForm'
import { saveBillingProfileAction } from '../actions/billingActions'
import type { BillingProfile } from '../../../lib/saasAdminApi'

vi.mock('../actions/billingActions', () => ({ saveBillingProfileAction: vi.fn() }))

const PROFILE: BillingProfile = {
  legal_name: 'SV Muster e. V.', street: 'Hauptstr. 1', postal_code: '34117', city: 'Kassel',
  tax_number: null, vat_id: 'DE123456789', tax_status: 'kleinunternehmer', default_vat_rate: null,
  tax_exemption_text: null, invoice_number_prefix: 'SV-', invoice_email: 'rechnung@example.com', updated_at: '2026-11-06T10:00:00Z',
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

function selectTax(value: string) {
  const select = container.querySelector<HTMLSelectElement>('#billing_tax_status')!
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

it('zeigt Steuersatz bzw. Befreiungsgrund je nach Steuerstatus', async () => {
  await act(() => root.render(<BillingProfileForm orgSlug="demo" profile={null} />))
  expect(container.textContent).toContain('Trag hier die Daten ein')
  expect(container.querySelector('#billing_default_vat_rate')).not.toBeNull()
  expect(container.querySelector('#billing_tax_exemption_text')).toBeNull()
  await act(async () => selectTax('steuerbefreit'))
  expect(container.querySelector('#billing_default_vat_rate')).toBeNull()
  expect(container.querySelector('#billing_tax_exemption_text')).not.toBeNull()
  await act(async () => selectTax('kleinunternehmer'))
  expect(container.querySelector('#billing_default_vat_rate')).toBeNull()
  expect(container.querySelector('#billing_tax_exemption_text')).toBeNull()
})

it('füllt vorhandene Daten vor und zeigt Feldfehler am Feld', async () => {
  vi.mocked(saveBillingProfileAction).mockResolvedValueOnce({ error: 'Die Postleitzahl hat fünf Ziffern.', field: 'postal_code', saved: false })
  await act(() => root.render(<BillingProfileForm orgSlug="demo" profile={PROFILE} />))
  expect(container.querySelector<HTMLInputElement>('#billing_vat_id')!.value).toBe('DE123456789')
  expect(container.querySelector<HTMLSelectElement>('#billing_tax_status')!.value).toBe('kleinunternehmer')
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
  expect(saveBillingProfileAction).toHaveBeenCalledWith('demo', { error: null, saved: false }, expect.any(FormData))
  const input = container.querySelector('#billing_postal_code')!
  expect(input.getAttribute('aria-invalid')).toBe('true')
  expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1)
})

it('meldet Erfolg', async () => {
  vi.mocked(saveBillingProfileAction).mockResolvedValueOnce({ error: null, saved: true })
  await act(() => root.render(<BillingProfileForm orgSlug="demo" profile={PROFILE} />))
  await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click())
  expect(container.querySelector('[role="status"]')!.textContent).toBe('Rechnungsdaten gespeichert.')
})
