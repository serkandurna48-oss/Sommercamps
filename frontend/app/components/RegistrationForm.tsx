'use client'

import { useEffect, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'

/** Felder aus der Backend-Antwort (POST /registrations), die wir in der Bestätigungsansicht brauchen. */
interface ConfirmedRegistration {
  id: string
  registration_token: string
  child_first_name: string
  child_last_name: string
  selected_camp_week: string
  email: string
  status: string
  payment_status: string
  photo_permission: boolean
  // Bankdaten – vom Backend aus Env-Vars befüllt, nie im Frontend hardcodiert
  bank_account_holder: string | null
  bank_iban: string | null
  bank_bic: string | null
  bank_name: string | null
  bank_purpose: string | null
}

const CAMP_WEEKS = [
  '29.06.–02.07.2026',
  '03.08.–06.08.2026',
  '05.10.–08.10.2026',
]

const JERSEY_SIZES = ['6XS–5XS (104–116)', '4XS–3XS (128–140)', '2XS (152)', 'XS (164)', 'S', 'M']

interface FormState {
  child_first_name: string
  child_last_name: string
  birth_date: string
  parent_name: string
  email: string
  phone: string
  selected_camp_week: string
  jersey_size: string
  allergies: string
  notes: string
  consent_privacy: boolean
  photo_permission: boolean
}

const EMPTY: FormState = {
  child_first_name: '',
  child_last_name: '',
  birth_date: '',
  parent_name: '',
  email: '',
  phone: '',
  selected_camp_week: '',
  jersey_size: '',
  allergies: '',
  notes: '',
  consent_privacy: false,
  photo_permission: false,
}

const input = (extra = '') =>
  `w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900
   placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black
   focus:bg-white transition-all ${extra}`

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>
}

function Group({ title, step }: { title: string; step: number }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center shrink-0">
        {step}
      </div>
      <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{title}</p>
      <div className="h-px bg-gray-100 flex-1" />
    </div>
  )
}

function HelpText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{children}</p>
}

/** Gibt alle Fehler auf einmal zurück (leeres Array = alles ok). */
function validate(form: FormState): string[] {
  const errors: string[] = []

  if (!form.child_first_name.trim()) errors.push('Vorname des Kindes fehlt.')
  if (!form.child_last_name.trim()) errors.push('Nachname des Kindes fehlt.')

  if (!form.birth_date) {
    errors.push('Geburtsdatum fehlt.')
  } else {
    const match = form.birth_date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (!match) {
      errors.push('Geburtsdatum ungültig. Format: TT.MM.JJJJ')
    } else {
      const [, d, m, y] = match
      const birth = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const minAge = new Date(today)
      minAge.setFullYear(today.getFullYear() - 12)
      const maxAge = new Date(today)
      maxAge.setFullYear(today.getFullYear() - 5)
      if (birth > maxAge) {
        errors.push('Das Kind muss mindestens 5 Jahre alt sein.')
      } else if (birth < minAge) {
        errors.push('Das Kind darf höchstens 12 Jahre alt sein.')
      }
    }
  }

  if (!form.parent_name.trim()) errors.push('Name des Elternteils fehlt.')

  if (!form.email.trim()) {
    errors.push('E-Mail-Adresse fehlt.')
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.push('Bitte eine gültige E-Mail-Adresse angeben.')
  }

  if (!form.phone.trim()) errors.push('Telefonnummer fehlt.')

  if (!form.selected_camp_week) errors.push('Bitte einen Camptermin auswählen.')

  if (!form.consent_privacy) errors.push('Datenschutzerklärung muss akzeptiert werden.')

  return errors
}

