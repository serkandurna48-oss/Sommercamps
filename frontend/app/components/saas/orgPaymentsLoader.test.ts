import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthError } from '../../lib/saasAdminApi'
import { loadOrgPaymentsData, loadTrainingPayments } from './orgAdminData'

const api = vi.hoisted(() => ({
  fetchCampsAdmin: vi.fn(), fetchOrganizationAdmin: vi.fn(), fetchRegistrationsAdmin: vi.fn(), fetchTrainingPaymentsAdmin: vi.fn(),
  fetchTrainingOffersAdmin: vi.fn(), fetchTrainingSessionsAdmin: vi.fn(), fetchSessionRegistrationsAdmin: vi.fn(),
}))
vi.mock('../../lib/saasAdminApi', async importOriginal => ({ ...(await importOriginal<object>()), ...api }))
vi.mock('../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
}))

const session = (id: string, status: string) => ({
  id, offer_id: 'o1', slug: `s-${id}`, status, starts_at: '2020-01-01T10:00:00Z', ends_at: '2020-01-01T11:00:00Z',
  local_date: '2020-01-01', local_time: '11:00', capacity: 1, booked_count: 1, free_spots: 0,
  price_member_cents: 1, price_nonmember_cents: 2, age_min: 4, age_max: 18, location: null,
})
const offer = { id: 'o1', title: 'Einzel', kind: 'einzel', status: 'published' }
const group = (id: string, status = 'published', registrations = [{ id: `r-${id}` }]) => ({ offer, session: session(id, status), registrations })

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchOrganizationAdmin.mockResolvedValue({ slug: 'demo' })
  api.fetchCampsAdmin.mockResolvedValue([])
  api.fetchTrainingPaymentsAdmin.mockResolvedValue([])
})

describe('loadOrgPaymentsData', () => {
  it('lädt Trainingszahlungen mit genau einer Anfrage, ohne Angebots-, Termin- oder Buchungslisten', async () => {
    api.fetchTrainingPaymentsAdmin.mockResolvedValue([group('past'), group('arch', 'archived'), group('closed', 'closed'), group('draftBooked', 'draft')])
    const data = await loadOrgPaymentsData('demo')
    expect(data.trainingPaymentsError).toBe(false)
    expect(data.trainingPayments.map(g => g.camp.id)).toEqual(['past', 'arch', 'closed', 'draftBooked'])
    expect(data.trainingPayments[0].camp.title).toBe('Einzel · 01.01.2020, 11:00 Uhr')
    expect(api.fetchTrainingPaymentsAdmin).toHaveBeenCalledExactlyOnceWith('demo', 'tok')
    expect(api.fetchTrainingOffersAdmin).not.toHaveBeenCalled()
    expect(api.fetchTrainingSessionsAdmin).not.toHaveBeenCalled()
    expect(api.fetchSessionRegistrationsAdmin).not.toHaveBeenCalled()
  })

  it('startet die Trainingszahlungen parallel zu den Camps', async () => {
    let releaseCamps!: (value: unknown[]) => void
    api.fetchCampsAdmin.mockReturnValue(new Promise(resolve => { releaseCamps = resolve }))
    const pending = loadOrgPaymentsData('demo')
    await vi.waitFor(() => expect(api.fetchTrainingPaymentsAdmin).toHaveBeenCalled())
    releaseCamps([])
    expect((await pending).trainingPayments).toEqual([])
  })

  it('ohne Trainings-Modul: keine Trainingszahlungs-Anfrage, kein Fehlerhinweis', async () => {
    const data = await loadOrgPaymentsData('demo', { trainings: false })
    expect(api.fetchTrainingPaymentsAdmin).not.toHaveBeenCalled()
    expect(data.trainingPayments).toEqual([])
    expect(data.trainingPaymentsError).toBe(false)
  })

  it('lässt Termine ohne Buchungen weg', async () => {
    api.fetchTrainingPaymentsAdmin.mockResolvedValue([group('a', 'published', [])])
    expect((await loadOrgPaymentsData('demo')).trainingPayments).toEqual([])
  })

  it('degradiert bei Trainingsfehler: Camps bleiben, Fehlerhinweis gesetzt', async () => {
    api.fetchTrainingPaymentsAdmin.mockRejectedValue(new Error('boom'))
    const data = await loadOrgPaymentsData('demo')
    expect(data.trainingPayments).toEqual([])
    expect(data.trainingPaymentsError).toBe(true)
    expect(data.camps).toEqual([])
  })

  it('leitet bei Auth-Fehler der Trainingszahlungen zum Login um', async () => {
    api.fetchTrainingPaymentsAdmin.mockRejectedValue(new AdminAuthError())
    await expect(loadOrgPaymentsData('demo')).rejects.toThrow('redirect:/pilot/demo/login')
  })

  it('ein Camp-Fehler bleibt ein Fehler der Seite, auch wenn Trainings laden', async () => {
    api.fetchCampsAdmin.mockRejectedValue(new Error('camps down'))
    await expect(loadOrgPaymentsData('demo')).rejects.toThrow('camps down')
  })
})

describe('loadTrainingPayments', () => {
  it('liefert für die Übersicht dieselben Gruppen wie für die Zahlungsseite', async () => {
    api.fetchTrainingPaymentsAdmin.mockResolvedValue([group('a')])
    const result = await loadTrainingPayments('demo')
    expect(result.trainingPaymentsError).toBe(false)
    expect(result.trainingPayments[0].registrations).toEqual([{ id: 'r-a' }])
  })
})
