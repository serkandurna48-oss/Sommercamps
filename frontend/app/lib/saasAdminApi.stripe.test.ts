import { afterEach, expect, it, vi } from 'vitest'
import { startStripeOnboardingAdmin } from './saasAdminApi'

afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))
}

it('akzeptiert Onboarding-Links von v1 (connect.stripe.com) und v2 (accounts.stripe.com)', async () => {
  stubFetch(200, { url: 'https://accounts.stripe.com/r/acct_1#alu_test_x' })
  expect(await startStripeOnboardingAdmin('ksv', 'tok', 'non_profit')).toBe('https://accounts.stripe.com/r/acct_1#alu_test_x')
  stubFetch(200, { url: 'https://connect.stripe.com/setup/e/x' })
  expect(await startStripeOnboardingAdmin('ksv', 'tok', 'company')).toBe('https://connect.stripe.com/setup/e/x')
})

it('lehnt fremde Links ab und zeigt Stripes Grund bei 409', async () => {
  stubFetch(200, { url: 'https://accounts.stripe.com.evil.example/r' })
  await expect(startStripeOnboardingAdmin('ksv', 'tok', 'non_profit')).rejects.toThrow('Stripe hat keinen gültigen Link geliefert.')
  stubFetch(409, { detail: 'Stripe hat die Einrichtung abgelehnt: platform profile' })
  await expect(startStripeOnboardingAdmin('ksv', 'tok', 'non_profit')).rejects.toThrow('Stripe hat die Einrichtung abgelehnt: platform profile')
})
