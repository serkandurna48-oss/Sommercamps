import { afterEach, expect, it, vi } from 'vitest'
import { setPaymentStatusAction } from './paymentActions'
import { cancelRegistrationAction } from './waitlistActions'
import { reviewOrganizationAction } from '../../../platform/(console)/[org]/reviewActions'
import { de } from '../../../lib/i18n/de'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'test-token') }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const initial = { error: null, success: null }
const actions = [
  ['payment', () => setPaymentStatusAction('demo', 'camp', 'public-token', 'paid', 'saved', initial)],
  ['cancel', () => cancelRegistrationAction('demo', 'camp', 'public-token', initial)],
  ['approve', () => {
    const form = new FormData()
    form.set('decision', 'approve')
    return reviewOrganizationAction('demo', { error: null, done: false, decision: null }, form)
  }],
] as const

it.each(actions)('%s exposes the restart message and sends only one request', async (_name, action) => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 503, headers: { 'Retry-After': '1' } })))
  vi.stubGlobal('fetch', fetch)
  const result = action()
  await vi.runAllTimersAsync()
  expect((await result).error).toBe(de.states.serverRestarting)
  expect(fetch).toHaveBeenCalledTimes(1)
})
