// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  setSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../../../lib/supabaseServer', () => ({ getSupabaseServerClient: () => ({ auth }) }))
vi.mock('../../../lib/saasApi', () => ({ fetchOrganization: vi.fn().mockResolvedValue(null) }))
vi.mock('../GrainOverlay', () => ({ default: () => null }))
vi.mock('../publicFonts', () => ({ publicFontClassName: () => '' }))
vi.mock('./actions', () => ({ loginAction: vi.fn() }))

import LoginPage from './page'
import ResetRequestForm from '../passwort-vergessen/ResetRequestForm'
import NewPasswordForm from '../neues-passwort/NewPasswordForm'
import { requestPasswordReset } from '../passwort-vergessen/actions'
import { setNewPassword } from '../neues-passwort/actions'
import { initialPasswordState, INVALID_RECOVERY_LINK, readRecoverySession } from '../passwort-vergessen/recovery'

const neutral = 'Wenn ein Konto zu dieser E-Mail existiert, haben wir Ihnen einen Link geschickt.'
const session = { access_token: 'test-access', refresh_token: 'test-refresh' }
const recoveryHash = '#type=recovery&access_token=test-access&refresh_token=test-refresh'
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example')
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  auth.setSession.mockResolvedValue({ data: { session }, error: null })
  auth.updateUser.mockResolvedValue({ data: { user: {} }, error: null })
  window.history.replaceState(null, '', '/pilot/testverein/neues-passwort')
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  vi.unstubAllEnvs()
})

function data(password = 'neues-passwort', confirmation = password) {
  const form = new FormData()
  form.set('password', password)
  form.set('passwordConfirmation', confirmation)
  return form
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

async function renderNewPassword(hash = recoveryHash) {
  window.history.replaceState(null, '', '/pilot/testverein/neues-passwort' + hash)
  await act(async () => root.render(<StrictMode><NewPasswordForm orgSlug="testverein" /></StrictMode>))
}

function fillPasswords(password = 'neues-passwort', confirmation = password) {
  container.querySelector<HTMLInputElement>('[name="password"]')!.value = password
  container.querySelector<HTMLInputElement>('[name="passwordConfirmation"]')!.value = confirmation
}

it('Login-Seite verlinkt Passwort vergessen im selben Vereinssegment', async () => {
  const page = await LoginPage({ params: Promise.resolve({ org: 'testverein' }) })
  await act(() => root.render(page))
  const link = container.querySelector('a[href="/pilot/testverein/passwort-vergessen"]')
  expect(link?.textContent).toBe('Passwort vergessen?')
})

describe('Reset-Anfrage ohne Kontoauskunft', () => {
  it.each([
    ['Erfolg', null],
    ['user not found', { code: 'user_not_found', message: 'User not found' }],
    ['Rate-Limit', { code: 'over_email_send_rate_limit' }],
  ])('zeigt dieselbe neutrale Bestätigung bei %s', async (_label, error) => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error })
    await act(() => root.render(<ResetRequestForm orgSlug="testverein" />))
    container.querySelector<HTMLInputElement>('[name="email"]')!.value = 'test@example.com'
    await submit()
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
      redirectTo: 'https://camps.example/pilot/testverein/neues-passwort',
    })
    expect(container.querySelector('[role="status"]')?.textContent).toBe(neutral)
    expect(container.textContent).not.toContain('Konto nicht gefunden')
    expect(container.querySelector('form')).toBeNull()
  })

  it('bleibt auch bei einem Netzwerkfehler neutral', async () => {
    auth.resetPasswordForEmail.mockRejectedValue(new Error('offline'))
    const form = new FormData()
    form.set('email', 'test@example.com')
    expect(await requestPasswordReset('testverein', { message: '' }, form)).toEqual({ message: neutral })
  })

  it.each(['testverein', '//evil.example/path?next=https://evil.example#x', '../..', 'verein\\evil.example'])(
    'bindet das Redirect-Ziel an die konfigurierte Site: %s', async org => {
      vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://camps.example/base?next=elsewhere#fragment')
      const form = new FormData()
      form.set('email', ' test@example.com ')
      form.set('redirectTo', 'https://evil.example')
      await requestPasswordReset(org, { message: '' }, form)
      const target = new URL(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo)
      expect(target.origin).toBe('https://camps.example')
      expect(target.pathname).toBe(`/pilot/${encodeURIComponent(org)}/neues-passwort`)
      expect(target.search).toBe('')
      expect(target.hash).toBe('')
      expect(auth.resetPasswordForEmail.mock.calls[0][0]).toBe('test@example.com')
    },
  )

  it('versendet bei einer ungültigen Site-Konfiguration keinen fremden Redirect', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'javascript:alert(1)')
    expect(await requestPasswordReset('testverein', { message: '' }, new FormData())).toEqual({ message: neutral })
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled()
  })
})

