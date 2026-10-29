'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { setNewPassword } from './actions'
import { initialPasswordState, INVALID_RECOVERY_LINK, readRecoverySession, type PasswordState, type RecoverySession } from '../passwort-vergessen/recovery'

export default function NewPasswordForm({ orgSlug }: { orgSlug: string }) {
  const initialized = useRef(false)
  const [link, setLink] = useState<{ ready: boolean; session: RecoverySession | null }>({ ready: false, session: null })
  const [state, action, pending] = useActionState(async (previous: PasswordState, data: FormData) => {
    const result = await setNewPassword(link.session, previous, data)
    if (result.success) setLink({ ready: true, session: null })
    return result
  }, initialPasswordState)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const session = readRecoverySession(window.location.hash)
    // Remove credentials from the address bar/history; keep them only in memory.
    window.history.replaceState(window.history.state, '', window.location.pathname)
    queueMicrotask(() => setLink({ ready: true, session }))
  }, [])

  const base = `/pilot/${encodeURIComponent(orgSlug)}`
  return <>
    <h1 className="login-h1">Neues Passwort setzen</h1>
    {!link.ready ? <p role="status">Link wird geladen …</p> : state.success ? <p role="status">Ihr Passwort wurde geändert. Sie können sich jetzt mit Ihrem neuen Passwort anmelden.</p> : !link.session ? <p className="login-error" role="alert">{INVALID_RECOVERY_LINK}</p> : <form action={action}>
      <p id="password-hint">Mindestens 10 Zeichen.</p>
      <label className="login-label" htmlFor="new-password">Neues Passwort</label>
      <input className="login-field" id="new-password" name="password" type="password" autoComplete="new-password" minLength={10} required
        aria-invalid={!!state.error} aria-describedby={state.error ? 'password-hint password-error' : 'password-hint'} />
      <label className="login-label" htmlFor="confirm-password">Neues Passwort wiederholen</label>
      <input className="login-field" id="confirm-password" name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required
        aria-invalid={!!state.error} aria-describedby={state.error ? 'password-error' : undefined} />
      {state.error && <p className="login-error" id="password-error" role="alert">{state.error}</p>}
      <button className="login-btn" type="submit" disabled={pending}>{pending ? 'Wird gespeichert …' : 'Passwort speichern'}</button>
    </form>}
    {link.ready && !state.success && <Link className="login-label cp-focus inline-flex min-h-[44px] items-center underline" href={`${base}/passwort-vergessen`}>Neuen Link anfordern</Link>}
    <Link className="login-label cp-focus inline-flex min-h-[44px] items-center underline" href={`${base}/login`}>Zur Anmeldung</Link>
  </>
}
