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

it('sends payment_method with a booking to an encoded URL', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ registration_token: 't' }), { status: 201 }))
  vi.stubGlobal('fetch', fetchMock)
  await submitRegistration('club', 'einzel 30/1', { payment_method: 'bar' } as RegistrationCreateInput)
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
  expect(url).toMatch(/\/organizations\/club\/camps\/einzel%2030%2F1\/registrations$/)
  expect(JSON.parse(init.body)).toMatchObject({ payment_method: 'bar' })
})

it.each([
  ['training_session_full', 'full'],
  ['training_session_past', 'past'],
  ['registration_duplicate', 'duplicate'],
])('reports conflict kind for detail.code %s', async (code, kind) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: { code, message: 'Text' } }), { status: 409 })))
  expect(await submitRegistration('club', 's', {} as RegistrationCreateInput)).toMatchObject({ ok: false, status: 409, conflict: kind })
})

it('keeps the classic camp 409 (plain string detail) generic', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ detail: 'Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor.' }), { status: 409 })))
  expect(await submitRegistration('club', 's', {} as RegistrationCreateInput)).toMatchObject({ ok: false, status: 409, conflict: 'unknown' })
})
