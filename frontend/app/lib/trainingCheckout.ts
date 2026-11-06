import { createStripeCheckout } from './saasApi'

/**
 * Same checkout path as camps (createStripeCheckout -> Stripe-hosted page).
 * Resolves true when the browser was sent to Stripe, false on any failure; the
 * caller then keeps the booking screen and offers a retry. Never sends child data.
 */
export async function redirectToTrainingCheckout(
  orgSlug: string,
  sessionSlug: string,
  registrationToken: string,
  assign: (url: string) => void = (url) => window.location.assign(url),
): Promise<boolean> {
  try {
    assign(await createStripeCheckout(orgSlug, sessionSlug, registrationToken))
    return true
  } catch {
    return false
  }
}
