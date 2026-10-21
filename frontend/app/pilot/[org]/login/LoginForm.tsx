'use client'

import { useActionState } from 'react'
import Image from 'next/image'
import GrainOverlay from '../GrainOverlay'
import { publicFontClassName, type PublicTheme } from '../publicFonts'
import '../publicTheme.css'
import '../../../components/saas/ui/focus.css'
import { loginAction, type LoginState } from './actions'
import { orgShortCode } from '../../../lib/parentFlowFormat'

interface LoginFormProps {
  orgSlug: string
  orgName?: string
  orgLogoUrl?: string | null
  orgTheme?: PublicTheme
  brandStrong?: string
  brandOn?: string
}

const initialState: LoginState = { error: null }

export default function LoginForm({
  orgSlug,
  orgName,
  orgLogoUrl,
  orgTheme = 'tradition',
  brandStrong,
  brandOn,
}: LoginFormProps) {
  const boundAction = loginAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const short = orgName ? orgShortCode(orgName) : null

  return (
    <div
      className={`cp-public cp-admin-login ${publicFontClassName(orgTheme)}`}
      data-theme={orgTheme}
      style={
        {
          '--brand-strong': brandStrong ?? '#2B6F4C',
          '--brand-on': brandOn ?? '#FFFFFF',
        } as React.CSSProperties
      }
    >
      <GrainOverlay />
      <div className="login-wrap">
        <form action={formAction} className="login-card">
          {/* Logo */}
          <div className="login-logo">
            {orgLogoUrl ? (
              <Image
                src={orgLogoUrl}
                alt={orgName ?? 'Logo'}
                width={56}
                height={56}
                unoptimized
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              short
            )}
          </div>

          {orgName && (
            <p className="login-brand-label">{orgName}</p>
          )}

          <h1 className="login-h1">Anmelden</h1>

          <label className="login-label" htmlFor="email">
            E-Mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoFocus
            aria-describedby={state.error ? "login-error" : undefined}
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
            aria-describedby={state.error ? "login-error" : undefined}
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
      </div>
    </div>
  )
}
