'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'

const SAAS_URL = () => process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'

interface FormFields {
  organization_name: string
  contact_person_name: string
  email: string
  password: string
}

interface SuccessState {
  slug: string
  email: string
  emailSent: boolean
}

function serverError(status: number): string {
  if (status === 409) return 'Eine Registrierung mit dieser E-Mail-Adresse ist bereits vorhanden. Bitte melden Sie sich an oder setzen Sie Ihr Passwort zurück.'
  if (status === 422) return 'Dieser Vereinsname ist nicht verfügbar oder Ihre Angaben sind ungültig. Bitte prüfen Sie Ihre Eingaben.'
  if (status === 429) return 'Zu viele Registrierungsversuche. Bitte warten Sie eine Stunde und versuchen Sie es erneut.'
  if (status === 503) return 'Registrierung momentan nicht möglich. Bitte versuchen Sie es später erneut.'
  return 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
}

export default function RegistrierenForm() {
  const [fields, setFields] = useState<FormFields>({ organization_name: '', contact_person_name: '', email: '', password: '' })
  const [termsChecked, setTermsChecked] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormFields | 'terms', string>>>({})
  const [serverErr, setServerErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<SuccessState | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    setResendCooldown(60)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormFields | 'terms', string>> = {}
    if (!fields.organization_name.trim()) errs.organization_name = 'Bitte geben Sie den Vereinsnamen ein.'
    if (!fields.contact_person_name.trim()) errs.contact_person_name = 'Bitte geben Sie einen Ansprechpartner an.'
    if (!fields.email.trim()) errs.email = 'Bitte geben Sie Ihre E-Mail-Adresse ein.'
    if (fields.password.length < 10) errs.password = 'Das Passwort muss mindestens 10 Zeichen lang sein.'
    if (!termsChecked) errs.terms = 'Bitte akzeptieren Sie die Nutzungsbedingungen.'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setServerErr('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${SAAS_URL()}/public/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, accepted_terms: true }),
      })
      if (!res.ok) {
        setServerErr(serverError(res.status))
        return
      }
      const data = await res.json() as { organization_slug: string; confirmation_email_sent: boolean }
      setSuccess({ slug: data.organization_slug, email: fields.email, emailSent: data.confirmation_email_sent })
    } catch {
      setServerErr(serverError(0))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || !success) return
    startCooldown()
    try {
      await fetch(`${SAAS_URL()}/public/signup/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: success.email }),
      })
    } catch {
      // best-effort: cooldown still applies
    }
  }

  if (success) {
    return (
      <div className="reg-confirm">
        <div>
          <p className="label">Fast geschafft</p>
          <h1 className="d2" style={{ marginTop: 14 }}>Bitte bestätigen Sie Ihre E-Mail-Adresse.</h1>
        </div>
        {!success.emailSent && (
          <div
            className="reg-banner"
            role="alert"
            style={{ borderColor: 'rgba(200,160,60,0.4)', background: 'rgba(200,160,60,0.1)' }}
          >
            Die Bestätigungsmail konnte leider nicht zugestellt werden. Bitte klicken Sie auf {'„E-Mail erneut senden“'}.
          </div>
        )}
        {success.emailSent && (
          <p style={{ color: 'var(--fog-2)', fontSize: 17 }}>
            Wir haben eine E-Mail an{' '}
            <strong className="reg-confirm-email">{success.email}</strong> gesendet.
          </p>
        )}
        <p style={{ color: 'var(--fog-3)', fontSize: 15 }}>Der Bestätigungslink ist 24 Stunden gültig.</p>
        <div className="reg-resend-row">
          <button
            type="button"
            className={`btn${success.emailSent ? '' : ' fill'}`}
            disabled={resendCooldown > 0}
            aria-disabled={resendCooldown > 0}
            onClick={handleResend}
          >
            {resendCooldown > 0 ? `Erneut senden (${resendCooldown} s)` : 'E-Mail erneut senden'}
          </button>
          <Link href={`/pilot/${success.slug}/login`} className="btn ghost">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form className="reg-form" noValidate onSubmit={handleSubmit} aria-label="Vereinsregistrierung">
      <div className="reg-head">
        <p className="label">Kostenlos registrieren</p>
        <h1 className="d2" style={{ marginTop: 12 }}>Verein anlegen.</h1>
        <p style={{ color: 'var(--fog-2)', fontSize: 17 }}>Wir richten Ihren Verein ein – Sie starten heute noch.</p>
      </div>

      {serverErr && (
        <div className="reg-banner error" role="alert">{serverErr}</div>
      )}

      <div className="reg-field">
        <label className="reg-field-label" htmlFor="rf-organization_name">Vereinsname oder Fußballschule</label>
        <input
          id="rf-organization_name"
          className="reg-input"
          type="text"
          autoComplete="organization"
          aria-invalid={!!errors.organization_name}
          aria-describedby={errors.organization_name ? 'rf-organization_name-err' : undefined}
          value={fields.organization_name}
          onChange={e => setFields(f => ({ ...f, organization_name: e.target.value }))}
        />
        {errors.organization_name && <p id="rf-organization_name-err" className="reg-err" role="alert">{errors.organization_name}</p>}
      </div>

      <div className="reg-field">
        <label className="reg-field-label" htmlFor="rf-contact_person_name">Ansprechpartner</label>
        <input
          id="rf-contact_person_name"
          className="reg-input"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.contact_person_name}
          aria-describedby={errors.contact_person_name ? 'rf-contact_person_name-err' : undefined}
          value={fields.contact_person_name}
          onChange={e => setFields(f => ({ ...f, contact_person_name: e.target.value }))}
        />
        {errors.contact_person_name && <p id="rf-contact_person_name-err" className="reg-err" role="alert">{errors.contact_person_name}</p>}
      </div>

      <div className="reg-field">
        <label className="reg-field-label" htmlFor="rf-email">E-Mail-Adresse</label>
        <input
          id="rf-email"
          className="reg-input"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'rf-email-err' : undefined}
          value={fields.email}
          onChange={e => setFields(f => ({ ...f, email: e.target.value }))}
        />
        {errors.email && <p id="rf-email-err" className="reg-err" role="alert">{errors.email}</p>}
      </div>

      <div className="reg-field">
        <label className="reg-field-label" htmlFor="rf-password">Passwort</label>
        <div className="reg-input-wrap">
          <input
            id="rf-password"
            className="reg-input"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'rf-password-err' : 'rf-password-hint'}
            value={fields.password}
            onChange={e => setFields(f => ({ ...f, password: e.target.value }))}
          />
          <button
            type="button"
            className="reg-show-toggle"
            aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
            onClick={() => setShowPw(p => !p)}
          >{showPw ? 'Verbergen' : 'Anzeigen'}</button>
        </div>
        {!errors.password && <p id="rf-password-hint" className="reg-hint">Mindestens 10 Zeichen.</p>}
        {errors.password && <p id="rf-password-err" className="reg-err" role="alert">{errors.password}</p>}
      </div>

      <div>
        <div className="reg-check">
          <input
            type="checkbox"
            id="rf-terms"
            aria-describedby={errors.terms ? 'rf-terms-err' : undefined}
            checked={termsChecked}
            onChange={e => setTermsChecked(e.target.checked)}
          />
          <label htmlFor="rf-terms" className="reg-check-label">
            Ich akzeptiere die{' '}
            <Link href="/campspilot/teilnahmebedingungen">Nutzungsbedingungen</Link>
            {' '}und habe die{' '}
            <Link href="/campspilot/datenschutz">Datenschutzerklärung</Link>
            {' '}gelesen.
          </label>
        </div>
        {errors.terms && <p id="rf-terms-err" className="reg-err" role="alert" style={{ marginTop: 6 }}>{errors.terms}</p>}
      </div>

      <button type="submit" className="btn fill reg-submit" disabled={submitting}>
        {submitting ? 'Wird registriert …' : 'Verein kostenlos anlegen'}
      </button>

      <p style={{ color: 'var(--fog-3)', fontSize: 14 }}>
        Bereits registriert?{' '}
        <Link href="/campspilot" style={{ color: 'var(--fog-2)', textDecoration: 'underline' }}>
          Zurück zur Übersicht
        </Link>
      </p>
    </form>
  )
}
