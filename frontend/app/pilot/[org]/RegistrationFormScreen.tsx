'use client'

import { useMemo, useRef, useState } from 'react'
import type { CampPublic, RegistrationCreated } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice, parseGermanDate } from '../../lib/parentFlowFormat'

const EMAIL_RE = /\S+@\S+\.\S{2,}/

interface FormState {
  childFirstName: string
  childLastName: string
  childBirthDate: string // TT.MM.JJJJ
  jerseySize: string
  parentName: string
  parentEmail: string
  parentPhone: string
  emergencyPhone: string
  allergies: string
  pickupAuthorized: string
  termsAccepted: boolean
  photoPermission: boolean
}

const EMPTY: FormState = {
  childFirstName: '',
  childLastName: '',
  childBirthDate: '',
  jerseySize: '',
  parentName: '',
  parentEmail: '',
  parentPhone: '',
  emergencyPhone: '',
  allergies: '',
  pickupAuthorized: '',
  termsAccepted: false,
  photoPermission: false,
}

type FieldKey =
  | 'childFirstName'
  | 'childLastName'
  | 'childBirthDate'
  | 'parentName'
  | 'parentEmail'
  | 'parentPhone'
  | 'emergencyPhone'
  | 'agb'

export default function RegistrationFormScreen({
  orgSlug,
  orgName,
  camp,
  onBack,
  onSubmitted,
}: {
  orgSlug: string
  orgName: string
  camp: CampPublic
  onBack: () => void
  onSubmitted: (result: RegistrationCreated, childFirstName: string, parentEmail: string) => void
}) {
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({})

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const emailValid = EMAIL_RE.test(form.parentEmail.trim())

  const sectionDone = useMemo(
    () => ({
      1: form.childFirstName.trim() !== '' && form.childLastName.trim() !== '' && parseGermanDate(form.childBirthDate) !== null,
      2: form.parentName.trim() !== '' && form.parentEmail.trim() !== '' && form.parentPhone.trim() !== '' && emailValid,
      3: form.emergencyPhone.trim() !== '',
      4: form.termsAccepted,
    }),
    [form, emailValid],
  )
  const doneCount = Object.values(sectionDone).filter(Boolean).length

  const badFields = useMemo<Partial<Record<FieldKey, string>>>(() => {
    if (!submitAttempted) return {}
    const bad: Partial<Record<FieldKey, string>> = {}
    if (form.childFirstName.trim() === '') bad.childFirstName = 'Bitte tragen Sie den Vornamen ein.'
    if (form.childLastName.trim() === '') bad.childLastName = 'Bitte tragen Sie den Nachnamen ein.'
    if (parseGermanDate(form.childBirthDate) === null) bad.childBirthDate = 'Bitte im Format TT.MM.JJJJ.'
    if (form.parentName.trim() === '') bad.parentName = 'Bitte tragen Sie Ihren Namen ein.'
    if (!emailValid) bad.parentEmail = 'Diese Adresse ist unvollständig. Beispiel: name@beispiel.de'
    if (form.parentPhone.trim() === '') bad.parentPhone = 'Bitte tragen Sie eine Telefonnummer ein.'
    if (form.emergencyPhone.trim() === '') {
      bad.emergencyPhone = 'Ohne Notfallnummer dürfen wir Ihr Kind am ersten Tag nicht übernehmen.'
    }
    if (!form.termsAccepted) bad.agb = 'Pflichtfeld'
    return bad
  }, [submitAttempted, form, emailValid])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    setServerError(null)

    const bad: FieldKey[] = []
    if (form.childFirstName.trim() === '') bad.push('childFirstName')
    if (form.childLastName.trim() === '') bad.push('childLastName')
    if (parseGermanDate(form.childBirthDate) === null) bad.push('childBirthDate')
    if (form.parentName.trim() === '') bad.push('parentName')
    if (!emailValid) bad.push('parentEmail')
    if (form.parentPhone.trim() === '') bad.push('parentPhone')
    if (form.emergencyPhone.trim() === '') bad.push('emergencyPhone')
    if (!form.termsAccepted) bad.push('agb')

    if (bad.length > 0) {
      const target = fieldRefs.current[bad[0]]
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      const input = target?.querySelector<HTMLElement>('input')
      setTimeout(() => input?.focus(), 300)
      return
    }

    const birthISO = parseGermanDate(form.childBirthDate)
    if (!birthISO) return // unreachable — already validated above

    const spaceIdx = form.parentName.trim().indexOf(' ')
    const parentFirstName = spaceIdx === -1 ? form.parentName.trim() : form.parentName.trim().slice(0, spaceIdx)
    const parentLastName = spaceIdx === -1 ? '' : form.parentName.trim().slice(spaceIdx + 1)

    setSubmitting(true)
    try {
      const outcome = await submitRegistration(orgSlug, camp.slug, {
        parent_first_name: parentFirstName,
        parent_last_name: parentLastName,
        parent_email: form.parentEmail.trim(),
        parent_phone: form.parentPhone.trim(),
        child_first_name: form.childFirstName.trim(),
        child_last_name: form.childLastName.trim(),
        child_birth_date: birthISO,
        jersey_size: form.jerseySize || null,
        emergency_contact_phone: form.emergencyPhone.trim(),
        allergies: form.allergies.trim() || null,
        pickup_authorized: form.pickupAuthorized.trim() || null,
        // Die Referenz kennt nur eine einzelne Pflicht-Einwilligung ("Teilnahmebedingungen");
        // sie deckt inhaltlich beide vom Backend verlangten Flags ab (§1: keine neuen Formularfelder).
        terms_accepted: form.termsAccepted,
        privacy_accepted: form.termsAccepted,
        photo_permission: form.photoPermission,
      })
      if (!outcome.ok) {
        setServerError(outcome.detail)
        return
      }
      onSubmitted(outcome.data, form.childFirstName.trim() || 'Ihr Kind', form.parentEmail.trim())
    } catch {
      setServerError('Die Anmeldung konnte nicht gespeichert werden — Verbindung zum Server fehlgeschlagen. Versuchen Sie es gleich noch mal.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="screen" id="s-form">
      <div className="top">
        <button className="back" type="button" onClick={onBack} aria-label="Zurück zum Camp">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="who">
          <b>{camp.title}</b>
          <span className="num">
            {orgName}, {formatCampDateRange(camp.start_date, camp.end_date)}
          </span>
        </div>
      </div>

      <div className="prog">
        <div className="bars">
          {[1, 2, 3, 4].map((n) => (
            <i key={n} className={n <= doneCount ? 'on' : ''} />
          ))}
        </div>
        <span className="t num">{doneCount} von 4 Abschnitten ausgefüllt</span>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="pad">
          <section className="fsec">
            <div className="fsec-head">
              <span className={`step${sectionDone[1] ? ' done' : ''}`}>1</span>
              <h2 className="d3">Angaben zum Kind</h2>
            </div>
            <div className="f">
              <label className={`field${badFields.childFirstName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childFirstName = el }}>
                <span className="t-lab">Vorname</span>
                <input
                  type="text"
                  value={form.childFirstName}
                  onChange={(e) => set('childFirstName', e.target.value)}
                  aria-invalid={!!badFields.childFirstName}
                  aria-describedby={badFields.childFirstName ? 'err-child-first-name' : undefined}
                />
                <span className="err">{badFields.childFirstName && <span id="err-child-first-name">{badFields.childFirstName}</span>}</span>
              </label>
              <label className={`field${badFields.childLastName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childLastName = el }}>
                <span className="t-lab">Nachname</span>
                <input
                  type="text"
                  value={form.childLastName}
                  onChange={(e) => set('childLastName', e.target.value)}
                  aria-invalid={!!badFields.childLastName}
                  aria-describedby={badFields.childLastName ? 'err-child-last-name' : undefined}
                />
                <span className="err">{badFields.childLastName && <span id="err-child-last-name">{badFields.childLastName}</span>}</span>
              </label>
              <div className="row2">
                <label className={`field${badFields.childBirthDate ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childBirthDate = el }}>
                  <span className="t-lab">Geburtsdatum</span>
                  <input
                    type="text"
                    placeholder="TT.MM.JJJJ"
                    inputMode="numeric"
                    className="num"
                    value={form.childBirthDate}
                    onChange={(e) => set('childBirthDate', e.target.value)}
                    aria-invalid={!!badFields.childBirthDate}
                    aria-describedby={badFields.childBirthDate ? 'err-child-birth-date' : undefined}
                  />
                  <span className="err">{badFields.childBirthDate && <span id="err-child-birth-date">{badFields.childBirthDate}</span>}</span>
                </label>
                <label className="field s">
                  <span className="t-lab">Trikotgröße</span>
                  <select value={form.jerseySize} onChange={(e) => set('jerseySize', e.target.value)}>
                    <option value="">–</option>
                    <option value="128">128</option>
                    <option value="140">140</option>
                    <option value="152">152</option>
                    <option value="164">164</option>
                  </select>
                </label>
              </div>
            </div>
          </section>

          <section className="fsec">
            <div className="fsec-head">
              <span className={`step${sectionDone[2] ? ' done' : ''}`}>2</span>
              <h2 className="d3">Kontakt der Eltern</h2>
            </div>
            <div className="f">
              <label className={`field${badFields.parentName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentName = el }}>
                <span className="t-lab">Vor- und Nachname</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={form.parentName}
                  onChange={(e) => set('parentName', e.target.value)}
                  aria-invalid={!!badFields.parentName}
                  aria-describedby={badFields.parentName ? 'err-parent-name' : undefined}
                />
                <span className="err">{badFields.parentName && <span id="err-parent-name">{badFields.parentName}</span>}</span>
              </label>
              <label className={`field${badFields.parentEmail ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentEmail = el }}>
                <span className="t-lab">E-Mail</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.parentEmail}
                  onChange={(e) => set('parentEmail', e.target.value)}
                  aria-invalid={!!badFields.parentEmail}
                  aria-describedby={badFields.parentEmail ? 'err-parent-email hint-parent-email' : 'hint-parent-email'}
                />
                <span className="err">{badFields.parentEmail && <span id="err-parent-email">{badFields.parentEmail}</span>}</span>
                <span className="hint" id="hint-parent-email">An diese Adresse geht die Bestätigung mit allen Angaben.</span>
              </label>
              <label className={`field${badFields.parentPhone ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentPhone = el }}>
                <span className="t-lab">Telefon</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  className="num"
                  value={form.parentPhone}
                  onChange={(e) => set('parentPhone', e.target.value)}
                  aria-invalid={!!badFields.parentPhone}
                  aria-describedby={badFields.parentPhone ? 'err-parent-phone' : undefined}
                />
                <span className="err">{badFields.parentPhone && <span id="err-parent-phone">{badFields.parentPhone}</span>}</span>
              </label>
            </div>
          </section>

          <section className="fsec">
            <div className="fsec-head">
              <span className={`step${sectionDone[3] ? ' done' : ''}`}>3</span>
              <h2 className="d3">Sicherheit im Camp</h2>
            </div>
            <div className="f">
              <label className={`field${badFields.emergencyPhone ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.emergencyPhone = el }}>
                <span className="t-lab">Notfallnummer während des Camps</span>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="Nummer, die wir tagsüber erreichen"
                  className="num"
                  value={form.emergencyPhone}
                  onChange={(e) => set('emergencyPhone', e.target.value)}
                  aria-invalid={!!badFields.emergencyPhone}
                  aria-describedby={badFields.emergencyPhone ? 'err-emergency-phone' : undefined}
                />
                <span className="err">{badFields.emergencyPhone && <span id="err-emergency-phone">{badFields.emergencyPhone}</span>}</span>
              </label>
              <label className="field">
                <span className="t-lab">Allergien, Medikamente, Unverträglichkeiten</span>
                <textarea
                  rows={3}
                  placeholder="Nur was die Betreuer wissen müssen. Leer lassen, wenn nichts vorliegt."
                  value={form.allergies}
                  onChange={(e) => set('allergies', e.target.value)}
                  aria-describedby="hint-allergies"
                />
                <span className="hint" id="hint-allergies">Freiwillig. Diese Angaben sehen nur die Betreuerinnen und Betreuer Ihres Kindes.</span>
              </label>
              <label className="field">
                <span className="t-lab">Wer darf Ihr Kind abholen?</span>
                <input
                  type="text"
                  placeholder="Namen, getrennt durch Komma"
                  value={form.pickupAuthorized}
                  onChange={(e) => set('pickupAuthorized', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="fsec">
            <div className="fsec-head">
              <span className={`step${sectionDone[4] ? ' done' : ''}`}>4</span>
              <h2 className="d3">Einwilligungen</h2>
            </div>
            <div className="f">
              <label className={`consent${badFields.agb ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.agb = el }}>
                <input
                  type="checkbox"
                  checked={form.termsAccepted}
                  onChange={(e) => set('termsAccepted', e.target.checked)}
                  aria-invalid={!!badFields.agb}
                />
                <span className="txt">
                  <b>Teilnahmebedingungen</b>
                  <span>Ich habe die Teilnahmebedingungen gelesen und melde mein Kind verbindlich an.</span>
                </span>
              </label>
              <label className="consent">
                <input type="checkbox" checked={form.photoPermission} onChange={(e) => set('photoPermission', e.target.checked)} />
                <span className="txt">
                  <b>Fotos, freiwillig</b>
                  <span>
                    Der Verein darf Fotos meines Kindes vom Camp auf seiner Website und in sozialen Netzwerken zeigen. Ohne diese Einwilligung nimmt Ihr Kind
                    ganz normal teil.
                  </span>
                </span>
              </label>
              <div className="note quiet">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.5 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>
                  Die Daten Ihres Kindes werden nur für dieses Camp verwendet und sechs Monate nach Camp-Ende gelöscht. Länger bleiben nur Zahlungsbelege, weil
                  das Steuerrecht es verlangt — ohne Gesundheitsangaben.
                </span>
              </div>
            </div>
          </section>
        </div>

        <div className="dock">
          {(submitAttempted && Object.keys(badFields).length > 0) && (
            <div className="note error" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5" />
                <path d="M12 16.5v.01" />
              </svg>
              <span>
                {Object.keys(badFields).length === 1
                  ? 'Eine Angabe fehlt noch. Sie ist oben markiert.'
                  : `${Object.keys(badFields).length} Angaben fehlen noch. Sie sind oben markiert.`}
              </span>
            </div>
          )}
          {serverError && (
            <div className="note error" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5" />
                <path d="M12 16.5v.01" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}
          <div className="line">
            <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{camp.title}, 1 Kind</span>
            <span className="sum num">{formatPrice(camp.price_cents, camp.currency)}</span>
          </div>
          <button className={`btn primary${submitting ? ' done' : ''}`} type="submit" disabled={submitting}>
            {submitting ? 'Wird gesendet …' : 'Anmeldung absenden'}
          </button>
          <span className="fine">Die Bezahlung erfolgt nach der Bestätigung per Überweisung.</span>
        </div>
      </form>
    </section>
  )
}
