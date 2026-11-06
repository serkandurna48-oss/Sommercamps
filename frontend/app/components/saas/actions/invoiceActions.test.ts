import { beforeEach, expect, it, vi } from 'vitest'
import { createInvoiceAction, generatePendingInvoicesAction, refundPaymentAction } from './invoiceActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  refundRegistrationAdmin: vi.fn(), createRegistrationInvoiceAdmin: vi.fn(), generatePendingInvoicesAdmin: vi.fn(),
}))
import { AdminActionError, createRegistrationInvoiceAdmin, generatePendingInvoicesAdmin, refundRegistrationAdmin } from '../../../lib/saasAdminApi'

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

it('Rechnungen erzeugen: Ergebnis, Rest und Fehler', async () => {
  vi.mocked(generatePendingInvoicesAdmin).mockResolvedValueOnce({ created: 2, stornos: 1, blocked: 0, failed: 0, remaining: 4 })
  expect((await generatePendingInvoicesAction('demo', initial)).success).toBe('2 Rechnungen erstellt, 1 Stornorechnung erstellt. Noch 4 offen – klick bitte noch einmal auf „Rechnungen erzeugen“.')
  vi.mocked(generatePendingInvoicesAdmin).mockResolvedValueOnce({ created: 0, stornos: 0, blocked: 0, failed: 1, remaining: 1 })
  expect((await generatePendingInvoicesAction('demo', initial)).error).toContain('1 Rechnung konnte nicht erzeugt werden')
  vi.mocked(generatePendingInvoicesAdmin).mockResolvedValueOnce({ created: 0, stornos: 0, blocked: 0, failed: 0, remaining: 0 })
  expect((await generatePendingInvoicesAction('demo', initial)).success).toBe('Offene E-Mails gesendet.')
})
