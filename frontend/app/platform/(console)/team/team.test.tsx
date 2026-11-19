import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../../../lib/supabaseServer'
import type { PlatformOwner } from '../../../lib/saasAdminApi'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))

const api = await import('../../../lib/saasAdminApi')
const { addPlatformOwnerAction, removePlatformOwnerAction } = await import('./teamActions')
const { default: TeamSection } = await import('./TeamSection')

const empty = { error: null, notice: null }
const owner = (over: Partial<PlatformOwner> = {}): PlatformOwner => ({
  user_id: '11111111-1111-1111-1111-111111111111',
  email: 'serkan@example.com',
  role: 'platform_owner',
  created_at: '2026-11-01T10:00:00Z',
  organizations: [],
  is_self: true,
  ...over,
})
function form(entries: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(entries)) data.set(k, v)
  return data
}
function stubFetch(status: number, body: unknown = {}) {
  const fetchMock = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset()
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
})
afterEach(() => vi.unstubAllGlobals())

describe('addPlatformOwnerAction', () => {
  it('sendet nur die E-Mail an den Owner-Endpunkt und meldet Erfolg', async () => {
    const fetchMock = stubFetch(201, owner({ email: 'ahmad@example.com', is_self: false, already_owner: false }))
    const state = await addPlatformOwnerAction(empty, form({ email: ' ahmad@example.com ', role: 'x' }))
    expect(state.error).toBeNull()
    expect(state.notice).toContain('ahmad@example.com hat jetzt Plattform-Zugang')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/admin\/platform\/owners$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ahmad@example.com' })
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
    expect(revalidatePath).toHaveBeenCalledWith('/platform/team')
  })

  it('meldet bestehenden Zugang ohne Fehler', async () => {
    stubFetch(200, owner({ email: 'ahmad@example.com', already_owner: true }))
    const state = await addPlatformOwnerAction(empty, form({ email: 'ahmad@example.com' }))
    expect(state.notice).toContain('bereits Plattform-Zugang')
  })

  it.each([
    [404, 'Kein Konto mit dieser E-Mail-Adresse'],
    [409, 'Konto noch nicht aktiviert'],
    [403, 'Plattform-Zugang konnte nicht vergeben werden'],
  ])('zeigt bei HTTP %i eine klare Meldung', async (status, text) => {
    stubFetch(status, { detail: 'x' })
    const state = await addPlatformOwnerAction(empty, form({ email: 'a@example.com' }))
    expect(state.error).toContain(text)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('ohne Sitzung wird nichts gesendet', async () => {
    vi.mocked(getValidAccessToken).mockResolvedValue(null)
    const fetchMock = stubFetch(201)
    const state = await addPlatformOwnerAction(empty, form({ email: 'a@example.com' }))
    expect(state.error).toContain('Sitzung abgelaufen')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('removePlatformOwnerAction', () => {
  it('entzieht per DELETE auf die user_id', async () => {
    const fetchMock = stubFetch(204)
    const state = await removePlatformOwnerAction(
      empty,
      form({ user_id: '22222222-2222-2222-2222-222222222222', label: 'ahmad@example.com' }),
    )
    expect(state.notice).toContain('Plattform-Zugang entzogen')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/admin\/platform\/owners\/22222222-2222-2222-2222-222222222222$/)
    expect(init.method).toBe('DELETE')
  })

  it('zeigt den Schutz für den letzten Owner an', async () => {
    stubFetch(409, { detail: 'last' })
    const state = await removePlatformOwnerAction(empty, form({ user_id: 'u', label: 'x' }))
    expect(state.error).toContain('letzte Plattform-Owner')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('TeamSection', () => {
  it('zeigt Rollen, eigenes Konto und sperrt Entfernen beim letzten Owner', () => {
    const html = renderToStaticMarkup(<TeamSection owners={[owner()]} />)
    expect(html).toContain('serkan@example.com')
    expect(html).toContain('(du)')
    expect(html).toContain('Plattform-Owner · alle Vereine')
    expect(html).toContain('Letzter Plattform-Owner, kann nicht entfernt werden.')
    expect(html).not.toContain('>Entziehen<')
  })

  it('zeigt zusätzliche Vereinsrollen und Entziehen bei mehreren Owners', () => {
    const html = renderToStaticMarkup(
      <TeamSection
        owners={[
          owner(),
          owner({
            user_id: '22222222-2222-2222-2222-222222222222',
            email: 'ahmad@example.com',
            is_self: false,
            organizations: [{ slug: 'demo-fc', name: 'Demo FC' }],
          }),
        ]}
      />,
    )
    expect(html).toContain('Plattform-Admins (2)')
    expect(html).toContain('zusätzlich Vereinsadmin: Demo FC')
    expect(html.match(/>Entziehen</g)).toHaveLength(2)
  })
})

it('API-Client ist an die Konsole angebunden', () => {
  expect(typeof api.fetchPlatformOwnersAdmin).toBe('function')
})
