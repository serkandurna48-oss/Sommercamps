import { beforeEach, expect, it, vi } from 'vitest'
import { createInvoiceAction, refundPaymentAction } from './invoiceActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  refundRegistrationAdmin: vi.fn(), createRegistrationInvoiceAdmin: vi.fn(),
}))
import { AdminActionError, createRegistrationInvoiceAdmin, refundRegistrationAdmin } from '../../../lib/saasAdminApi'

const RID = '11111111-1111-4111-8111-111111111111'
const form = (values: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries({ request_id: RID, ...values })) f.set(k, v)
  return f
}
const initial = { error: null, success: null }

beforeEach(() => vi.mocked(refundRegistrationAdmin).mockReset())

it('Vollerstattung ohne Betrag, Teilerstattung in Cent', async () => {
  vi.mocked(refundRegistrationAdmin).mockResolvedValue({ status: 'succeeded', amount_cents: 1250 })
  expect((await refundPaymentAction('demo', 'tok-1', 5000, initial, form({ mode: 'full' }))).success).toContain('veranlasst')
  expect(refundRegistrationAdmin).toHaveBeenLastCalledWith('demo', 'tok-1', 'tok', RID, null)
  await refundPaymentAction('demo', 'tok-1', 5000, initial, form({ mode: 'partial', amount: '12,50' }))
  expect(refundRegistrationAdmin).toHaveBeenLastCalledWith('demo', 'tok-1', 'tok', RID, 1250)
})

it.each([
  [{ mode: 'partial', amount: '' }, 'Betrag'],
  [{ mode: 'partial', amount: '-3' }, 'Betrag'],
  [{ mode: 'partial', amount: '50,01' }, 'erstattbare Rest'],
  [{ mode: 'full', request_id: 'x' }, 'neu'],
])('prüft Eingaben vor Stripe (%o)', async (values, text) => {
  expect((await refundPaymentAction('demo', 'tok-1', 5000, initial, form(values))).error).toContain(text)
  expect(refundRegistrationAdmin).not.toHaveBeenCalled()
})

it('zeigt die Meldung des Backends', async () => {
  vi.mocked(refundRegistrationAdmin).mockRejectedValueOnce(new AdminActionError('Das Stripe-Guthaben des Vereins reicht nicht.'))
  expect((await refundPaymentAction('demo', 'tok-1', 5000, initial, form({ mode: 'full' }))).error).toContain('Guthaben')
  vi.mocked(createRegistrationInvoiceAdmin).mockRejectedValueOnce(new AdminActionError('Rechnung ausstehend – Rechnungsdaten fehlen.'))
  expect((await createInvoiceAction('demo', 'tok-1', initial)).error).toContain('Rechnungsdaten fehlen')
})
