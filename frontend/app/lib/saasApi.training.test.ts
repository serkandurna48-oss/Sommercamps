import { afterEach, expect, it, vi } from 'vitest'
import { fetchTrainingOffer, fetchTrainingOffers, submitRegistration, type RegistrationCreateInput } from './saasApi'

afterEach(() => vi.unstubAllGlobals())

it('loads the published offers of an organization without caching', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ slug: 'einzel-30' }]), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await fetchTrainingOffers('club')).toEqual([{ slug: 'einzel-30' }])
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/v1\/organizations\/club\/training-offers$/), { cache: 'no-store' })
})

it('loads one offer with its sessions and returns null for an unknown slug', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ slug: 'einzel-30', sessions: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await fetchTrainingOffer('club', 'einzel-30')).toMatchObject({ slug: 'einzel-30' })
  expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/organizations\/club\/training-offers\/einzel-30$/), { cache: 'no-store' })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  expect(await fetchTrainingOffer('club', 'nope')).toBeNull()
})

it('throws on other upstream errors so the page can show a load error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
  await expect(fetchTrainingOffers('club')).rejects.toThrow()
  await expect(fetchTrainingOffer('club', 'x')).rejects.toThrow()
})

it('sends payment_method with a booking and reports the conflict kind', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ detail: 'Dieser Trainingstermin ist leider bereits belegt.' }), { status: 409 }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await submitRegistration('club', 'einzel-30-1', { payment_method: 'bar' } as RegistrationCreateInput)
  expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)).toMatchObject({ payment_method: 'bar' })
  expect(result).toMatchObject({ ok: false, status: 409, conflict: 'full' })
})