describe('Neues Passwort', () => {
  it('weist unterschiedliche Passwörter im Formular zurück', async () => {
    await renderNewPassword()
    fillPasswords('neues-passwort', 'anderes-passwort')
    await submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Die Passwörter stimmen nicht überein.')
    expect(auth.setSession).not.toHaveBeenCalled()
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it.each(['', '123456789'])('erzwingt mindestens zehn Zeichen auch serverseitig: %s', async password => {
    expect(await setNewPassword(session, initialPasswordState, data(password))).toEqual({
      error: 'Das Passwort muss mindestens 10 Zeichen lang sein.', success: false,
    })
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('übernimmt die Link-Sitzung, entfernt das Fragment und speichert das Passwort', async () => {
    await renderNewPassword()
    expect(window.location.hash).toBe('')
    expect(container.querySelectorAll('input[type="password"][minlength="10"]')).toHaveLength(2)
    fillPasswords()
    await submit()
    expect(auth.setSession).toHaveBeenCalledWith(session)
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'neues-passwort' })
    expect(auth.setSession.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0])
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Ihr Passwort wurde geändert.')
    expect(container.querySelector('a[href="/pilot/testverein/login"]')?.textContent).toBe('Zur Anmeldung')
    expect(container.querySelector('form')).toBeNull()
  })

  it.each(['', '#error=access_denied&error_code=otp_expired', '#type=recovery&access_token=only-one', '#type=signup&access_token=a&refresh_token=b'])(
    'zeigt bei fehlendem oder abgelaufenem Link die neue Anforderung: %s', async hash => {
      await renderNewPassword(hash)
      expect(container.querySelector('[role="alert"]')?.textContent).toBe(INVALID_RECOVERY_LINK)
      expect(container.querySelector('a[href="/pilot/testverein/passwort-vergessen"]')).not.toBeNull()
      expect(container.querySelector('form')).toBeNull()
      expect(auth.updateUser).not.toHaveBeenCalled()
    },
  )

  it('ändert ohne Link-Sitzung auch bei direktem Aufruf kein Passwort', async () => {
    expect(await setNewPassword(null, initialPasswordState, data())).toEqual({ error: INVALID_RECOVERY_LINK, success: false })
    expect(auth.setSession).not.toHaveBeenCalled()
  })

  it('zeigt bei serverseitig ungültiger Sitzung einen deutschen Fehler', async () => {
    auth.setSession.mockResolvedValue({ data: { session: null }, error: { code: 'refresh_token_not_found' } })
    await renderNewPassword()
    fillPasswords()
    await submit()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(INVALID_RECOVERY_LINK)
    expect(auth.updateUser).not.toHaveBeenCalled()
  })

  it('behandelt eine während des Speicherns abgelaufene Sitzung', async () => {
    auth.updateUser.mockResolvedValue({ error: { status: 401 } })
    expect(await setNewPassword(session, initialPasswordState, data())).toEqual({ error: INVALID_RECOVERY_LINK, success: false })
  })

  it.each([
    [{ code: 'same_password' }, 'anderes Passwort'],
    [{ code: 'weak_password' }, 'stärkeres Passwort'],
    [{ status: 503 }, 'Bitte versuchen Sie es später erneut.'],
  ])('übersetzt Supabase-Fehler ohne technische Details: %j', async (error, message) => {
    auth.updateUser.mockResolvedValue({ error })
    const result = await setNewPassword(session, initialPasswordState, data())
    expect(result.success).toBe(false)
    expect(result.error).toContain(message)
  })

  it('zeigt einen Speicherfehler bei unterbrochener Verbindung', async () => {
    auth.updateUser.mockRejectedValue(new Error('offline'))
    const result = await setNewPassword(session, initialPasswordState, data())
    expect(result.success).toBe(false)
    expect(result.error).toContain('Bitte versuchen Sie es später erneut.')
  })

  it('liest ausschließlich vollständige Recovery-Fragmente', () => {
    expect(readRecoverySession(recoveryHash)).toEqual(session)
    expect(readRecoverySession(recoveryHash + '&error_code=otp_expired')).toBeNull()
  })
})


describe('Login nach Bestätigungslink', () => {
  it('entfernt Tokens aus dem Fragment der Adresse', async () => {
    window.history.replaceState(null, '', '/pilot/testverein/login#access_token=a&refresh_token=b&type=signup')
    await act(async () => root.render(await LoginPage({ params: Promise.resolve({ org: 'testverein' }) })))
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/pilot/testverein/login')
  })
})
