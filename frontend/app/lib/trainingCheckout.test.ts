import { beforeEach, expect, it, vi } from 'vitest'

vi.mock('./saasApi', () => ({ createStripeCheckout: vi.fn() }))

import { createStripeCheckout } from './saasApi'
import { redirectToTrainingCheckout } from './trainingCheckout'

beforeEach(() => { vi.mocked(createStripeCheckout).mockReset() })

it('redirects to the checkout url with the session slug and the registration token only', async () => {
  vi.mocked(createStripeCheckout).mockResolvedValue('https://checkout.stripe.com/c/pay/x')
  const assign = vi.fn()
  expect(await redirectToTrainingCheckout('verein', 'einzel-1', 'tok-1', assign)).toBe(true)
  expect(createStripeCheckout).toHaveBeenCalledWith('verein', 'einzel-1', 'tok-1')
  expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/x')
})

it('returns false and does not redirect when checkout fails', async () => {
  vi.mocked(createStripeCheckout).mockRejectedValue(new Error('down'))
  const assign = vi.fn()
  expect(await redirectToTrainingCheckout('verein', 'einzel-1', 'tok-1', assign)).toBe(false)
  expect(assign).not.toHaveBeenCalled()
})
