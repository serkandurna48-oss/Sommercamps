import { beforeEach, expect, it, vi } from 'vitest'
import { addFeeRuleAction, readFeeRule } from './feeActions'
import { formatFeeRule, formatStripeStatus } from './feeFormat'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  fetchMe: vi.fn(), createFeeRuleAdmin: vi.fn(),
}))
import { createFeeRuleAdmin, fetchMe } from '../../../lib/saasAdminApi'

const form = (values: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries({ valid_from: '2027-01-01', ...values })) f.set(k, v)
  return f
}
const initial = { error: null, saved: false }

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue({ is_platform_owner: true } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(createFeeRuleAdmin).mockReset()
})

it('wandelt Prozent und Euro um', async () => {
  expect((await readFeeRule(form({ plan: 'individuell', percent: '5', fixed_eur: '0,25', min_eur: '1' }))).data).toEqual({
    plan: 'individuell', percent: '5.00', fixed_cents: 25, min_fee_cents: 100, valid_from: '2027-01-01', note: null,
  })
  expect((await readFeeRule(form({ plan: 'verein' }))).data?.percent).toBeNull()
  expect((await readFeeRule(form({ plan: 'starter', percent: '4,5' }))).data?.percent).toBe('4.50')
})

it.each([
  [{ plan: 'individuell' }, 'Prozentsatz'],
  [{ plan: 'individuell', percent: '30,5' }, 'zwischen 0 und 30'],
  [{ plan: 'individuell', percent: '5.123' }, 'zwei Nachkommastellen'],
  [{ plan: 'verein', fixed_eur: '-1' }, 'Euro'],
  [{ plan: 'gold' }, 'Paket'],
  [{ plan: 'verein', valid_from: '' }, 'Startdatum'],
])('lehnt ungültige Eingaben ab (%o)', async (values, message) => {
  const state = await addFeeRuleAction('demo', initial, form(values))
  expect(state.error).toContain(message)
  expect(createFeeRuleAdmin).not.toHaveBeenCalled()
})

it('nur Plattform-Betreiber', async () => {
  vi.mocked(fetchMe).mockResolvedValueOnce({ is_platform_owner: false } as Awaited<ReturnType<typeof fetchMe>>)
  expect((await addFeeRuleAction('demo', initial, form({ plan: 'verein' }))).error).toContain('Plattform-Betreiber')
  expect(createFeeRuleAdmin).not.toHaveBeenCalled()
  vi.mocked(createFeeRuleAdmin).mockResolvedValueOnce({} as never)
  expect(await addFeeRuleAction('demo', initial, form({ plan: 'verein' }))).toEqual({ error: null, saved: true })
})

it('formatiert Gebühr und Stripe-Status', () => {
  expect(formatFeeRule({ plan: 'individuell', percent: '5.00', fixed_cents: 25, min_fee_cents: 100 })).toBe('Individuell · 5,00 % + 0,25 € · mind. 1,00 €')
  expect(formatFeeRule({ plan: 'starter', percent: '6.90', fixed_cents: null, min_fee_cents: null })).toBe('Starter · 6,90 %')
  expect(formatStripeStatus(null)).toBe('Status nicht abrufbar')
  expect(formatStripeStatus({
    state: 'active', charges_enabled: true, payouts_enabled: true, details_submitted: true, requirements_due: 0,
    synced_at: null, legacy_account_linked: true, legacy_active: false, online_payment_mode: 'destination', service_ready: true,
  })).toBe('Express aktiv · Altkonto verbunden, inaktiv · Zahlungen über die Plattform')
})
