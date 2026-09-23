'use client'

import { useActionState } from 'react'
import { archivo } from '../../components/saas/fonts'
import GrainOverlay from '../../components/saas/GrainOverlay'
import '../../components/saas/tokens.css'
import { platformLoginAction } from './actions'

export default function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, { error: null })

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
        <h1 className="cp-title mt-1 mb-6">Plattform-Anmeldung</h1>

        <label className="cp-label mb-1.5 block" style={{ color: 'var(--cp-ink-2)' }} htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          className="cp-subheading mb-4 w-full rounded-[var(--cp-r-field)] border px-4 py-3 outline-none"
          style={{ borderColor: 'var(--cp-field-line)', fontSize: '16px' }}
        />

        <label className="cp-label mb-1.5 block" style={{ color: 'var(--cp-ink-2)' }} htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
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
