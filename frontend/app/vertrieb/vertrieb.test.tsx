import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { getValidAccessToken } from '../lib/supabaseServer'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../lib/supabaseServer', () => ({ getValidAccessToken: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`) },
  notFound: () => { throw new Error('notFound') },
}))
vi.mock('../components/saas/fonts', () => ({ archivo: { variable: 'test-font' } }))
vi.mock('../platform/logoutAction', () => ({ platformLogoutAction: vi.fn() }))

const { createLeadAction, updateLeadAction, assignLeadAction } = await import('./(app)/actions')
const { addSalesMemberAction, updateSalesMemberAction } = await import('../platform/(console)/team/salesActions')
const { default: VertriebLayout } = await import('./(app)/layout')
const { default: PlatformLayout } = await import('../platform/(console)/layout')
const { dueLabel } = await import('./labels')

const empty = { error: null, notice: null }
const LEAD = '11111111-1111-4111-8111-111111111111'

function form(entries: Record<string, string>) {
  const data = new FormData()
  for (const [k, v] of Object.entries(entries)) data.set(k, v)
  return data
}

function stubFetch(handler: (url: string, init: RequestInit) => [number, unknown]) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const [status, body] = handler(url, init)
    return new Response(status === 204 ? null : JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sent(fetchMock: ReturnType<typeof stubFetch>, index = 0) {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit]
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined }
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockReset()
  vi.mocked(getValidAccessToken).mockResolvedValue('token')
})
afterEach(() => vi.unstubAllGlobals())

describe('Login-Weiterleitung', () => {
  it('Vertriebskonto landet von /platform direkt in /vertrieb', async () => {
    stubFetch(() => [200, { user_id: 'u', email: null, is_platform_owner: false, admin_organization_slugs: [], sales_role: 'sales_rep' }])
    await expect(PlatformLayout({ children: 'x' })).rejects.toThrow('redirect:/vertrieb')
  })

  it('Vereinsadmin ohne Vertriebsrolle geht weiter in seinen Verein', async () => {
    stubFetch(() => [200, { user_id: 'u', email: null, is_platform_owner: false, admin_organization_slugs: ['ksv'], sales_role: null }])
    await expect(PlatformLayout({ children: 'x' })).rejects.toThrow('redirect:/pilot/ksv/dashboard')
  })
})

describe('Zugang /vertrieb', () => {
  it('Konto ohne Vertriebsrolle (403) wird zurück nach /platform geschickt', async () => {
    stubFetch(() => [403, { detail: 'Sales access required' }])
    await expect(VertriebLayout({ children: 'geheim' })).rejects.toThrow('redirect:/platform')
  })

  it('abgelaufene Sitzung geht zum Login', async () => {
    stubFetch(() => [401, {}])
    await expect(VertriebLayout({ children: 'geheim' })).rejects.toThrow('redirect:/platform/login')
  })

  it('Vertriebler sieht weder Team noch Import', async () => {
    stubFetch(() => [200, { user_id: 'u', email: null, role: 'sales_rep', can_manage: false }])
    const html = renderToStaticMarkup(await VertriebLayout({ children: 'inhalt' }))
    expect(html).toContain('Meine Leads')
    expect(html).not.toContain('/vertrieb/team')
    expect(html).not.toContain('/vertrieb/import')
    expect(html).toContain('inhalt')
  })

  it('Vertriebsleitung sieht Team, aber keinen Import', async () => {
    stubFetch(() => [200, { user_id: 'u', email: null, role: 'sales_lead', can_manage: true }])
    const html = renderToStaticMarkup(await VertriebLayout({ children: 'inhalt' }))
    expect(html).toContain('/vertrieb/team')
    expect(html).not.toContain('/vertrieb/import')
    expect(html).toContain('Vertriebsleitung')
  })
})

