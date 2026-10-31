import { beforeEach, expect, it, vi } from 'vitest'
import { connectStripeAccountAction } from './stripeActions'

vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  fetchMe: vi.fn(), connectStripeAccount: vi.fn(),
}))
import { connectStripeAccount, fetchMe, AdminActionError } from '../../../lib/saasAdminApi'

const form = (id: string) => { const f = new FormData(); f.set('stripe_account_id', id); return f }
const initial = { error: null, result: null }

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue({ is_platform_owner: true } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(connectStripeAccount).mockReset()
})

it('prüft das Format, bevor Stripe gefragt wird', async () => {
  expect((await connectStripeAccountAction('demo', initial, form('kein-konto'))).error).toContain('acct_')
  expect(connectStripeAccount).not.toHaveBeenCalled()
})

it('nur Plattform-Betreiber dürfen verbinden', async () => {
  vi.mocked(fetchMe).mockResolvedValueOnce({ is_platform_owner: false } as Awaited<ReturnType<typeof fetchMe>>)
  expect((await connectStripeAccountAction('demo', initial, form('acct_1234567890abcd'))).error).toContain('Plattform-Betreiber')
  expect(connectStripeAccount).not.toHaveBeenCalled()
})

it('meldet, ob Zahlungen schon aktiv sind', async () => {
  vi.mocked(connectStripeAccount).mockResolvedValueOnce({ configured: true, charges_enabled: true, online_payment_enabled: true })
  expect((await connectStripeAccountAction('demo', initial, form('acct_1234567890abcd'))).result).toContain('aktiv')
  vi.mocked(connectStripeAccount).mockResolvedValueOnce({ configured: true, charges_enabled: false, online_payment_enabled: false })
  expect((await connectStripeAccountAction('demo', initial, form('acct_1234567890abcd'))).result).toContain('noch keine Zahlungen')
  vi.mocked(connectStripeAccount).mockRejectedValueOnce(new AdminActionError('Stripe-Konto nicht gefunden oder nicht mit CampsPilot verbunden.'))
  expect((await connectStripeAccountAction('demo', initial, form('acct_1234567890abcd'))).error).toContain('nicht gefunden')
})
