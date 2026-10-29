'use client'

import { useActionState, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
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
  children?: React.ReactNode
}

const initialState: LoginState = { error: null }

export default function LoginForm({
  orgSlug,
  orgName,
  orgLogoUrl,
  orgTheme = 'tradition',
  brandStrong,
  brandOn,
  children,
}: LoginFormProps) {
  const boundAction = loginAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState(boundAction, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const [resending, setResending] = useState(false)
  const [resendFeedback, setResendFeedback] = useState<{ error: boolean; message: string } | null>(null)
  const short = orgName ? orgShortCode(orgName) : null

  async function resendConfirmation() {
    const input = formRef.current?.elements.namedItem('email') as HTMLInputElement | null
    if (!input?.value.trim() || !input.checkValidity()) {
      setResendFeedback({ error: true, message: 'Bitte geben Sie oben Ihre gültige E-Mail-Adresse ein.' })
      input?.focus()
      return
    }
    setResending(true)
    setResendFeedback(null)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'}/public/signup/resend`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.value.trim() }),
      })
      setResendFeedback(response.ok
        ? { error: false, message: 'Erneuter Versand angefragt. Bitte prüfen Sie Ihren Posteingang und Spam-Ordner. Nach der Bestätigung können Sie sich hier anmelden.' }
        : { error: true, message: response.status === 429 ? 'Zu viele Versuche. Bitte warten Sie eine Stunde und versuchen Sie es erneut.' : 'Der erneute Versand konnte nicht angefragt werden. Bitte versuchen Sie es später erneut.' })
    } catch {
      setResendFeedback({ error: true, message: 'Die Verbindung ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.' })
    } finally {
      setResending(false)
    }
  }

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
        <div className="login-card">
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

          {children ?? <form ref={formRef} action={formAction}>
          <h1 className="login-h1">Anmelden</h1>
          <p>Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse über den Link in der Bestätigungsmail. Danach melden Sie sich hier an und richten Ihren Verein ein.</p>

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
          <Link className="login-label underline" href={`/pilot/${encodeURIComponent(orgSlug)}/passwort-vergessen`}>
            Passwort vergessen?
          </Link>
          <p>Keine Bestätigungsmail erhalten oder Link abgelaufen? Geben Sie oben Ihre E-Mail-Adresse ein und fordern Sie die Mail erneut an.</p>
          <button type="button" onClick={resendConfirmation} disabled={resending} className="cp-focus inline-flex min-h-[44px] items-center underline">
            {resending ? 'Wird angefragt …' : 'Bestätigungsmail erneut anfordern'}
          </button>
          {resendFeedback && <p role={resendFeedback.error ? 'alert' : 'status'}>{resendFeedback.message}</p>}
          <Link href="/campspilot" className="cp-focus inline-flex min-h-[44px] items-center underline">Zurück zu CampsPilot</Link>
          </form>}
        </div>
      </div>
    </div>
  )
}