export default function RegistrationForm() {
  const searchParams = useSearchParams()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState<ConfirmedRegistration | null>(null)
  const [isPending, startTransition] = useTransition()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function handleStripeCheckout(registrationToken: string) {
    setCheckoutLoading(true)
    setCheckoutError(null)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/registrations/${registrationToken}/checkout-session`, {
        method: 'POST',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setCheckoutError(data?.detail ?? `Fehler (${res.status})`)
        return
      }
      if (data?.checkout_url) {
        window.location.href = data.checkout_url
      }
    } catch {
      setCheckoutError('Verbindung zum Server fehlgeschlagen.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const [stripeSuccess, setStripeSuccess] = useState(false)

  // URL-Parameter auswerten: ?week= für Vorausfüllen, ?stripe=success für Rückkehr von Stripe
  useEffect(() => {
    const week = searchParams.get('week') ?? ''
    if (week && CAMP_WEEKS.includes(week)) {
      setForm(prev => ({ ...prev, selected_camp_week: week }))
    }
    if (searchParams.get('stripe') === 'success') {
      setStripeSuccess(true)
    }
  }, [searchParams])

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target
    let newValue: string | boolean
    if (type === 'checkbox') {
      newValue = (e.target as HTMLInputElement).checked
    } else if (type === 'radio' && name === 'photo_permission') {
      newValue = value === 'ja'
    } else if (name === 'birth_date') {
      // Nur Ziffern behalten, dann automatisch Punkte einfügen: TT.MM.JJJJ
      const digits = value.replace(/\D/g, '').slice(0, 8)
      if (digits.length <= 2) {
        newValue = digits
      } else if (digits.length <= 4) {
        newValue = digits.slice(0, 2) + '.' + digits.slice(2)
      } else {
        newValue = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4)
      }
    } else {
      newValue = value
    }
    setForm(prev => ({ ...prev, [name]: newValue }))
    if (errors.length > 0) setErrors([])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const clientErrors = validate(form)
    if (clientErrors.length > 0) {
      setErrors(clientErrors)
      return
    }

    setErrors([])

    startTransition(async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
        const res = await fetch(`${apiUrl}/registrations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            birth_date: (() => {
              const [d, m, y] = form.birth_date.split('.')
              return `${y}-${m}-${d}`
            })(),
            jersey_size: form.jersey_size || null,
            allergies: form.allergies || null,
            notes: form.notes || null,
            photo_permission: form.photo_permission,
          }),
        })

        if (!res.ok) {
          const data = await res.json().catch(() => null)
          const detail = data?.detail
          const msg = Array.isArray(detail)
            ? detail.map((d: { msg: string }) => d.msg).join(' · ')
            : detail ? String(detail) : `Serverfehler (${res.status})`
          setErrors([msg])
          return
        }

        const data: ConfirmedRegistration = await res.json()
        setConfirmed(data)
        setForm(EMPTY)
      } catch {
        setErrors(['Verbindung zum Server fehlgeschlagen. Bitte später erneut versuchen.'])
      }
    })
  }

  if (confirmed) {
    const bankRows: [string, string | null, boolean][] = [
      ['Kontoinhaber',    confirmed.bank_account_holder, false],
      ['IBAN',            confirmed.bank_iban,           true],
      ['BIC',             confirmed.bank_bic,            false],
      ['Bank',            confirmed.bank_name,           false],
    ]

    return (
      <div className="pt-2 pb-8 space-y-6">

        {/* Erfolgs-Header */}
        <div className="text-center pb-2">
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Anmeldung eingegangen</h3>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Eine Bestätigungs-E-Mail mit den Zahlungsdaten geht in Kürze an{' '}
            <span className="font-semibold text-gray-800">{confirmed.email}</span>.
          </p>
        </div>

        {/* Reservierungs-Status */}
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3.5 flex items-start gap-3">
          <span className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Platz vorläufig reserviert</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Die Anmeldung ist vollständig bestätigt, sobald der Campbeitrag bei uns eingegangen ist.</p>
          </div>
        </div>

        {/* Anmeldedaten */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Deine Buchung</p>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-gray-500">Teilnehmer</span>
              <span className="font-semibold text-gray-900">{confirmed.child_first_name} {confirmed.child_last_name}</span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-gray-500">Camp</span>
              <span className="font-semibold text-gray-900">{confirmed.selected_camp_week}</span>
            </div>
            <div className="px-4 py-3 flex justify-between items-center text-sm">
              <span className="text-gray-500">Foto-/Videoerlaubnis</span>
              <span className="font-medium text-gray-700">
                {confirmed.photo_permission ? 'Ja, erteilt' : 'Nicht erteilt'}
              </span>
            </div>
          </div>
        </div>

        {/* Bankverbindung */}
        <div className="rounded-xl border border-green-200 overflow-hidden">
          <div className="bg-green-700 px-4 py-3">
            <p className="text-sm font-bold text-white">Bitte jetzt überweisen</p>
            <p className="text-green-200 text-xs mt-0.5">Deine Anmeldung ist bestätigt, sobald deine Zahlung eingegangen ist.</p>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {bankRows.map(([label, value, isMono]) => (
              <div key={label} className="px-4 py-3 flex justify-between items-center text-sm gap-4">
                <span className="text-gray-500 shrink-0">{label}</span>
                <span className={`font-semibold text-gray-900 text-right ${isMono ? 'font-mono tracking-wide' : ''}`}>
                  {value ?? '–'}
                </span>
              </div>
            ))}
            {/* Verwendungszweck hervorgehoben */}
            <div className="px-4 py-3 bg-amber-50">
              <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-1">Verwendungszweck (wichtig!)</p>
              <p className="font-bold text-gray-900 text-sm">{confirmed.bank_purpose ?? `Sommercamp ${confirmed.child_first_name} ${confirmed.child_last_name}`}</p>
            </div>
          </div>
        </div>

        {/* Stripe Online-Zahlung */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm space-y-3">
          <p className="font-semibold text-gray-900">Jetzt bequem online bezahlen</p>
          <p className="text-gray-600">Bezahlen Sie den Campbeitrag sicher per Kreditkarte über Stripe.</p>
          <button
            type="button"
            onClick={() => handleStripeCheckout(confirmed.registration_token)}
            disabled={checkoutLoading}
            className="w-full rounded-xl bg-black text-white text-sm font-semibold py-3 hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {checkoutLoading ? 'Weiterleitung…' : 'Jetzt online bezahlen'}
          </button>
          {checkoutError && (
            <p className="text-red-600 text-xs">{checkoutError}</p>
          )}
          <p className="text-xs text-gray-400 text-center">Alternativ können Sie auch per Überweisung bezahlen (siehe unten).</p>
        </div>

        {/* Nächste Schritte */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm space-y-3">
          <p className="font-semibold text-gray-900">Nächste Schritte</p>
          <ol className="space-y-2 text-gray-600">
            {[
              'Überweisung mit dem Verwendungszweck oben durchführen.',
              'Nach Zahlungseingang gilt die Anmeldung als vollständig bestätigt.',
              'Wir melden uns mit allen Details zu Uhrzeit und Treffpunkt.',
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <button
          onClick={() => setConfirmed(null)}
          className="w-full text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl py-2.5 transition-colors hover:border-gray-300"
        >
          Weiteres Kind anmelden
        </button>

      </div>
    )
  }

  if (stripeSuccess) {
    return (
      <div className="pt-2 pb-8 space-y-6 text-center">
        <div>
          <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">Zahlung erfolgreich</h3>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Vielen Dank! Deine Zahlung wurde übermittelt. Die Anmeldung gilt als vollständig bestätigt, sobald der Betrag bei uns eingegangen ist.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-left text-sm space-y-2">
          <p className="font-semibold text-gray-900">Was jetzt passiert</p>
          <ul className="space-y-1.5 text-gray-500">
            <li className="flex items-start gap-2"><span className="text-green-500 font-bold shrink-0">✓</span> Zahlung wurde an Stripe übermittelt</li>
            <li className="flex items-start gap-2"><span className="text-gray-400 shrink-0">→</span> Nach Zahlungseingang wird der Status automatisch aktualisiert</li>
            <li className="flex items-start gap-2"><span className="text-gray-400 shrink-0">→</span> Wir melden uns mit Details zu Uhrzeit und Treffpunkt</li>
          </ul>
        </div>

        <a
          href="/"
          className="inline-block w-full bg-gray-900 text-white font-semibold py-3 rounded-xl hover:bg-black transition-colors text-sm"
        >
          Zurück zur Startseite
        </a>
      </div>
    )
  }

  return (
    <>
    <form onSubmit={handleSubmit} noValidate className="space-y-8">

      {/* ── Kind ──────────────────────────────────────────────── */}
      <div>
        <Group title="Kind" step={1} />
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Vorname *</Label>
              <input type="text" name="child_first_name" value={form.child_first_name}
                onChange={handleChange} required autoComplete="given-name"
                placeholder="Max" className={input()} />
            </div>
            <div>
              <Label>Nachname *</Label>
              <input type="text" name="child_last_name" value={form.child_last_name}
                onChange={handleChange} required autoComplete="family-name"
                placeholder="Mustermann" className={input()} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Geburtsdatum *</Label>
              <input
                type="text"
                inputMode="numeric"
                name="birth_date"
                value={form.birth_date}
                onChange={handleChange}
                required
                placeholder="TT.MM.JJJJ"
                maxLength={10}
                className={input()}
              />
              <HelpText>Kinder von 5 bis 12 Jahren</HelpText>
            </div>
            <div>
              <Label>Trikotgröße</Label>
              <select name="jersey_size" value={form.jersey_size}
                onChange={handleChange} className={input()}>
                <option value="">Größe wählen (optional)</option>
                {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <HelpText>Optional – wird für das Camp-Trikot benötigt</HelpText>
            </div>
          </div>
        </div>
      </div>

      {/* ── Elternteil ────────────────────────────────────────── */}
      <div>
        <Group title="Erziehungsberechtigte*r" step={2} />
        <div className="space-y-4">
          <div>
            <Label>Vor- und Nachname *</Label>
            <input type="text" name="parent_name" value={form.parent_name}
              onChange={handleChange} required autoComplete="name"
              placeholder="Anna Mustermann" className={input()} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>E-Mail-Adresse *</Label>
              <input type="email" name="email" value={form.email}
                onChange={handleChange} required autoComplete="email"
                placeholder="anna@beispiel.de" className={input()} />
              <HelpText>Hieran werden die Zahlungsinformationen gesendet</HelpText>
            </div>
            <div>
              <Label>Telefonnummer *</Label>
              <input type="tel" name="phone" value={form.phone}
                onChange={handleChange} required autoComplete="tel"
                placeholder="0561 123456" className={input()} />
              <HelpText>Für Rückfragen zum Camp</HelpText>
            </div>
          </div>
        </div>
      </div>

      {/* ── Camp ──────────────────────────────────────────────── */}
      <div>
        <Group title="Camp & Besonderheiten" step={3} />
        <div className="space-y-4">
          <div>
            <Label>Gewünschter Termin *</Label>
            <select name="selected_camp_week" value={form.selected_camp_week}
              onChange={handleChange} required className={input()}>
              <option value="">Termin auswählen …</option>
              {CAMP_WEEKS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <Label>Allergien / Unverträglichkeiten</Label>
            <textarea name="allergies" value={form.allergies} onChange={handleChange}
              rows={2} placeholder="z. B. Laktoseintoleranz, Nussallergie …"
              className={input('resize-none')} />
            <HelpText>Wichtig für die Verpflegungsplanung</HelpText>
          </div>
          <div>
            <Label>Sonstige Hinweise</Label>
            <textarea name="notes" value={form.notes} onChange={handleChange}
              rows={2} placeholder="z. B. besondere Bedürfnisse, Fahrtgemeinschaft …"
              className={input('resize-none')} />
          </div>
        </div>
      </div>

      {/* ── Bilderrechte ──────────────────────────────────────── */}
      <div>
        <Group title="Foto- & Videoerlaubnis" step={4} />
        <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-4 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            Dürfen während des Camps Fotos und Videos Ihres Kindes aufgenommen und
            auf der Vereinshomepage sowie den Social-Media-Kanälen des KSV Baunatal
            veröffentlicht werden?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'nein', label: 'Nein, kein Einverständnis', active: !form.photo_permission },
              { value: 'ja',   label: 'Ja, Einverständnis erteilt', active: form.photo_permission },
            ].map(opt => (
              <label
                key={opt.value}
                className={`flex items-center justify-center text-center border-2 rounded-xl px-3 py-3 cursor-pointer transition-all ${
                  opt.active
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name="photo_permission"
                  value={opt.value}
                  checked={opt.active}
                  onChange={handleChange}
                  className="sr-only"
                />
                <span className="text-sm font-semibold leading-snug">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Datenschutz ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3.5 mt-2">
        <input
          type="checkbox" id="consent_privacy" name="consent_privacy"
          checked={form.consent_privacy} onChange={handleChange} required
          className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-black"
        />
        <label htmlFor="consent_privacy" className="text-sm text-gray-600 leading-relaxed">
          Ich stimme der Verarbeitung meiner Daten gemäß der{' '}
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer"
             className="text-gray-900 underline underline-offset-2 hover:opacity-70">
            Datenschutzerklärung
          </a>{' '}
          zu. *
        </label>
      </div>

      {/* ── Fehler ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3.5 text-sm text-red-700">
          <div className="flex items-start gap-2.5">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <ul className={errors.length === 1 ? '' : 'list-disc list-inside space-y-1'}>
              {errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────── */}
      <div className="pt-2 space-y-4">
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-gray-900 hover:bg-black disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-base shadow-sm"
        >
          {isPending ? 'Wird gesendet …' : 'Verbindlich anmelden'}
        </button>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
            Bestätigung per E-Mail
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            Sichere Datenverarbeitung
          </span>
          <span className="flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            DSGVO-konform
          </span>
        </div>
        <p className="text-center text-xs text-gray-400">* Pflichtfeld</p>
      </div>
    </form>
    </>
  )
}
