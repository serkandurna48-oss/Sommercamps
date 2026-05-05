'use client'

import { useState, useTransition } from 'react'

/** Felder aus der Backend-Antwort, die wir in der Bestätigungsansicht brauchen. */
interface ConfirmedRegistration {
  id: string
  registration_token: string
  child_first_name: string
  child_last_name: string
  selected_camp_week: string
  email: string
  status: string
  payment_status: string
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
}

const input = (extra = '') =>
  `w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900
   placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black
   focus:bg-white transition-all ${extra}`

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-medium text-gray-700 mb-1.5">{children}</label>
}

function Group({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">{title}</p>
      <div className="h-px bg-gray-200 flex-1" />
    </div>
  )
}

/** Gibt alle Fehler auf einmal zurück (leeres Array = alles ok). */
function validate(form: FormState): string[] {
  const errors: string[] = []

  if (!form.child_first_name.trim()) errors.push('Vorname des Kindes fehlt.')
  if (!form.child_last_name.trim()) errors.push('Nachname des Kindes fehlt.')

  if (!form.birth_date) {
    errors.push('Geburtsdatum fehlt.')
  } else {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const birth = new Date(form.birth_date)
    const minDate = new Date(today)
    minDate.setFullYear(today.getFullYear() - 18)
    const maxDate = new Date(today)
    maxDate.setFullYear(today.getFullYear() - 5)
    if (birth < minDate || birth > maxDate) {
      errors.push('Das Kind muss zwischen 5 und 18 Jahren alt sein.')
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
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState<ConfirmedRegistration | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value, type } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
    // Fehler beim Tippen ausblenden, damit die Liste nicht nervt
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
            jersey_size: form.jersey_size || null,
            allergies: form.allergies || null,
            notes: form.notes || null,
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
    return (
      <div className="py-2 space-y-5">

        {/* Erfolgs-Header */}
        <div className="text-center pb-1">
          <div className="w-14 h-14 bg-green-50 border-2 border-green-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-1.5">Anmeldung eingegangen!</h3>
          <p className="text-gray-500 text-sm leading-relaxed">
            Eine Bestätigungs-E-Mail geht in Kürze an{' '}
            <span className="font-medium text-gray-700">{confirmed.email}</span>.
          </p>
        </div>

        {/* Zusammenfassung */}
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          <div className="px-4 py-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Teilnehmer</span>
            <span className="font-semibold text-gray-900">
              {confirmed.child_first_name} {confirmed.child_last_name}
            </span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Termin</span>
            <span className="font-medium text-gray-900">{confirmed.selected_camp_week}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Anmeldestatus</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-yellow-700">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
              Angemeldet
            </span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Zahlung</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-orange-700">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
              Ausstehend
            </span>
          </div>
        </div>

        {/* Nächste Schritte */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3.5 text-sm text-blue-800">
          <p className="font-semibold mb-1.5">Nächste Schritte</p>
          <ul className="space-y-1 text-blue-700">
            <li>→ Du erhältst in Kürze eine Bestätigungs-E-Mail von uns.</li>
            <li>→ Wir melden uns mit allen Details zu Kosten, Zeiten und Treffpunkt.</li>
          </ul>
        </div>

        {/* Zahlung – Platzhalter für Phase 3 */}
        <button
          disabled
          title="Online-Zahlung wird in Kürze freigeschaltet"
          className="w-full bg-gray-100 text-gray-400 font-semibold py-3.5 rounded-xl text-sm cursor-not-allowed select-none"
        >
          Online bezahlen – folgt in Kürze
        </button>

        <button
          onClick={() => setConfirmed(null)}
          className="w-full text-sm text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
        >
          Weitere Anmeldung einreichen
        </button>

      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">

      {/* ── Kind ──────────────────────────────────────────────── */}
      <div>
        <Group title="Kind" />
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
              <input type="date" name="birth_date" value={form.birth_date}
                onChange={handleChange} required className={input()} />
            </div>
            <div>
              <Label>Trikotnummer / Größe</Label>
              <select name="jersey_size" value={form.jersey_size}
                onChange={handleChange} className={input()}>
                <option value="">– bitte wählen –</option>
                {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Elternteil ────────────────────────────────────────── */}
      <div>
        <Group title="Elternteil / Erziehungsberechtigte*r" />
        <div className="space-y-4">
          <div>
            <Label>Name *</Label>
            <input type="text" name="parent_name" value={form.parent_name}
              onChange={handleChange} required autoComplete="name"
              placeholder="Anna Mustermann" className={input()} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>E-Mail *</Label>
              <input type="email" name="email" value={form.email}
                onChange={handleChange} required autoComplete="email"
                placeholder="anna@beispiel.de" className={input()} />
            </div>
            <div>
              <Label>Telefon *</Label>
              <input type="tel" name="phone" value={form.phone}
                onChange={handleChange} required autoComplete="tel"
                placeholder="0561 123456" className={input()} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Camp ──────────────────────────────────────────────── */}
      <div>
        <Group title="Camp-Auswahl" />
        <div className="space-y-4">
          <div>
            <Label>Wunschtermin *</Label>
            <select name="selected_camp_week" value={form.selected_camp_week}
              onChange={handleChange} required className={input()}>
              <option value="">– bitte wählen –</option>
              {CAMP_WEEKS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <Label>Allergien / Unverträglichkeiten</Label>
            <textarea name="allergies" value={form.allergies} onChange={handleChange}
              rows={2} placeholder="z.B. Laktoseintoleranz, Nussallergie …"
              className={input('resize-none')} />
          </div>
          <div>
            <Label>Sonstige Hinweise</Label>
            <textarea name="notes" value={form.notes} onChange={handleChange}
              rows={2} placeholder="z.B. besondere Bedürfnisse, Fahrtgemeinschaft …"
              className={input('resize-none')} />
          </div>
        </div>
      </div>

      {/* ── Datenschutz ───────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3.5">
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
      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-black hover:opacity-90 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-opacity text-base"
      >
        {isPending ? 'Wird gesendet …' : 'Verbindlich anmelden'}
      </button>

      <p className="text-center text-xs text-gray-400">* Pflichtfeld</p>
    </form>
  )
}
