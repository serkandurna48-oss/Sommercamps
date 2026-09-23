'use client'

import { useActionState } from 'react'
import { archivo } from '../../../components/saas/fonts'
import GrainOverlay from '../../../components/saas/GrainOverlay'
import '../../../components/saas/tokens.css'
import { loginAction, type LoginState } from './actions'

const initialState: LoginState = { error: null }

export default function LoginForm({ orgSlug }: { orgSlug: string }) {
  const boundAction = loginAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)

  return (
    <div className={`${archivo.variable} cp-scope flex min-h-screen items-center justify-center p-6`}>
      <GrainOverlay />
      <form
        action={formAction}
        className="w-full max-w-sm rounded-[var(--cp-r-card)] border p-8"
        style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}
      >
        <p className="cp-label" style={{ color: 'var(--cp-muted)' }}>
          CampsPilot
        </p>
        <h1 className="cp-title mt-1 mb-6">Vereins-Anmeldung</h1>

        <label className="cp-label mb-1.5 block" style={{ color: 'var(--cp-ink-2)' }} htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="cp-subheading w-full rounded-[var(--cp-r-field)] border px-4 py-3 outline-none"
          style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px' }}
        />

        {state.error && (
          <p
            className="cp-body mt-3 rounded-[var(--cp-r-chip)] border px-3 py-2 text-sm"
            style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
            role="alert"
          >
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="cp-subheading mt-6 w-full rounded-[var(--cp-r-field)] py-3.5 disabled:opacity-50"
          style={{ background: 'var(--cp-ink)', color: '#FFFFFF' }}
        >
          {pending ? 'Wird geprüft …' : 'Anmelden'}
        </button>
      </form>
    </div>
  )
}
