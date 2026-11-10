// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PayoutMonth } from '../../../lib/saasAdminApi'
import PayoutSection from './PayoutSection'
import { defaultPayoutReference, euro, germanDate, payoutSummary } from './payoutFormat'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('../../../lib/saasAdminApi', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/saasAdminApi')>(),
  fetchMe: vi.fn(), markPayoutPaidAdmin: vi.fn(),
}))
vi.mock('./payoutActions', () => ({ markPayoutPaidAction: vi.fn(async () => ({ error: null, saved: true })) }))
import { fetchMe, markPayoutPaidAdmin } from '../../../lib/saasAdminApi'

const payouts = (over: Partial<PayoutMonth> = {}): PayoutMonth => ({
  month: '2026-12', paid_cents: 15000, refunded_cents: 2000, fee_cents: 787, payout_cents: 12213,
  iban: 'DE89370400440532013000', changed_since_paid: false, payout: null, carry_over: false, review: [],
  bookings: [
    { date: '2026-12-01', camp_title: 'Sommercamp', amount_cents: 10000, fee_cents: 490 },
    { date: '2026-12-15', camp_title: 'Sommercamp', amount_cents: 5000, fee_cents: 147 },
  ],
  refunds: [{ date: '2026-12-20', camp_title: 'Sommercamp', refund_cents: 2000, fee_returned_cents: 98 }],
  ...over,
})

let container: HTMLDivElement
let root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.clearAllMocks()
})

const render = (p: PayoutMonth | null) =>
  act(() => root.render(<PayoutSection orgSlug="demo" monthKey="2026-12" payouts={p} today="2027-01-05" />))

it('formatiert Beträge, Daten und den Standard-Verwendungszweck', () => {
  expect(euro(12213)).toBe('122,13 €')
  expect(germanDate('2026-12-15')).toBe('15.12.2026')
  expect(defaultPayoutReference('2026-12')).toBe('CampsPilot Auszahlung 12/2026')
  expect(payoutSummary(payouts()).map(r => r.value)).toEqual(['150,00 €', '− 20,00 €', '− 7,87 €', '122,13 €'])
})

it('zeigt Tabelle, Summe, IBAN und den Button „Als überwiesen markieren“', async () => {
  await render(payouts())
  expect(container.querySelector('table')!.querySelectorAll('tbody tr')).toHaveLength(2)
  expect(container.querySelector('[data-testid="payout-total"]')!.textContent).toBe('122,13 €')
  expect(container.textContent).toContain('An den Verein zu überweisen')
  expect(container.querySelector('[data-testid="payout-iban"]')!.textContent).toContain('DE89370400440532013000')
  expect([...container.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Anzeigen', 'Als überwiesen markieren'])
  expect(container.textContent).not.toMatch(/\bSie\b/)
})

it('Erstattungen, Zur Prüfung und Verrechnung mit Folgemonat', async () => {
  await render(payouts({ review: [{ date: '2026-12-04', camp_title: 'Sommercamp', amount_cents: 1000, reason: 'duplicate_payment' }] }))
  expect(container.querySelector('[data-testid="payout-refunds"]')!.textContent).toContain('20.12.2026')
  expect(container.querySelector('[data-testid="payout-review"]')!.textContent).toContain('Doppelzahlung')
  await render(payouts({ bookings: [], paid_cents: 0, fee_cents: -98, payout_cents: -1902, carry_over: true }))
  expect(container.querySelector('[data-testid="payout-carry-over"]')!.textContent).toContain('Verrechnung mit Folgemonat')
  expect(container.textContent).toContain('Verrechnung mit Folgemonat')
  expect([...container.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Anzeigen'])
})

it('laufender Monat: kein Markieren-Button', async () => {
  await act(() => root.render(<PayoutSection orgSlug="demo" monthKey="2027-01" payouts={payouts({ month: '2027-01' })} today="2027-01-05" />))
  expect(container.textContent).toContain('noch nicht abgeschlossen')
  expect([...container.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Anzeigen'])
})

it('bereits markiert: Status statt Button; leerer Monat; Ladefehler', async () => {
  await render(payouts({ payout: { payout_cents: 12213, paid_at: '2027-01-05', reference: 'CampsPilot Auszahlung 12/2026' }, changed_since_paid: true }))
  expect(container.querySelector('[data-testid="payout-done"]')!.textContent).toContain('05.01.2027')
  expect(container.querySelector('[data-testid="payout-done"]')!.textContent).toContain('Betrag hat sich seit der Markierung geändert')
  expect([...container.querySelectorAll('button')].map(b => b.textContent)).toEqual(['Anzeigen'])
  await render(payouts({ bookings: [], refunds: [], paid_cents: 0, refunded_cents: 0, fee_cents: 0, payout_cents: 0 }))
  expect(container.querySelector('[data-testid="payout-empty"]')).not.toBeNull()
  await render(null)
  expect(container.textContent).toContain('nicht abrufbar')
})

it('Server-Action: nur Owner, validiert Datum und Verwendungszweck', async () => {
  const { markPayoutPaidAction: real } = await vi.importActual<typeof import('./payoutActions')>('./payoutActions')
  const form = (v: Record<string, string>) => { const f = new FormData(); for (const [k, x] of Object.entries(v)) f.set(k, x); return f }
  const initial = { error: null, saved: false }
  vi.mocked(fetchMe).mockResolvedValue({ is_platform_owner: true } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(markPayoutPaidAdmin).mockResolvedValue({} as never)
  expect(await real('demo', '2026-12', initial, form({ paid_at: '2027-01-05', reference: 'Zweck' }))).toEqual({ error: null, saved: true })
  expect(markPayoutPaidAdmin).toHaveBeenCalledWith('demo', 'tok', '2026-12', { paid_at: '2027-01-05', reference: 'Zweck' })
  expect((await real('demo', '2026-12', initial, form({ paid_at: 'gestern', reference: 'x' }))).error).toContain('datum')
  expect((await real('demo', '2026-12', initial, form({ paid_at: '2027-01-05', reference: ' ' }))).error).toContain('Verwendungszweck')
  expect((await real('demo', '2026-13', initial, form({ paid_at: '2027-01-05', reference: 'x' }))).error).toContain('Monat')
  vi.mocked(fetchMe).mockResolvedValueOnce({ is_platform_owner: false } as Awaited<ReturnType<typeof fetchMe>>)
  expect((await real('demo', '2026-12', initial, form({ paid_at: '2027-01-05', reference: 'x' }))).error).toContain('Plattform-Betreiber')
  expect(markPayoutPaidAdmin).toHaveBeenCalledTimes(1)
})
