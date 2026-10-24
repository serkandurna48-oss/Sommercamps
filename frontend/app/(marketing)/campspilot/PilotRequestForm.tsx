'use client'

import { useState } from 'react'

const CONTACT_EMAIL = 'hallo@campspilot.app'
const SAAS_URL = () => process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'

type SendState = 'idle' | 'sending' | 'success' | 'error429' | 'error503'

interface FieldErrors {
  verein?: string
  email?: string
}

function validateFields(verein: string, email: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!verein.trim()) {
    errors.verein = 'Bitte geben Sie den Vereinsnamen ein.'
  }
  if (!email.trim()) {
    errors.email = 'Bitte geben Sie eine E-Mail-Adresse ein.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.'
  }
  return errors
}

export default function PilotRequestForm() {
  const [sendState, setSendState] = useState<SendState>('idle')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  if (sendState === 'success') {
    return (
      <p className="prf-success">
        Danke. Wir melden uns innerhalb eines Werktags bei Ihnen.
      </p>
    )
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const verein = (fd.get('verein') as string) ?? ''
    const email = (fd.get('email') as string) ?? ''
    const telefon = ((fd.get('telefon') as string) ?? '').trim()
    const nachricht = ((fd.get('nachricht') as string) ?? '').trim()
    const website = (fd.get('website') as string) ?? ''

    const errors = validateFields(verein, email)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    setSendState('sending')
    setFieldErrors({})
    try {
      const body: Record<string, string> = {
        verein: verein.trim(),
        email: email.trim(),
        website,
      }
      if (telefon) body.telefon = telefon
      if (nachricht) body.nachricht = nachricht

      const resp = await fetch(`${SAAS_URL()}/public/pilot-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (resp.ok || resp.status === 204) {
        setSendState('success')
      } else if (resp.status === 429) {
        setSendState('error429')
      } else {
        setSendState('error503')
      }
    } catch {
      setSendState('error503')
    }
  }

  return (
    <form className="form" noValidate onSubmit={handleSubmit}>
      <label htmlFor="prf-verein">
        <span>Verein oder Fußballschule</span>
        <input
          id="prf-verein"
          name="verein"
          type="text"
          placeholder="KSV Baunatal"
          autoComplete="organization"
          aria-describedby={fieldErrors.verein ? 'prf-verein-err' : undefined}
          onChange={() => setFieldErrors(prev => ({ ...prev, verein: undefined }))}
        />
        {fieldErrors.verein && (
          <span id="prf-verein-err" className="prf-err" role="alert">
            {fieldErrors.verein}
          </span>
        )}
      </label>
      <label htmlFor="prf-email">
        <span>E-Mail</span>
        <input
          id="prf-email"
          name="email"
          type="email"
          placeholder="name@verein.de"
          autoComplete="email"
          aria-describedby={fieldErrors.email ? 'prf-email-err' : undefined}
          onChange={() => setFieldErrors(prev => ({ ...prev, email: undefined }))}
        />
        {fieldErrors.email && (
          <span id="prf-email-err" className="prf-err" role="alert">
            {fieldErrors.email}
          </span>
        )}
      </label>
      <label htmlFor="prf-telefon">
        <span>
          Telefon <span className="prf-opt">(optional)</span>
        </span>
        <input
          id="prf-telefon"
          name="telefon"
          type="tel"
          placeholder="+49 561 …"
          autoComplete="tel"
        />
      </label>
      {/* Honeypot — hidden from users, filled by bots */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        className="prf-honeypot"
        aria-hidden="true"
      />
      <label htmlFor="prf-nachricht" className="prf-full">
        <span>
          Nachricht <span className="prf-opt">(optional)</span>
        </span>
        <textarea
          id="prf-nachricht"
          name="nachricht"
          rows={3}
          placeholder="Was möchten Sie uns mitteilen?"
        />
      </label>
      {sendState === 'error429' && (
        <p className="prf-err prf-full" role="alert">
          Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut oder schreiben Sie
          direkt an <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      )}
      {sendState === 'error503' && (
        <p className="prf-err prf-full" role="alert">
          Das Formular ist gerade nicht verfügbar. Bitte schreiben Sie uns direkt an{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      )}
      <div className="act">
        <button className="btn fill" type="submit" disabled={sendState === 'sending'}>
          {sendState === 'sending' ? 'Wird gesendet …' : 'Pilotplatz anfragen'}
        </button>
      </div>
    </form>
  )
}
