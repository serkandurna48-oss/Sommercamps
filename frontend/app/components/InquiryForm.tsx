'use client'

import { useId, useState, type FormEvent } from 'react'
import Link from 'next/link'

// ---------------------------------------------------------------------------
// CP-JK-101 — Trainingsanfrage
//
// Ersetzt den mailto-Interimsblock durch ein echtes Formular gegen
// POST /inquiries. Gestaltung bewusst am bestehenden Anmeldeformular
// orientiert, damit beide Mandanten sich gleich anfühlen.
//
// Datenschutz: Es werden Daten Minderjähriger verarbeitet. Erhoben wird nur der
// Jahrgang, nicht das vollständige Geburtsdatum — mehr braucht eine Anfrage
// nicht (DSGVO Art. 5 Abs. 1 lit. c).
// ---------------------------------------------------------------------------

const field = (extra = '') =>
  `w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base sm:text-sm text-gray-900
   placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black
   focus:bg-white transition-all ${extra}`

interface InquiryFormProps {
  /** Auswahlmöglichkeiten für „Worum geht es?" — kommt aus der Mandantenkonfiguration. */
  topics: string[]
}

interface FormState {
  player_name: string
  birth_year: string
  topic: string
  parent_email: string
  message: string
  consent_privacy: boolean
}

const EMPTY: FormState = {
  player_name: '',
  birth_year: '',
  topic: '',
  parent_email: '',
  message: '',
  consent_privacy: false,
}

/** Gibt alle Fehler auf einmal zurück (leeres Array = alles ok). */
function validate(form: FormState): string[] {
  const errors: string[] = []
  const thisYear = new Date().getFullYear()

  if (!form.player_name.trim()) errors.push('Name des Spielers fehlt.')
  if (!form.birth_year.trim()) {
    errors.push('Jahrgang fehlt.')
  } else if (!/^\d{4}$/.test(form.birth_year.trim())) {
    errors.push('Jahrgang bitte vierstellig angeben, z. B. 2013.')
  } else {
    const year = Number(form.birth_year)
    if (year > thisYear || year < thisYear - 40) {
      errors.push(`Jahrgang muss zwischen ${thisYear - 40} und ${thisYear} liegen.`)
    }
  }
  if (!form.topic) errors.push('Bitte wähle aus, worum es geht.')
  if (!form.parent_email.trim()) {
    errors.push('E-Mail-Adresse fehlt.')
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.parent_email.trim())) {
    errors.push('E-Mail-Adresse sieht nicht gültig aus.')
  }
  if (form.message.length > 2000) errors.push('Nachricht ist zu lang (max. 2000 Zeichen).')
  if (!form.consent_privacy) errors.push('Bitte stimme der Datenschutzerklärung zu.')

  return errors
}

