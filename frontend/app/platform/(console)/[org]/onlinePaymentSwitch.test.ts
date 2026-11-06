import { beforeEach, expect, it, vi } from 'vitest'
import { setOnlinePaymentEnabledAction } from './stripeActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  fetchMe: vi.fn(), setOnlinePaymentEnabledAdmin: vi.fn(),
}))
import { fetchMe, setOnlinePaymentEnabledAdmin } from '../../../lib/saasAdminApi'

const initial = { error: null, saved: false }

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue({ is_platform_owner: true } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(setOnlinePaymentEnabledAdmin).mockReset()
})

it('schaltet Online-Zahlung je Verein um (nur Plattform-Betreiber)', async () => {
  vi.mocked(setOnlinePaymentEnabledAdmin).mockResolvedValueOnce({} as never)
  expect(await setOnlinePaymentEnabledAction('demo', true, initial)).toEqual({ error: null, saved: true })
  expect(setOnlinePaymentEnabledAdmin).toHaveBeenCalledWith('demo', 'tok', true)
  vi.mocked(fetchMe).mockResolvedValueOnce({ is_platform_owner: false } as Awaited<ReturnType<typeof fetchMe>>)
  expect((await setOnlinePaymentEnabledAction('demo', false, initial)).error).toContain('Plattform-Betreiber')
  expect(setOnlinePaymentEnabledAdmin).toHaveBeenCalledTimes(1)
})