describe('Lead-Aktionen', () => {
  it('Anlegen schickt nur bekannte Felder, nie Zuständigkeit oder Rolle', async () => {
    const fetchMock = stubFetch(() => [201, { id: LEAD }])
    await expect(createLeadAction(empty, form({
      name: ' TSV Probe ', city: 'Kassel', fit: 'A', kind: 'verein', note: 'Messe', email: '',
      owner_user_id: 'fremd', role: 'sales_lead',
    }))).rejects.toThrow(`redirect:/vertrieb/${LEAD}`)
    const { url, method, body } = sent(fetchMock)
    expect(url).toMatch(/\/sales\/leads$/)
    expect(method).toBe('POST')
    expect(body).toEqual({ name: 'TSV Probe', city: 'Kassel', fit: 'A', kind: 'verein', note: 'Messe' })
  })

  it('ohne Namen wird nichts gesendet', async () => {
    const fetchMock = stubFetch(() => [201, {}])
    const state = await createLeadAction(empty, form({ name: '  ' }))
    expect(state.error).toContain('Namen')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Nach dem Gespräch: Status, Datum, Notiz in einem PATCH', async () => {
    const fetchMock = stubFetch(() => [200, { id: LEAD }])
    const state = await updateLeadAction(LEAD, empty, form({ status: 'kontaktiert', next_action_at: '2026-11-27', note: 'Rückruf' }))
    expect(state.notice).toBe('Gespeichert.')
    expect(sent(fetchMock)).toEqual({
      url: expect.stringMatching(new RegExp(`/sales/leads/${LEAD}$`)), method: 'PATCH',
      body: { status: 'kontaktiert', next_action_at: '2026-11-27', note: 'Rückruf' },
    })
  })

  it('Stammdaten: geleerte Felder werden gelöscht, unbekannter Status ignoriert', async () => {
    const fetchMock = stubFetch(() => [200, { id: LEAD }])
    await updateLeadAction(LEAD, empty, form({ name: 'X', phone: '', fit: '', status: 'chef' }))
    expect(sent(fetchMock).body).toEqual({ name: 'X', phone: null, fit: null })
  })

  it('fremder Lead (404) meldet einen verständlichen Fehler', async () => {
    stubFetch(() => [404, {}])
    const state = await updateLeadAction(LEAD, empty, form({ status: 'demo' }))
    expect(state.error).toContain('nicht mehr dir zugeordnet')
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('Zuweisen und Zuweisung aufheben', async () => {
    const fetchMock = stubFetch(() => [200, { id: LEAD }])
    await assignLeadAction(LEAD, empty, form({ owner_user_id: '22222222-2222-4222-8222-222222222222' }))
    await assignLeadAction(LEAD, empty, form({ owner_user_id: '' }))
    expect(sent(fetchMock, 0).body).toEqual({ owner_user_id: '22222222-2222-4222-8222-222222222222' })
    expect(sent(fetchMock, 1).body).toEqual({ owner_user_id: null })
  })

  it('Zuweisung an Nicht-Vertriebler (422) wird erklärt', async () => {
    stubFetch(() => [422, {}])
    const state = await assignLeadAction(LEAD, empty, form({ owner_user_id: 'x' }))
    expect(state.error).toContain('kein aktives Vertriebskonto')
  })
})

describe('Vertriebskonten (Plattform-Team)', () => {
  it('Einladen schickt Name, E-Mail und nur eine der zwei Vertriebsrollen', async () => {
    const fetchMock = stubFetch(() => [201, { invited: true, invite_mail_sent: true }])
    const state = await addSalesMemberAction(empty, form({ display_name: 'Kristian', email: 'k@example.com', role: 'platform_owner' }))
    expect(state.notice).toContain('Einladung an k@example.com')
    expect(sent(fetchMock).body).toEqual({ email: 'k@example.com', display_name: 'Kristian', role: 'sales_rep' })
  })

  it('Deaktivieren und Rolle wechseln', async () => {
    const fetchMock = stubFetch(() => [200, {}])
    await updateSalesMemberAction(empty, form({ user_id: 'u1', change: 'deactivate' }))
    await updateSalesMemberAction(empty, form({ user_id: 'u1', change: 'role', role: 'sales_lead' }))
    expect(sent(fetchMock, 0)).toMatchObject({ method: 'PATCH', body: { active: false } })
    expect(sent(fetchMock, 1).body).toEqual({ role: 'sales_lead' })
  })
})

describe('Fälligkeit', () => {
  it('überfällig, heute, später', () => {
    expect(dueLabel('2026-11-18', '2026-11-19')).toEqual({ text: 'überfällig seit 18.11.2026', overdue: true })
    expect(dueLabel('2026-11-19', '2026-11-19')).toEqual({ text: 'heute', overdue: false })
    expect(dueLabel('2026-12-01', '2026-11-19')).toEqual({ text: '01.12.2026', overdue: false })
    expect(dueLabel(null, '2026-11-19')).toBeNull()
  })
})
