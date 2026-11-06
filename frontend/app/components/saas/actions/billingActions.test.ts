import { beforeEach, expect, it, vi } from 'vitest'
import { readBillingProfile, saveBillingProfileAction, startStripeOnboardingAction, syncStripeStatusAction } from './billingActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  saveBillingProfileAdmin: vi.fn(), startStripeOnboardingAdmin: vi.fn(), syncStripePaymentStatusAdmin: vi.fn(),
}))
import { getValidAccessToken } from '../../../lib/supabaseServer'
import { BillingValidationError, saveBillingProfileAdmin, startStripeOnboardingAdmin, syncStripePaymentStatusAdmin } from '../../../lib/saasAdminApi'

const VALID = {
  legal_name: 'SV Muster e. V.', street: 'Hauptstr. 1', postal_code: '34117', city: 'Kassel',
  tax_number: '026 123 45678', vat_id: '', tax_status: 'ust_pflichtig', default_vat_rate: '19',
  tax_exemption_text: 'wird ignoriert', invoice_number_prefix: 'sv-', invoice_email: 'rechnung@example.com',
}
const form = (over: Record<string, string> = {}) => {
  const f = new FormData()
  for (const [k, v] of Object.entries({ ...VALID, ...over })) f.set(k, v)
  return f
}
const initial = { error: null, saved: false }

beforeEach(() => {
  vi.mocked(saveBillingProfileAdmin).mockReset()
  vi.mocked(getValidAccessToken).mockResolvedValue('tok')
})

it('liest das Formular in die API-Form (Präfix groß, Steuerfelder je Status)', async () => {
  const { data } = await readBillingProfile(form({ vat_id: 'de 123456789' }))
  expect(data).toMatchObject({ invoice_number_prefix: 'SV-', default_vat_rate: 19, tax_exemption_text: null, vat_id: 'DE123456789' })
  const klein = await readBillingProfile(form({ tax_status: 'kleinunternehmer' }))
  expect(klein.data?.default_vat_rate).toBeNull()
  const frei = await readBillingProfile(form({ tax_status: 'steuerbefreit', tax_number: '', tax_exemption_text: 'Steuerfrei nach § 4 Nr. 22 UStG' }))
  expect(frei.data).toMatchObject({ default_vat_rate: null, tax_number: null, tax_exemption_text: 'Steuerfrei nach § 4 Nr. 22 UStG' })
})

it.each([
  [{ postal_code: '3411' }, 'postal_code'],
  [{ default_vat_rate: '' }, 'default_vat_rate'],
  [{ tax_number: '', vat_id: '' }, 'tax_number'],
  [{ tax_status: 'steuerbefreit', tax_exemption_text: '' }, 'tax_exemption_text'],
  [{ invoice_number_prefix: 'R E' }, 'invoice_number_prefix'],
  [{ tax_status: 'irgendwas' }, 'tax_status'],
])('meldet fehlende Pflichtangaben mit Feld (%o)', async (over, field) => {
  const state = await saveBillingProfileAction('demo', initial, form(over))
  expect(state.field).toBe(field)
  expect(state.saved).toBe(false)
  expect(saveBillingProfileAdmin).not.toHaveBeenCalled()
})

it('speichert und gibt Backend-Feldfehler weiter', async () => {
  vi.mocked(saveBillingProfileAdmin).mockResolvedValueOnce({} as never)
  expect(await saveBillingProfileAction('demo', initial, form())).toEqual({ error: null, saved: true })
  expect(saveBillingProfileAdmin).toHaveBeenCalledWith('demo', 'tok', expect.objectContaining({ legal_name: 'SV Muster e. V.' }))
  vi.mocked(saveBillingProfileAdmin).mockRejectedValueOnce(new BillingValidationError('Bitte prüfe die markierten Angaben.', 'invoice_email'))
  expect(await saveBillingProfileAction('demo', initial, form())).toMatchObject({ field: 'invoice_email', saved: false })
})

it('ohne Sitzung nichts speichern, du-Ansprache', async () => {
  vi.mocked(getValidAccessToken).mockResolvedValueOnce(null)
  const state = await saveBillingProfileAction('demo', initial, form())
  expect(state.error).toContain('melde dich')
  expect(saveBillingProfileAdmin).not.toHaveBeenCalled()
})

it('Stripe-Einrichtung: Rechtsform und Link', async () => {
  vi.mocked(startStripeOnboardingAdmin).mockResolvedValueOnce('https://connect.stripe.com/setup/e/x')
  const f = new FormData(); f.set('business_type', 'company')
  expect(await startStripeOnboardingAction('demo', { error: null }, f)).toEqual({ error: null, url: 'https://connect.stripe.com/setup/e/x' })
  expect(startStripeOnboardingAdmin).toHaveBeenCalledWith('demo', 'tok', 'company')
  vi.mocked(startStripeOnboardingAdmin).mockResolvedValueOnce('https://connect.stripe.com/setup/e/y')
  await startStripeOnboardingAction('demo', { error: null }, new FormData())
  expect(startStripeOnboardingAdmin).toHaveBeenLastCalledWith('demo', 'tok', 'non_profit')
})

it('Status prüfen', async () => {
  vi.mocked(syncStripePaymentStatusAdmin).mockResolvedValueOnce({} as never)
  expect(await syncStripeStatusAction('demo', { error: null })).toEqual({ error: null, checked: true })
  vi.mocked(syncStripePaymentStatusAdmin).mockRejectedValueOnce(new Error('x'))
  expect((await syncStripeStatusAction('demo', { error: null })).error).toBeTruthy()
})
