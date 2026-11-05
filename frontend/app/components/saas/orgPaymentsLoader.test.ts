import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthError } from '../../lib/saasAdminApi'
import { loadOrgPaymentsData } from './orgAdminData'

const api = vi.hoisted(() => ({
  fetchCampsAdmin: vi.fn(), fetchOrganizationAdmin: vi.fn(), fetchRegistrationsAdmin: vi.fn(),
  fetchTrainingOffersAdmin: vi.fn(), fetchTrainingSessionsAdmin: vi.fn(), fetchSessionRegistrationsAdmin: vi.fn(),
}))
vi.mock('../../lib/saasAdminApi', async importOriginal => ({ ...(await importOriginal<object>()), ...api }))
vi.mock('../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
}))

const session = (id: string, status: string, booked = 1) => ({
  id, offer_id: 'o1', slug: `s-${id}`, status, starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-01T11:00:00Z',
  local_date: '2020-01-01', local_time: '11:00', capacity: 1, booked_count: booked, free_spots: 0,
  price_member_cents: 1, price_nonmember_cents: 2, age_min: 4, age_max: 18, location: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchOrganizationAdmin.mockResolvedValue({ slug: 'demo' })
  api.fetchCampsAdmin.mockResolvedValue([])
  api.fetchTrainingOffersAdmin.mockResolvedValue([{ id: 'o1', title: 'Einzel' }])
  api.fetchSessionRegistrationsAdmin.mockResolvedValue([{ id: 'r' }])
})

describe('loadOrgPaymentsData', () => {
  it('nimmt vergangene und archivierte Termine mit, überspringt nur leere Entwürfe', async () => {
    api.fetchTrainingSessionsAdmin.mockResolvedValue([
      session('past', 'published'), session('arch', 'archived'), session('closed', 'closed'),
      session('draft', 'draft', 0), session('draftBooked', 'draft', 1),
    ])
    const data = await loadOrgPaymentsData('demo')
    expect(data.trainingPaymentsError).toBe(false)
    expect(data.trainingPayments.map(g => g.camp.id)).toEqual(['past', 'arch', 'closed', 'draftBooked'])
  })

  it('lässt Termine ohne Buchungen weg', async () => {
    api.fetchTrainingSessionsAdmin.mockResolvedValue([session('a', 'published')])
    api.fetchSessionRegistrationsAdmin.mockResolvedValue([])
    expect((await loadOrgPaymentsData('demo')).trainingPayments).toEqual([])
  })

  it('begrenzt gleichzeitige Anfragen pro Termin auf 5', async () => {
    api.fetchTrainingSessionsAdmin.mockResolvedValue(Array.from({ length: 12 }, (_, i) => session(`s${i}`, 'published')))
    let running = 0
    let peak = 0
    api.fetchSessionRegistrationsAdmin.mockImplementation(async () => {
      running++; peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 1))
      running--
      return [{ id: 'r' }]
    })
    expect((await loadOrgPaymentsData('demo')).trainingPayments).toHaveLength(12)
    expect(peak).toBeLessThanOrEqual(5)
  })

  it('degradiert bei Trainingsfehler: Camps bleiben, Fehlerhinweis gesetzt', async () => {
    api.fetchTrainingOffersAdmin.mockRejectedValue(new Error('boom'))
    const data = await loadOrgPaymentsData('demo')
    expect(data.trainingPayments).toEqual([])
    expect(data.trainingPaymentsError).toBe(true)
    expect(data.camps).toEqual([])
  })

  it('degradiert auch, wenn ein einzelner Termin scheitert', async () => {
    api.fetchTrainingSessionsAdmin.mockResolvedValue([session('a', 'published')])
    api.fetchSessionRegistrationsAdmin.mockRejectedValue(new Error('boom'))
    expect((await loadOrgPaymentsData('demo')).trainingPaymentsError).toBe(true)
  })

  it('leitet bei Auth-Fehler zum Login um', async () => {
    api.fetchTrainingOffersAdmin.mockRejectedValue(new AdminAuthError())
    await expect(loadOrgPaymentsData('demo')).rejects.toThrow('redirect:/pilot/demo/login')
  })
})
