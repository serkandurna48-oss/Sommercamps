'use client'

import { useActionState } from 'react'
import AuthShell from '../../components/saas/auth/AuthShell'
import { platformLoginAction } from './actions'

export default function PlatformLoginForm() {
  const [state, formAction, pending] = useActionState(platformLoginAction, { error: null })

  return (
    <AuthShell name="CampsPilot Plattform" product>
      <form action={formAction}>
        <h1 className="login-h1">Anmelden</h1>
        <p>Zugang für das CampsPilot-Team zur Verwaltung aller Vereine.</p>

        <label className="login-label" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoFocus
          aria-describedby={state.error ? 'login-error' : undefined}
          aria-invalid={state.error ? true : undefined}
          autoComplete="username"
          className="login-field"
        />

        <label className="login-label" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          aria-describedby={state.error ? 'login-error' : undefined}
          aria-invalid={state.error ? true : undefined}
          autoComplete="current-password"
          className="login-field"
        />

        {state.error && (
          <p id="login-error" className="login-error" role="alert">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className="login-btn">
          {pending ? 'Wird geprüft …' : 'Anmelden'}
        </button>
      </form>
    </AuthShell>
  )
}
