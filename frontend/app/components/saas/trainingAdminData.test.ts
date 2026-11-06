import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminAuthError } from '../../lib/saasAdminApi'
import { loadTrainingOffer, loadWithBase } from './trainingAdminData'

const api = vi.hoisted(() => ({
  fetchOrganizationAdmin: vi.fn(), fetchTrainingOfferOverviewAdmin: vi.fn(),
  fetchTrainingOfferAdmin: vi.fn(), fetchTrainingSessionsAdmin: vi.fn(), fetchSessionRegistrationsAdmin: vi.fn(),
}))
vi.mock('../../lib/saasAdminApi', async importOriginal => ({ ...(await importOriginal<object>()), ...api }))
vi.mock('../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn(async () => 'tok') }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('notFound') },
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
}))

beforeEach(() => {
  vi.clearAllMocks()
  api.fetchOrganizationAdmin.mockResolvedValue({ slug: 'demo', name: 'Demo' })
})

describe('loadWithBase', () => {
  it('startet Seitendaten in derselben Runde wie die Organisation', async () => {
    let releaseOrg!: (value: unknown) => void
    api.fetchOrganizationAdmin.mockReturnValue(new Promise(resolve => { releaseOrg = resolve }))
    const load = vi.fn(async () => 'data')
    const pending = loadWithBase('demo', load)
    await vi.waitFor(() => expect(load).toHaveBeenCalledWith('tok'))
    releaseOrg({ slug: 'demo' })
    expect((await pending).data).toBe('data')
  })

  it('prüft die Organisation zuerst: unbekannter Verein -> Login, auch wenn die Daten scheitern', async () => {
    api.fetchOrganizationAdmin.mockResolvedValue(null)
    await expect(loadWithBase('demo', async () => { throw new Error('boom') })).rejects.toThrow('redirect:/pilot/demo/login')
  })

  it('Auth-Fehler der Seitendaten -> Login, andere Fehler bleiben Fehler', async () => {
    await expect(loadWithBase('demo', async () => { throw new AdminAuthError() })).rejects.toThrow('redirect:/pilot/demo/login')
    await expect(loadWithBase('demo', async () => { throw new Error('boom') })).rejects.toThrow('boom')
  })
})

describe('loadTrainingOffer', () => {
  const session = (id: string) => ({ id, offer_id: 'o1', slug: id, status: 'published', registrations: [{ id: `r-${id}` }] })

  it('lädt Angebot, Termine und Buchungen mit einer Anfrage', async () => {
    api.fetchTrainingOfferOverviewAdmin.mockResolvedValue({ offer: { id: 'o1', title: 'Einzel' }, sessions: [session('s1'), session('s2')] })
    const data = await loadTrainingOffer('demo', 'o1')
    expect(api.fetchTrainingOfferOverviewAdmin).toHaveBeenCalledExactlyOnceWith('demo', 'o1', 'tok')
    expect(api.fetchTrainingSessionsAdmin).not.toHaveBeenCalled()
    expect(api.fetchSessionRegistrationsAdmin).not.toHaveBeenCalled()
    expect(data.offer.title).toBe('Einzel')
    expect(data.sessions.map(s => s.id)).toEqual(['s1', 's2'])
    expect(data.sessions[0]).not.toHaveProperty('registrations')
    expect(data.registrationsBySession).toEqual({ s1: [{ id: 'r-s1' }], s2: [{ id: 'r-s2' }] })
  })

  it('unbekanntes Angebot -> 404', async () => {
    api.fetchTrainingOfferOverviewAdmin.mockResolvedValue(null)
    await expect(loadTrainingOffer('demo', 'nope')).rejects.toThrow('notFound')
  })
})
