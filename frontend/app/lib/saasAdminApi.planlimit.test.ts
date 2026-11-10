import { afterEach, expect, it, vi } from 'vitest'
import { AdminActionError, createCampAdmin, fetchFeeMonthAdmin, PlanCampLimitError, updateCampAdmin } from './saasAdminApi'

afterEach(() => vi.unstubAllGlobals())

const MESSAGE = 'Im Paket Starter ist 1 aktives Camp enthalten. Für weitere Camps wechsle ins Paket Verein.'

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const CAMP = { slug: 's', title: 'T', start_date: '2027-07-05', end_date: '2027-07-09', age_min: 6, age_max: 12, capacity: 5, price_cents: 100 }

it('zeigt beim Veröffentlichen die Meldung des Backends bei 409 plan_camp_limit', async () => {
  stubFetch(409, { detail: { code: 'plan_camp_limit', message: MESSAGE } })
  const error = await updateCampAdmin('demo', 'sommer', 'tok', { status: 'published' }).catch(e => e)
  expect(error).toBeInstanceOf(PlanCampLimitError)
  expect(error).toBeInstanceOf(AdminActionError)
  expect(error.message).toBe(MESSAGE)
})

it('zeigt die Meldung auch beim Anlegen eines veröffentlichten Camps', async () => {
  stubFetch(409, { detail: { code: 'plan_camp_limit', message: MESSAGE } })
  await expect(createCampAdmin('demo', 'tok', { ...CAMP, status: 'published' })).rejects.toThrow(MESSAGE)
})

it('nutzt einen festen Text, wenn das Backend keine Meldung mitschickt', async () => {
  stubFetch(409, { detail: { code: 'plan_camp_limit' } })
  const error = await updateCampAdmin('demo', 'sommer', 'tok', { status: 'published' }).catch(e => e)
  expect(error).toBeInstanceOf(PlanCampLimitError)
  expect(error.message).toBe(MESSAGE)
})

it('behandelt 409 Slug weiterhin als Slug-Konflikt und andere Fehler als allgemeinen Fehler', async () => {
  stubFetch(409, { detail: 'Slug already in use' })
  await expect(createCampAdmin('demo', 'tok', CAMP)).rejects.toMatchObject({ name: 'SlugConflictError' })
  stubFetch(500, { detail: 'x' })
  const error = await updateCampAdmin('demo', 'sommer', 'tok', { title: 'x' }).catch(e => e)
  expect(error).toBeInstanceOf(AdminActionError)
  expect(error).not.toBeInstanceOf(PlanCampLimitError)
})

it('lädt die Monatsübersicht der Gebühren', async () => {
  const fetchMock = stubFetch(200, { month: '2026-03', monthly_fee_cents: 2490, total_cents: 3490 })
  expect((await fetchFeeMonthAdmin('demo org', 'tok', '2026-03')).total_cents).toBe(3490)
  expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/admin/platform/organizations/demo%20org/fees?month=2026-03')
  stubFetch(500, {})
  await expect(fetchFeeMonthAdmin('demo', 'tok', '2026-03')).rejects.toBeInstanceOf(AdminActionError)
})
