'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { INPUT_CLASS, INPUT_STYLE } from '../../components/saas/ui/formFieldStyles'
import { setNewPassword } from '../../pilot/[org]/neues-passwort/actions'
import { initialPasswordState, INVALID_RECOVERY_LINK, readRecoverySession, type PasswordState, type RecoverySession } from '../../pilot/[org]/passwort-vergessen/recovery'

/** Same recovery flow as the club page (pilot/[org]/neues-passwort), without
 * club branding. The session from the link stays in memory only. */
export default function SalesPasswordForm() {
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
    window.history.replaceState(window.history.state, '', window.location.pathname)
    queueMicrotask(() => setLink({ ready: true, session }))
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="cp-title" style={{ color: 'var(--cp-ink)' }}>Passwort festlegen</h1>
      {!link.ready ? (
        <p role="status" className="cp-body">Link wird geladen …</p>
      ) : state.success ? (
        <p role="status" className="cp-body">Dein Passwort ist gespeichert. Melde dich jetzt an, du landest direkt im Vertrieb.</p>
      ) : !link.session ? (
        <p role="alert" className="cp-body" style={{ color: 'var(--cp-error)' }}>{INVALID_RECOVERY_LINK}</p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="cp-label" style={{ color: 'var(--cp-muted)' }}>Neues Passwort (mindestens 10 Zeichen)</span>
            <input name="password" type="password" autoComplete="new-password" minLength={10} required className={INPUT_CLASS} style={INPUT_STYLE} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="cp-label" style={{ color: 'var(--cp-muted)' }}>Passwort wiederholen</span>
            <input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={10} required className={INPUT_CLASS} style={INPUT_STYLE} />
          </label>
          {state.error && <p role="alert" className="cp-chip" style={{ color: 'var(--cp-error)' }}>{state.error}</p>}
          <button type="submit" disabled={pending} className="cp-focus cp-btn cp-btn-primary inline-flex min-h-[44px] items-center justify-center px-4 disabled:opacity-50">
            {pending ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
        </form>
      )}
      <Link href="/platform/login" className="cp-focus cp-body underline">Zur Anmeldung</Link>
    </div>
  )
}
