// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { loginAction } from './actions'
import LoginForm from './LoginForm'
import AnmeldenPage from '../../../(marketing)/campspilot/anmelden/page'
import PlatformLayout from '../../../platform/(console)/layout'

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), setCookie: vi.fn(), me: vi.fn() }))
vi.mock('../../../lib/supabaseServer', () => ({
  getSupabaseServerClient: () => ({ auth: { signInWithPassword: mocks.signIn } }),
  getValidAccessToken: async () => 'test-token',
}))
vi.mock('../../../lib/saasAdminApi', () => ({ fetchMe: mocks.me, fetchOrganizationsAdmin: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: mocks.setCookie }) }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`) } }))
vi.mock('../publicFonts', () => ({ publicFontClassName: () => '' }))
vi.mock('../GrainOverlay', () => ({ default: () => null }))
vi.mock('../../../components/saas/fonts', () => ({ archivo: { variable: '' } }))
vi.mock('../../../platform/logoutAction', () => ({ platformLogoutAction: vi.fn() }))

function credentials() {
  const data = new FormData()
  data.set('email', 'verein@example.test')
  data.set('password', 'test-password')
  return data
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  mocks.signIn.mockResolvedValue({ data: { session: { access_token: 'test', refresh_token: 'refresh', expires_in: 3600 } }, error: null })
})
afterEach(() => vi.restoreAllMocks())

it.each([202, 429, 503, 0])('Verlorene Bestätigungsmail: Neuversand aus dem Login (%s) und anschließende Anmeldung bleiben erreichbar', async status => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
  if (status) fetchMock.mockResolvedValue(new Response('{}', { status }))
  else fetchMock.mockRejectedValue(new Error('offline'))
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  try {
    await act(() => root.render(<LoginForm orgSlug="testverein" />))
    host.querySelector<HTMLInputElement>('#email')!.value = 'verein@example.test'
    await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === 'Bestätigungsmail erneut anfordern')!.click())
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/public\/signup\/resend$/), expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'verein@example.test' }) }))
    expect(host.textContent).toContain(status === 202 ? 'Erneuter Versand angefragt.' : status === 429 ? 'Bitte warten Sie eine Stunde' : status === 0 ? 'Bitte prüfen Sie Ihre Internetverbindung' : 'Der erneute Versand konnte nicht angefragt werden.')
    expect(host.querySelector('button[type="submit"]')?.textContent).toBe('Anmelden')
    expect([...host.querySelectorAll('a')].find(a => a.textContent === 'Zurück zu CampsPilot')?.getAttribute('href')).toBe('/campspilot')
  } finally {
    await act(() => root.unmount())
    host.remove()
  }
})

it('Login bietet Bestätigungshinweis und Rückweg zur Marketingseite', () => {
  const dom = document.createElement('div')
  dom.innerHTML = renderToStaticMarkup(<LoginForm orgSlug="testverein" />)
  expect(dom.textContent).toContain('Bestätigen Sie zuerst Ihre E-Mail-Adresse')
  const back = [...dom.querySelectorAll('a')].find(a => a.textContent === 'Zurück zu CampsPilot')
  expect(back?.getAttribute('href')).toBe('/campspilot')
  expect([...dom.querySelectorAll('a')].find(a => a.textContent === 'Passwort vergessen?')?.getAttribute('href')).toBe('/pilot/testverein/passwort-vergessen')
})

it('Allgemeine Anmeldung ohne bekannte Vereinsadresse führt über die bestehende Rollenprüfung zum eigenen Verein', async () => {
  expect(renderToStaticMarkup(<AnmeldenPage />)).toContain('Anmelden')
  await expect(loginAction('', { error: null }, credentials())).rejects.toThrow('REDIRECT:/platform')
  mocks.me.mockResolvedValue({ is_platform_owner: false, admin_organization_slugs: ['testverein'] })
  await expect(PlatformLayout({ children: null })).rejects.toThrow('REDIRECT:/pilot/testverein/dashboard')
})

it('Vereinslogin behält seine Zielroute bei', async () => {
  await expect(loginAction('testverein', { error: null }, credentials())).rejects.toThrow('REDIRECT:/pilot/testverein/dashboard')
})

it('Technischer Loginfehler erklärt die Wiederholung ohne interne Fehlermeldung', async () => {
  mocks.signIn.mockRejectedValue(new Error('Supabase not configured'))
  const result = await loginAction('testverein', { error: null }, credentials())
  expect(result.error).toBe('Die Anmeldung ist gerade nicht möglich. Bitte versuchen Sie es später erneut.')
  expect(mocks.setCookie).not.toHaveBeenCalled()
})

it('Abgelehnter Login weist auch auf die E-Mail-Bestätigung hin', async () => {
  mocks.signIn.mockResolvedValue({ data: { session: null }, error: { message: 'Email not confirmed' } })
  const result = await loginAction('testverein', { error: null }, credentials())
  expect(result.error).toContain('Bestätigung Ihrer E-Mail-Adresse')
  expect(result.error).toContain('Versuchen Sie es anschließend erneut.')
})
