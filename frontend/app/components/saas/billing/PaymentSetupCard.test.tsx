// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import PaymentSetupCard from './PaymentSetupCard'
import type { StripePaymentStatus } from '../../../lib/saasAdminApi'
import { startStripeOnboardingAction, syncStripeStatusAction } from '../actions/billingActions'

vi.mock('../actions/billingActions', () => ({ startStripeOnboardingAction: vi.fn(), syncStripeStatusAction: vi.fn() }))

const status = (over: Partial<StripePaymentStatus> = {}): StripePaymentStatus => ({
  state: 'not_set_up', platform_enabled: true, charges_enabled: false, payouts_enabled: false, details_submitted: false,
  requirements_due: 0, synced_at: null, legacy_account_linked: false, legacy_active: false,
  online_payment_mode: null, service_ready: true, ...over,
})

let container: HTMLDivElement
let root: Root
const assign = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  vi.stubGlobal('location', { ...window.location, assign })
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

const buttons = () => [...container.querySelectorAll('button')].map(b => b.textContent)

it('nicht eingerichtet: Einrichten-Button mit Rechtsform, kein Status-Prüfen', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status()} />))
  expect(container.querySelector('[data-testid="payment-state"]')!.textContent).toBe('Nicht eingerichtet')
  expect(buttons()).toEqual(['Online-Zahlung einrichten'])
  expect(container.querySelector('select[name="business_type"]')).not.toBeNull()
  expect(container.textContent).toContain('richtest du einmalig')
  expect(container.textContent).not.toMatch(/\bSie\b/)
})

it('Angaben fehlen: fortsetzen und Status prüfen', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ state: 'incomplete', requirements_due: 2 })} />))
  expect(container.querySelector('[data-testid="payment-state"]')!.textContent).toBe('Angaben fehlen')
  expect(buttons()).toEqual(['Einrichtung fortsetzen', 'Status prüfen'])
  expect(container.textContent).toContain('(2 offen)')
  expect(container.querySelector('select[name="business_type"]')).toBeNull()
})

it('aktiv: nur Status prüfen; Hinweis auf altes Konto', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ state: 'active', charges_enabled: true, payouts_enabled: true, legacy_account_linked: true, legacy_active: true })} />))
  expect(container.querySelector('[data-testid="payment-state"]')!.textContent).toBe('Aktiv')
  expect(buttons()).toEqual(['Status prüfen'])
  expect(container.querySelector('[data-testid="legacy-notice"]')!.textContent).toContain('nicht mehr genutzt')
})

it('Altkonto aktiv, Express noch nicht: Zahlungen laufen weiter über das alte Konto', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ legacy_account_linked: true, legacy_active: true, online_payment_mode: 'direct' })} />))
  expect(container.querySelector('[data-testid="legacy-notice"]')!.textContent).toContain('noch über dein bisher verbundenes')
})

it('Umgebung nicht freigeschaltet: keine Buttons', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ service_ready: false })} />))
  expect(buttons()).toEqual([])
  expect(container.textContent).toContain('noch nicht freigeschaltet')
})

it('leitet nach dem Start zu Stripe weiter, Fehler wird angezeigt', async () => {
  vi.mocked(startStripeOnboardingAction).mockResolvedValueOnce({ error: null, url: 'https://connect.stripe.com/setup/e/x' })
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status()} />))
  await act(async () => container.querySelector('button')!.click())
  expect(startStripeOnboardingAction).toHaveBeenCalledWith('demo', { error: null }, expect.any(FormData))
  expect(assign).toHaveBeenCalledWith('https://connect.stripe.com/setup/e/x')
})

it('zeigt Fehler beim Start und beim Prüfen', async () => {
  vi.mocked(startStripeOnboardingAction).mockResolvedValueOnce({ error: 'Stripe nicht erreichbar.' })
  vi.mocked(syncStripeStatusAction).mockResolvedValueOnce({ error: 'Prüfen fehlgeschlagen.' })
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ state: 'incomplete' })} />))
  const [start, check] = container.querySelectorAll('button')
  await act(async () => start.click())
  await act(async () => check.click())
  const alerts = [...container.querySelectorAll('[role="alert"]')].map(a => a.textContent)
  expect(alerts).toEqual(['Stripe nicht erreichbar.', 'Prüfen fehlgeschlagen.'])
  expect(assign).not.toHaveBeenCalled()
})

it('ohne Status: Ladefehler', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={null} />))
  expect(container.querySelector('[role="alert"]')!.textContent).toContain('nicht geladen')
})

it('wartet auf Freigabe: keine Einrichten-Buttons, Hinweis auf CampsPilot', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status({ state: 'awaiting_approval', platform_enabled: false, charges_enabled: true, details_submitted: true })} />))
  expect(container.querySelector('[data-testid="payment-state"]')!.textContent).toBe('Wartet auf Freigabe')
  expect(buttons()).toEqual(['Status prüfen'])
  expect(container.textContent).toContain('schaltet die Online-Zahlung für deinen Verein jetzt noch frei')
})

it('nennt die Plattformgebühr im Einrichtungstext', async () => {
  await act(() => root.render(<PaymentSetupCard orgSlug="demo" status={status()} />))
  expect(container.textContent).toContain('abzüglich der vereinbarten Plattformgebühr')
})