export default function InquiryForm({ topics }: InquiryFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<string[]>([])
  const [isSending, setIsSending] = useState(false)
  const [sent, setSent] = useState(false)

  const uid = useId()
  const id = (name: string) => `${uid}-${name}`

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSending) return // Doppeltes Absenden verhindern

    const found = validate(form)
    setErrors(found)
    if (found.length > 0) return

    setIsSending(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/inquiries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_name: form.player_name.trim(),
          birth_year: Number(form.birth_year),
          topic: form.topic,
          parent_email: form.parent_email.trim(),
          message: form.message.trim() || null,
          consent_privacy: form.consent_privacy,
        }),
      })

      if (!res.ok) {
        // Validierungsfehler des Backends durchreichen, sonst neutrale Meldung.
        let detail = 'Die Anfrage konnte nicht gesendet werden. Bitte versuche es später noch einmal.'
        if (res.status === 422) {
          const body = await res.json().catch(() => null)
          if (body && typeof body.detail === 'string') detail = body.detail
        }
        setErrors([detail])
        return
      }

      setSent(true)
    } catch {
      setErrors(['Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.'])
    } finally {
      setIsSending(false)
    }
  }

  if (sent) {
    return (
      <div className="text-center py-6" role="status" aria-live="polite">
        <div className="w-14 h-14 rounded-2xl bg-[var(--brand-accent)]/10 text-[var(--brand-accent)] flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="font-bold text-gray-900 text-lg mb-2">Anfrage ist angekommen</p>
        <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
          Wir melden uns persönlich bei dir – meist innerhalb weniger Tage.
          Eine Bestätigung brauchst du nicht abzuwarten.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {errors.length > 0 && (
        <div role="alert" aria-live="assertive" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3.5 text-sm text-red-700">
          <p className="font-semibold mb-1">Bitte prüfe noch einmal:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {errors.map(err => <li key={err}>{err}</li>)}
          </ul>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={id('player')} className="block text-sm font-medium text-gray-700 mb-1.5">
            Name des Spielers *
          </label>
          <input
            id={id('player')}
            type="text"
            value={form.player_name}
            onChange={e => setForm({ ...form, player_name: e.target.value })}
            autoComplete="name"
            placeholder="Vor- und Nachname"
            className={field()}
          />
        </div>
        <div>
          <label htmlFor={id('year')} className="block text-sm font-medium text-gray-700 mb-1.5">
            Jahrgang *
          </label>
          <input
            id={id('year')}
            type="text"
            inputMode="numeric"
            value={form.birth_year}
            onChange={e => setForm({ ...form, birth_year: e.target.value })}
            placeholder="z. B. 2013"
            className={field()}
          />
        </div>
      </div>

      <div>
        <label htmlFor={id('topic')} className="block text-sm font-medium text-gray-700 mb-1.5">
          Worum geht es? *
        </label>
        <select
          id={id('topic')}
          value={form.topic}
          onChange={e => setForm({ ...form, topic: e.target.value })}
          className={field()}
        >
          <option value="">Bitte auswählen …</option>
          {topics.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor={id('email')} className="block text-sm font-medium text-gray-700 mb-1.5">
          E-Mail der Eltern *
        </label>
        <input
          id={id('email')}
          type="email"
          value={form.parent_email}
          onChange={e => setForm({ ...form, parent_email: e.target.value })}
          autoComplete="email"
          placeholder="name@beispiel.de"
          className={field()}
        />
        <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">Hierüber melden wir uns bei dir.</p>
      </div>

      <div>
        <label htmlFor={id('message')} className="block text-sm font-medium text-gray-700 mb-1.5">
          Nachricht
        </label>
        <textarea
          id={id('message')}
          rows={3}
          value={form.message}
          onChange={e => setForm({ ...form, message: e.target.value })}
          placeholder="Woran möchtest du arbeiten?"
          className={field('resize-y')}
        />
      </div>

      <div className="flex items-start gap-3">
        <input
          id={id('consent')}
          type="checkbox"
          checked={form.consent_privacy}
          onChange={e => setForm({ ...form, consent_privacy: e.target.checked })}
          className="mt-1 w-4 h-4 shrink-0 rounded border-gray-300 text-gray-900 focus:ring-2 focus:ring-black"
        />
        <label htmlFor={id('consent')} className="text-sm text-gray-600 leading-relaxed">
          Ich stimme der Verarbeitung meiner Daten gemäß der{' '}
          <Link href="/datenschutz" className="underline underline-offset-2 hover:text-gray-900 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-1">
            Datenschutzerklärung
          </Link>{' '}
          zu. *
        </label>
      </div>

      <button
        type="submit"
        disabled={isSending}
        className="w-full bg-gray-900 hover:bg-black active:bg-black disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
      >
        {isSending ? 'Wird gesendet …' : 'Anfrage senden'}
      </button>

      <p className="text-xs text-gray-400 leading-relaxed text-center">
        Deine Daten werden ausschließlich zur Bearbeitung deiner Anfrage genutzt.
        Rechtsgrundlage: Art.&nbsp;6 Abs.&nbsp;1 lit.&nbsp;b DSGVO. * Pflichtfeld
      </p>
    </form>
  )
}
