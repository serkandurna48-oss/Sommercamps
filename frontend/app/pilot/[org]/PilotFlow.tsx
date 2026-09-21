'use client'

import { useState } from 'react'
import type { CampPublic, OrganizationPublic, RegistrationCreateInput } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 ' +
  'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-black focus:border-black'

const EMPTY: RegistrationCreateInput = {
  parent_first_name: '',
  parent_last_name: '',
  parent_email: '',
  parent_phone: '',
  child_first_name: '',
  child_last_name: '',
  child_birth_date: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  medical_notes: '',
  allergies: '',
  photo_permission: false,
  terms_accepted: false,
  privacy_accepted: false,
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100)
}

function CampForm({ orgSlug, camp }: { orgSlug: string; camp: CampPublic }) {
  const [form, setForm] = useState<RegistrationCreateInput>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ status: string; payment_status: string; registration_token: string } | null>(null)

  function set<K extends keyof RegistrationCreateInput>(key: K, value: RegistrationCreateInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.terms_accepted || !form.privacy_accepted) {
      setError('Bitte AGB und Datenschutz bestätigen.')
      return
    }

    setSubmitting(true)
    try {
      const outcome = await submitRegistration(orgSlug, camp.slug, {
        ...form,
        emergency_contact_name: form.emergency_contact_name || null,
        emergency_contact_phone: form.emergency_contact_phone || null,
        medical_notes: form.medical_notes || null,
        allergies: form.allergies || null,
      })
      if (!outcome.ok) {
        setError(outcome.detail)
        return
      }
      setResult(outcome.data)
    } catch {
      setError('Verbindung zum Staging-Backend fehlgeschlagen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">Anmeldung übermittelt (Staging-Testdaten)</p>
        <dl className="mt-2 space-y-1">
          <div><dt className="inline text-green-700">Status: </dt><dd className="inline">{result.status}</dd></div>
          <div><dt className="inline text-green-700">Zahlungsstatus: </dt><dd className="inline">{result.payment_status}</dd></div>
          <div><dt className="inline text-green-700">registration_token: </dt><dd className="inline font-mono text-xs break-all">{result.registration_token}</dd></div>
        </dl>
        {result.status === 'waitlist' && (
          <p className="mt-2 text-green-800">Camp war voll — Anmeldung wurde korrekt auf die Warteliste gesetzt.</p>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Vorname Elternteil *" className={inputClass}
          value={form.parent_first_name} onChange={e => set('parent_first_name', e.target.value)} />
        <input required placeholder="Nachname Elternteil *" className={inputClass}
          value={form.parent_last_name} onChange={e => set('parent_last_name', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input required type="email" placeholder="E-Mail *" className={inputClass}
          value={form.parent_email} onChange={e => set('parent_email', e.target.value)} />
        <input required placeholder="Telefon *" className={inputClass}
          value={form.parent_phone} onChange={e => set('parent_phone', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input required placeholder="Vorname Kind *" className={inputClass}
          value={form.child_first_name} onChange={e => set('child_first_name', e.target.value)} />
        <input required placeholder="Nachname Kind *" className={inputClass}
          value={form.child_last_name} onChange={e => set('child_last_name', e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-gray-500">Geburtsdatum Kind *</label>
        <input required type="date" className={inputClass}
          value={form.child_birth_date} onChange={e => set('child_birth_date', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input placeholder="Notfallkontakt Name" className={inputClass}
          value={form.emergency_contact_name ?? ''} onChange={e => set('emergency_contact_name', e.target.value)} />
        <input placeholder="Notfallkontakt Telefon" className={inputClass}
          value={form.emergency_contact_phone ?? ''} onChange={e => set('emergency_contact_phone', e.target.value)} />
      </div>
      <textarea placeholder="Allergien" rows={2} className={inputClass}
        value={form.allergies ?? ''} onChange={e => set('allergies', e.target.value)} />
      <textarea placeholder="Medizinische Hinweise" rows={2} className={inputClass}
        value={form.medical_notes ?? ''} onChange={e => set('medical_notes', e.target.value)} />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.photo_permission}
          onChange={e => set('photo_permission', e.target.checked)} />
        Foto-/Videoerlaubnis
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input required type="checkbox" checked={form.terms_accepted}
          onChange={e => set('terms_accepted', e.target.checked)} />
        AGB akzeptiert (Testdaten) *
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input required type="checkbox" checked={form.privacy_accepted}
          onChange={e => set('privacy_accepted', e.target.checked)} />
        Datenschutz akzeptiert (Testdaten) *
      </label>

      {error && <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

      <button type="submit" disabled={submitting}
        className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
        {submitting ? 'Wird gesendet …' : `Anmelden – ${formatPrice(camp.price_cents, camp.currency)}`}
      </button>
    </form>
  )
}

export default function PilotFlow({ org, camps }: { org: OrganizationPublic; camps: CampPublic[] }) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(camps.length === 1 ? camps[0].slug : null)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="font-semibold text-gray-900">{org.name}</p>
        <p className="text-sm text-gray-500">{org.contact_email}</p>
      </div>

      <ul className="space-y-2">
        {camps.map(camp => (
          <li key={camp.slug} className="rounded-xl border border-gray-200 p-4">
            <button
              type="button"
              onClick={() => setSelectedSlug(prev => (prev === camp.slug ? null : camp.slug))}
              className="flex w-full items-center justify-between text-left"
            >
              <span>
                <span className="font-semibold text-gray-900">{camp.title}</span>
                <span className="ml-2 text-sm text-gray-500">
                  {camp.start_date} – {camp.end_date} · Kapazität {camp.capacity}
                </span>
              </span>
              <span className="text-sm text-gray-500">
                {camp.registration_open ? (selectedSlug === camp.slug ? 'Schließen' : 'Anmelden') : 'Geschlossen'}
              </span>
            </button>
            {selectedSlug === camp.slug && camp.registration_open && (
              <div className="mt-4">
                <CampForm orgSlug={org.slug} camp={camp} />
              </div>
            )}
          </li>
        ))}
        {camps.length === 0 && (
          <li className="rounded-xl border border-gray-200 p-4 text-sm text-gray-500">
            Keine veröffentlichten Camps für diese Organisation.
          </li>
        )}
      </ul>
    </div>
  )
}
