'use client'

import { useState } from 'react'
import type { CampPublic, OrganizationPublic, RegistrationCreateInput } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import { INK, LINE, MUTED } from '../theme'

const fieldClass =
  'w-full rounded-md border bg-white px-3 py-2 text-[15px] outline-none transition-colors ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30'

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

function formatDateRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split('-')
    return `${d}.${m}.`
  }
  const endFmt = new Date(end).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `${fmt(start)}–${endFmt}`
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px]" style={{ color: MUTED }}>
        {label}
      </span>
      {children}
    </label>
  )
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
      setError('AGB und Datenschutz müssen bestätigt sein, bevor die Anmeldung gespeichert wird.')
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
      setError('Die Anmeldung konnte nicht gespeichert werden — Verbindung zum Server fehlgeschlagen. Versuch es gleich noch mal.')
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    const waitlisted = result.status === 'waitlist'
    return (
      <div className="border-l-2 pl-4" style={{ borderColor: 'var(--accent)' }}>
        <p className="text-lg font-semibold [font-family:var(--font-pilot-display)]" style={{ color: INK }}>
          {waitlisted ? 'Auf der Warteliste' : 'Angemeldet'}
        </p>
        <p className="mt-1 text-sm" style={{ color: MUTED }}>
          {waitlisted
            ? 'Der Camp war zum Zeitpunkt der Anmeldung voll. Wird ein Platz frei, meldet sich das Team.'
            : 'Der Platz ist reserviert. Es geht in diesem Pilotbetrieb noch keine Bestätigungsmail raus.'}
        </p>
        <p className="mt-3 font-mono text-xs break-all" style={{ color: MUTED }}>
          {result.registration_token}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-3">
        <p className="text-sm font-medium" style={{ color: INK }}>
          Erziehungsberechtigte
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vorname">
            <input required className={fieldClass} style={{ borderColor: LINE }}
              value={form.parent_first_name} onChange={e => set('parent_first_name', e.target.value)} />
          </Field>
          <Field label="Nachname">
            <input required className={fieldClass} style={{ borderColor: LINE }}
              value={form.parent_last_name} onChange={e => set('parent_last_name', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="E-Mail">
            <input required type="email" className={fieldClass} style={{ borderColor: LINE }}
              value={form.parent_email} onChange={e => set('parent_email', e.target.value)} />
          </Field>
          <Field label="Telefon">
            <input required className={fieldClass} style={{ borderColor: LINE }}
              value={form.parent_phone} onChange={e => set('parent_phone', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-3 border-t pt-5" style={{ borderColor: LINE }}>
        <p className="text-sm font-medium" style={{ color: INK }}>
          Kind
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vorname">
            <input required className={fieldClass} style={{ borderColor: LINE }}
              value={form.child_first_name} onChange={e => set('child_first_name', e.target.value)} />
          </Field>
          <Field label="Nachname">
            <input required className={fieldClass} style={{ borderColor: LINE }}
              value={form.child_last_name} onChange={e => set('child_last_name', e.target.value)} />
          </Field>
        </div>
        <Field label="Geburtsdatum">
          <input required type="date" className={fieldClass} style={{ borderColor: LINE }}
            value={form.child_birth_date} onChange={e => set('child_birth_date', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Notfallkontakt, Name">
            <input className={fieldClass} style={{ borderColor: LINE }}
              value={form.emergency_contact_name ?? ''} onChange={e => set('emergency_contact_name', e.target.value)} />
          </Field>
          <Field label="Notfallkontakt, Telefon">
            <input className={fieldClass} style={{ borderColor: LINE }}
              value={form.emergency_contact_phone ?? ''} onChange={e => set('emergency_contact_phone', e.target.value)} />
          </Field>
        </div>
        <Field label="Allergien">
          <textarea rows={2} className={fieldClass} style={{ borderColor: LINE }}
            value={form.allergies ?? ''} onChange={e => set('allergies', e.target.value)} />
        </Field>
        <Field label="Medizinische Hinweise">
          <textarea rows={2} className={fieldClass} style={{ borderColor: LINE }}
            value={form.medical_notes ?? ''} onChange={e => set('medical_notes', e.target.value)} />
        </Field>
      </fieldset>

      <fieldset className="space-y-2 border-t pt-5" style={{ borderColor: LINE }}>
        <label className="flex items-start gap-2 text-sm" style={{ color: INK }}>
          <input type="checkbox" className="mt-0.5" checked={form.photo_permission}
            onChange={e => set('photo_permission', e.target.checked)} />
          Foto- und Videoaufnahmen sind erlaubt
        </label>
        <label className="flex items-start gap-2 text-sm" style={{ color: INK }}>
          <input required type="checkbox" className="mt-0.5" checked={form.terms_accepted}
            onChange={e => set('terms_accepted', e.target.checked)} />
          AGB akzeptiert
        </label>
        <label className="flex items-start gap-2 text-sm" style={{ color: INK }}>
          <input required type="checkbox" className="mt-0.5" checked={form.privacy_accepted}
            onChange={e => set('privacy_accepted', e.target.checked)} />
          Datenschutzerklärung akzeptiert
        </label>
      </fieldset>

      {error && (
        <p className="text-sm" style={{ color: '#B3261E' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md py-2.5 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {submitting ? 'Wird gesendet …' : `Anmelden — ${formatPrice(camp.price_cents, camp.currency)}`}
      </button>
    </form>
  )
}

function CampRow({ orgSlug, camp, open, onToggle }: { orgSlug: string; camp: CampPublic; open: boolean; onToggle: () => void }) {
  return (
    <li className="border-b py-5" style={{ borderColor: LINE }}>
      <button
        type="button"
        onClick={onToggle}
        disabled={!camp.registration_open}
        className="flex w-full items-start justify-between gap-4 text-left disabled:cursor-not-allowed"
      >
        <div>
          <p className="text-lg font-semibold [font-family:var(--font-pilot-display)]" style={{ color: INK }}>
            {camp.title}
          </p>
          <p className="mt-1 flex gap-3 text-sm" style={{ color: MUTED }}>
            <span>Alter {camp.age_min}–{camp.age_max}</span>
            <span>{formatPrice(camp.price_cents, camp.currency)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium [font-family:var(--font-pilot-display)]" style={{ color: INK }}>
            {formatDateRange(camp.start_date, camp.end_date)}
          </p>
          <span
            className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
            style={
              camp.registration_open
                ? { backgroundColor: 'var(--accent)', color: 'var(--on-accent)' }
                : { color: MUTED, border: `1px solid ${LINE}` }
            }
          >
            {camp.registration_open ? 'Offen' : 'Geschlossen'}
          </span>
        </div>
      </button>

      {open && camp.registration_open && (
        <div className="mt-6">
          <CampForm orgSlug={orgSlug} camp={camp} />
        </div>
      )}
    </li>
  )
}

export default function PilotFlow({
  org,
  camps,
  accent,
  onAccent,
}: {
  org: OrganizationPublic
  camps: CampPublic[]
  accent: string
  onAccent: string
}) {
  const [openSlug, setOpenSlug] = useState<string | null>(camps.length === 1 ? camps[0].slug : null)

  return (
    <div style={{ '--accent': accent, '--on-accent': onAccent } as React.CSSProperties}>
      {camps.length === 0 ? (
        <p className="text-sm" style={{ color: MUTED }}>
          {org.name} hat aktuell keine veröffentlichten Camps.
        </p>
      ) : (
        <ul>
          {camps.map(camp => (
            <CampRow
              key={camp.slug}
              orgSlug={org.slug}
              camp={camp}
              open={openSlug === camp.slug}
              onToggle={() => setOpenSlug(prev => (prev === camp.slug ? null : camp.slug))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
