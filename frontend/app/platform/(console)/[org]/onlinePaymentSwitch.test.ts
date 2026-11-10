import { beforeEach, expect, it, vi } from 'vitest'
import { setOnlinePaymentEnabledAction, setPaymentRouteAction } from './stripeActions'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  fetchMe: vi.fn(), setOnlinePaymentEnabledAdmin: vi.fn(), setPaymentRouteAdmin: vi.fn(),
}))
import { fetchMe, setOnlinePaymentEnabledAdmin, setPaymentRouteAdmin } from '../../../lib/saasAdminApi'

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

it('Zahlungsweg: nur Plattform-Betreiber, nur platform oder connect', async () => {
  const form = (route: string) => { const f = new FormData(); f.set('route', route); return f }
  vi.mocked(setPaymentRouteAdmin).mockResolvedValue({} as never)
  expect(await setPaymentRouteAction('demo', initial, form('connect'))).toEqual({ error: null, saved: true })
  expect(setPaymentRouteAdmin).toHaveBeenCalledWith('demo', 'tok', 'connect')
  expect((await setPaymentRouteAction('demo', initial, form('x'))).error).toContain('Zahlungsweg')
  vi.mocked(fetchMe).mockResolvedValueOnce({ is_platform_owner: false } as Awaited<ReturnType<typeof fetchMe>>)
  expect((await setPaymentRouteAction('demo', initial, form('platform'))).error).toContain('Plattform-Betreiber')
  expect(setPaymentRouteAdmin).toHaveBeenCalledTimes(1)
})
