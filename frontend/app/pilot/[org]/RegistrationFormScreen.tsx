'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CampPublic, RegistrationCreated, RegistrationQuestion } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import { formatCampDateRange, formatPrice, parseGermanDate } from '../../lib/parentFlowFormat'
import ExtraQuestions from './ExtraQuestions'
import { getClubAssets } from './clubAssets'
import { submitErrorMessage } from './submitError'
import { parentDetailsOnly, type ParentDetails } from './siblingRegistration'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[\d ]*\d[\d ]*$/

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
  healthDataConsent: boolean
  pickupAuthorized: string
  termsAccepted: boolean
  privacyAccepted: boolean
  photoPermission: boolean
  extraAnswers: Record<string, string>
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
  healthDataConsent: false,
  pickupAuthorized: '',
  termsAccepted: false,
  privacyAccepted: false,
  photoPermission: false,
  extraAnswers: {},
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
  | 'privacy'
  | 'healthDataConsent'

// One source for blur feedback, progress and submit validation.
function validateForm(form: FormState): Partial<Record<FieldKey, string>> {
  const bad: Partial<Record<FieldKey, string>> = {}
  if (!form.childFirstName.trim()) bad.childFirstName = 'Bitte tragen Sie den Vornamen ein.'
  if (!form.childLastName.trim()) bad.childLastName = 'Bitte tragen Sie den Nachnamen ein.'
  if (parseGermanDate(form.childBirthDate) === null) bad.childBirthDate = 'Bitte im Format TT.MM.JJJJ.'
  if (!form.parentName.trim().includes(' ')) bad.parentName = 'Bitte Vor- und Nachnamen angeben.'
  if (!EMAIL_RE.test(form.parentEmail.trim())) bad.parentEmail = 'Diese Adresse ist unvollständig. Beispiel: name@beispiel.de'
  if (!form.parentPhone.trim()) bad.parentPhone = 'Bitte tragen Sie eine Telefonnummer ein.'
  else if (!PHONE_RE.test(form.parentPhone.trim())) bad.parentPhone = 'Bitte verwenden Sie nur Ziffern, Leerzeichen und ein + am Anfang.'
  if (!form.emergencyPhone.trim()) bad.emergencyPhone = 'Ohne Notfallnummer dürfen wir Ihr Kind am ersten Tag nicht übernehmen.'
  else if (!PHONE_RE.test(form.emergencyPhone.trim())) bad.emergencyPhone = 'Bitte verwenden Sie nur Ziffern, Leerzeichen und ein + am Anfang.'
  if (!form.termsAccepted) bad.agb = 'Bitte akzeptieren Sie die Teilnahmebedingungen.'
  if (!form.privacyAccepted) bad.privacy = 'Bitte stimmen Sie der Datenschutzerklärung zu.'
  if (form.allergies.trim() && !form.healthDataConsent) bad.healthDataConsent = 'Bitte stimmen Sie der Verarbeitung der Gesundheitsangaben ausdrücklich zu oder entfernen Sie diese Angaben.'
  return bad
}

function formatBirthDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.slice(0, 2) + (digits.length >= 2 ? '.' : '')
    + digits.slice(2, 4) + (digits.length >= 4 ? '.' : '') + digits.slice(4)
}

function ageHintForCamp(value: string, camp: CampPublic): string | null {
  const birth = parseGermanDate(value)
  if (!birth) return null
  const age = Number(camp.start_date.slice(0, 4)) - Number(birth.slice(0, 4))
    - (camp.start_date.slice(5, 10) < birth.slice(5, 10) ? 1 : 0)
  return age < camp.age_min || age > camp.age_max
    ? `Dieses Camp ist für Kinder von ${camp.age_min} bis ${camp.age_max} Jahren vorgesehen. Bitte prüfen Sie das Geburtsdatum oder sprechen Sie mit dem Verein. Sie können die Anmeldung trotzdem absenden.`
    : null
}

export default function RegistrationFormScreen({
  orgSlug,
  orgName,
  orgLogoUrl,
  contactEmail,
  hasBankDetails,
  camp,
  questions = [],
  onBack,
  onSubmitted,
  parentPrefill,
  onPrefillConsumed,
  siblingCamps = [],
  onCampChange,
}: {
  orgSlug: string
  orgName: string
  orgLogoUrl?: string | null
  contactEmail?: string | null
  /** Only promise bank details when the organization has supplied an IBAN. */
  hasBankDetails: boolean
  camp: CampPublic
  questions?: RegistrationQuestion[]
  onBack: () => void
  onSubmitted: (result: RegistrationCreated, childFirstName: string, parentEmail: string, parentDetails: ParentDetails) => void
  parentPrefill?: ParentDetails | null
  onPrefillConsumed?: () => void
  siblingCamps?: CampPublic[]
  onCampChange?: (slug: string) => void
}) {
  // Hook order (slots 0–8): do not reorder — RegistrationFormScreen.test.tsx
  // mocks React hooks by a shared counter. New hooks go to the end only.
  const [form, setForm] = useState<FormState>({ ...EMPTY, ...(parentPrefill ? parentDetailsOnly(parentPrefill) : {}) })
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverFields, setServerFields] = useState<Partial<Record<FieldKey, string>>>({})
  const inFlight = useRef(false)
  const serverErrorRef = useRef<HTMLDivElement>(null)
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { headingRef.current?.focus() }, [])
  // slot 9: D3c mobile bar toggle
  const [asideOpen, setAsideOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [focusRequest, setFocusRequest] = useState(0)
  useEffect(() => {
    if (focusRequest === 0) return
    // React has attached error descriptions before this post-render effect runs.
    const invalid = formRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], [role="radiogroup"][aria-invalid="true"]')
    const target = invalid?.matches('[role="radiogroup"]')
      ? invalid.querySelector<HTMLInputElement>('input[type="radio"]:checked') ?? invalid.querySelector<HTMLInputElement>('input[type="radio"]')
      : invalid
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [focusRequest])
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  useEffect(() => {
    if (serverError && Object.keys(serverFields).length === 0) serverErrorRef.current?.focus()
  }, [serverError, serverFields])
  const [wasPrefilled] = useState(Boolean(parentPrefill))
  useEffect(() => {
    if (parentPrefill) onPrefillConsumed?.()
  }, [parentPrefill, onPrefillConsumed])
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({})
  const [submitted, setSubmitted] = useState(false)
  const birthSelection = useRef<{ input: HTMLInputElement; start: number; end: number } | null>(null)
  useEffect(() => {
    const selection = birthSelection.current
    if (selection) {
      selection.input.setSelectionRange(selection.start, selection.end)
      birthSelection.current = null
    }
  })
  const dirty = !submitted && Object.values(form).some(value =>
    typeof value === 'string' ? value.trim() !== ''
      : typeof value === 'boolean' ? value : Object.values(value).some(answer => typeof answer === 'string' && answer.trim() !== ''),
  )
  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  const assets = getClubAssets(orgSlug)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    const field = key === 'termsAccepted' ? 'agb' : key === 'privacyAccepted' ? 'privacy' : key
    setServerFields((prev) => ({ ...prev, [field]: undefined }))
  }

  function touch(field: FieldKey) {
    setTouched(previous => ({ ...previous, [field]: true }))
  }

  function updateBirthDate(input: HTMLInputElement, raw: string, start: number, end = start, inputType?: string) {
    // Deleting a separator should delete a digit, not trap the cursor at the dot.
    if (inputType?.startsWith('delete') && raw.length < form.childBirthDate.length
      && raw.replace(/\D/g, '') === form.childBirthDate.replace(/\D/g, '')) {
      const index = inputType === 'deleteContentBackward' ? start - 1 : start
      raw = raw.slice(0, index) + raw.slice(index + 1)
      start = Math.max(0, index)
      end = start
    }
    const formatted = formatBirthDate(raw)
    const position = (offset: number) => {
      if (offset === raw.length) return formatted.length
      const digits = raw.slice(0, offset).replace(/\D/g, '').length
      return Math.min(formatted.length, digits + (digits >= 2 ? 1 : 0) + (digits >= 4 ? 1 : 0))
    }
    birthSelection.current = { input, start: position(start), end: position(end) }
    set('childBirthDate', formatted)
  }

  function focusFirstInvalid() {
    setFocusRequest((request) => request + 1)
  }

  const validation = useMemo(() => validateForm(form), [form])
  const ageHint = (submitAttempted || touched.childBirthDate) ? ageHintForCamp(form.childBirthDate, camp) : null

  const extraDone = useMemo(
    () => questions.every((q) => !q.required || (form.extraAnswers[q.key] ?? '').trim() !== ''),
    [questions, form.extraAnswers],
  )

  const sectionDone = useMemo(
    () => ({
      1: !validation.childFirstName && !validation.childLastName && !validation.childBirthDate,
      2: !validation.parentName && !validation.parentEmail && !validation.parentPhone,
      3: !validation.emergencyPhone,
      4: form.termsAccepted && form.privacyAccepted && !validation.healthDataConsent && extraDone,
    }),
    [form, validation, extraDone],
  )
  const doneCount = Object.values(sectionDone).filter(Boolean).length

  const badFields = useMemo<Partial<Record<FieldKey, string>>>(() => {
    const bad: Partial<Record<FieldKey, string>> = Object.fromEntries(Object.entries(serverFields).filter(([, value]) => value))
    for (const field of Object.keys(validation) as FieldKey[]) {
      if (submitAttempted || touched[field]) bad[field] = validation[field]
    }
    return bad
  }, [submitAttempted, touched, validation, serverFields])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onPrefillConsumed?.()
    if (inFlight.current) return
    if (camp.registration_open === false) return
    setSubmitAttempted(true)
    setServerError(null)
    setErrorStatus(null)
    setServerFields({})

    if (Object.keys(validation).length > 0 || !extraDone) {
      focusFirstInvalid()
      return
    }

    const birthISO = parseGermanDate(form.childBirthDate)
    if (!birthISO) return // unreachable — already validated above

    const spaceIdx = form.parentName.trim().indexOf(' ')
    const parentFirstName = spaceIdx === -1 ? form.parentName.trim() : form.parentName.trim().slice(0, spaceIdx)
    const parentLastName = spaceIdx === -1 ? '' : form.parentName.trim().slice(spaceIdx + 1)

    inFlight.current = true
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
        health_data_consent: form.allergies.trim() ? form.healthDataConsent : false,
        pickup_authorized: form.pickupAuthorized.trim() || null,
        terms_accepted: form.termsAccepted,
        privacy_accepted: form.privacyAccepted,
        photo_permission: form.photoPermission,
        extra_answers: Object.keys(form.extraAnswers).length > 0 ? form.extraAnswers : undefined,
      })
      if (!outcome.ok) {
        setErrorStatus(outcome.status)
        setServerError(submitErrorMessage(outcome.status))
        const mapping = {
          child_first_name: 'childFirstName', child_last_name: 'childLastName', child_birth_date: 'childBirthDate',
          parent_first_name: 'parentName', parent_last_name: 'parentName', parent_email: 'parentEmail',
          parent_phone: 'parentPhone', emergency_contact_phone: 'emergencyPhone', terms_accepted: 'agb', privacy_accepted: 'privacy',
          health_data_consent: 'healthDataConsent',
        } as const
        const fields: Partial<Record<FieldKey, string>> = {}
        for (const [apiField, field] of Object.entries(mapping)) {
          const message = outcome.fieldErrors?.[apiField as keyof typeof mapping]
          if (message) fields[field] = message
        }
        setServerFields(fields)
        const first = Object.keys(fields)[0] as FieldKey | undefined
        if (first) focusFirstInvalid()
        else requestAnimationFrame(() => serverErrorRef.current?.focus())
        return
      }
      setSubmitted(true)
      onSubmitted(outcome.data, form.childFirstName.trim() || 'Ihr Kind', form.parentEmail.trim(), parentDetailsOnly(form))
    } catch {
      setErrorStatus(0)
      setServerError(submitErrorMessage(0))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const einwilligungenStep = questions.length > 0 ? '4' : '3'
  const totalSteps = questions.length > 0 ? 4 : 3
  const errorCount = Object.keys(badFields).length + (submitAttempted
    ? questions.filter((q) => q.required && !(form.extraAnswers[q.key] ?? '').trim()).length
    : 0)

  return (
    <section className="screen" id="s-form">
      <h1 ref={headingRef} tabIndex={-1} className="sr">Anmeldung: {camp.title}</h1>
      <div className="top">
        <button className="back" type="button" onClick={onBack} disabled={submitting} aria-label="Zurück zum Camp">
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

      <div className="d3c-prog" aria-hidden="true">
        <div className="d3c-prog-fill" style={{ width: `${Math.round((doneCount / 4) * 100)}%` }} />
      </div>

      <div className="form-layout d3c-layout">
        {/* Left aside — sticky on desktop, hidden on mobile */}
        <aside className="form-aside d3c-aside" aria-label="Camp-Zusammenfassung">
          {assets?.heroImage && (
            <Image
              src={assets.heroImage}
              alt=""
              width={400}
              height={240}
              className="d3c-aside-photo"
              aria-hidden={true}
              unoptimized
              style={{ objectPosition: assets.heroPosition ?? 'center 20%' }}
            />
          )}
          <div className="d3c-aside-info">
            <p className="d3c-aside-label">{orgName}</p>
            <h2 className="d3 d3c-aside-title">{camp.title}</h2>
            <dl className="d3c-aside-facts">
              <div className="d3c-aside-row">
                <dt>Zeitraum</dt>
                <dd>{formatCampDateRange(camp.start_date, camp.end_date)}</dd>
              </div>
              {camp.location && (
                <div className="d3c-aside-row">
                  <dt>Ort</dt>
                  <dd>{camp.location}</dd>
                </div>
              )}
              <div className="d3c-aside-price num">{formatPrice(camp.price_cents, camp.currency)}</div>
              {camp.spots_remaining != null && !camp.is_full && (
                <span className={`d3c-aside-spots${camp.spots_remaining <= 10 ? ' accent' : ''}`}>
                  {camp.spots_remaining} Plätze frei
                </span>
              )}
              {camp.is_full && (
                <span className="d3c-aside-spots">Warteliste</span>
              )}
            </dl>
          </div>
        </aside>

        {/* Mobile bar — compact collapsible header, hidden on desktop */}
        <div className="d3c-mob-bar-wrap">
          <button
            type="button"
            className="d3c-mob-bar"
            onClick={() => setAsideOpen((o) => !o)}
            aria-expanded={asideOpen}
          >
            <span className="d3c-mob-bar-left">
              <b>{camp.title}</b>
              <span>{formatCampDateRange(camp.start_date, camp.end_date)}</span>
            </span>
            <span className="d3c-mob-bar-price num">{formatPrice(camp.price_cents, camp.currency)}</span>
          </button>
          {asideOpen && (
            <div className="d3c-mob-bar-body pad">
              <dl className="d3c-aside-facts">
                <div className="d3c-aside-row">
                  <dt>Zeitraum</dt>
                  <dd>{formatCampDateRange(camp.start_date, camp.end_date)}</dd>
                </div>
                {camp.location && (
                  <div className="d3c-aside-row">
                    <dt>Ort</dt>
                    <dd>{camp.location}</dd>
                  </div>
                )}
                <div className="d3c-aside-row">
                  <dt>Preis</dt>
                  <dd className="num">{formatPrice(camp.price_cents, camp.currency)}</dd>
                </div>
                {camp.spots_remaining != null && !camp.is_full && camp.spots_remaining <= 10 && (
                  <div className="d3c-aside-row">
                    <dt>Plätze</dt>
                    <dd className="d3c-mob-spots-accent">{camp.spots_remaining} Plätze frei</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        {/* Right: form */}
        <div className="form-main d3c-main">
          <form ref={formRef} onSubmit={handleSubmit} noValidate aria-busy={submitting}>
            <div className="pad form-body">
              <p className="required-hint">Alle mit * markierten Felder sind Pflichtfelder.</p>

              {siblingCamps.length > 1 && onCampChange && (
                <section className="fsec">
                  <label htmlFor="sibling_camp" className="field s">
                    <span className="t-lab">Camp für das weitere Kind</span>
                    <select id="sibling_camp" name="sibling_camp" value={camp.slug} disabled={submitting} onChange={(event) => {
                      setForm({ ...EMPTY, ...parentDetailsOnly(form) })
                      setSubmitAttempted(false)
                      setTouched({})
                      setSubmitted(false)
                      setServerError(null)
                      setErrorStatus(null)
                      setServerFields({})
                      onCampChange(event.target.value)
                    }}>
                      {siblingCamps.map((option) => (
                        <option key={option.slug} value={option.slug} disabled={!option.registration_open}>
                          {option.title} · {formatCampDateRange(option.start_date, option.end_date)}
                          {!option.registration_open ? ' · Anmeldung geschlossen' : option.is_full ? ' · Warteliste' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
              )}

              {/* Section 1: Kind */}
              <section className="fsec sec-rise" data-section="">

                <div className="fsec-head">
                  <span className="fsec-step-lbl">{`SCHRITT 1 VON ${totalSteps}`}</span>
                  <h2 className="d3">Angaben zum Kind</h2>
                </div>
                <div className="f">
                  <label htmlFor="child_first_name" className={`field${badFields.childFirstName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childFirstName = el }}>
                    <span className="t-lab">Vorname *</span>
                    <input
                      type="text"
                      id="child_first_name"
                      name="child_first_name"
                      required
                      aria-required="true"
                      autoComplete="section-child given-name"
                      value={form.childFirstName}
                      onChange={(e) => set('childFirstName', e.target.value)}
                      onBlur={() => touch('childFirstName')}
                      aria-invalid={!!badFields.childFirstName}
                      aria-describedby={badFields.childFirstName ? 'err-child-first-name' : undefined}
                    />
                    <span className="err">{badFields.childFirstName && <span id="err-child-first-name">{badFields.childFirstName}</span>}</span>
                  </label>
                  <label htmlFor="child_last_name" className={`field${badFields.childLastName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childLastName = el }}>
                    <span className="t-lab">Nachname *</span>
                    <input
                      type="text"
                      id="child_last_name"
                      name="child_last_name"
                      required
                      aria-required="true"
                      autoComplete="section-child family-name"
                      value={form.childLastName}
                      onChange={(e) => set('childLastName', e.target.value)}
                      onBlur={() => touch('childLastName')}
                      aria-invalid={!!badFields.childLastName}
                      aria-describedby={badFields.childLastName ? 'err-child-last-name' : undefined}
                    />
                    <span className="err">{badFields.childLastName && <span id="err-child-last-name">{badFields.childLastName}</span>}</span>
                  </label>
                  <div className="row2">
                    <label htmlFor="child_birth_date" className={`field${badFields.childBirthDate ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.childBirthDate = el }}>
                      <span className="t-lab">Geburtsdatum *</span>
                      <input
                        type="text"
                        id="child_birth_date"
                        name="child_birth_date"
                        required
                        aria-required="true"
                        autoComplete="section-child bday"
                        placeholder="TT.MM.JJJJ"
                        inputMode="numeric"
                        pattern="[0-9.]*"
                        className="num"
                        value={form.childBirthDate}
                        onChange={(e) => {
                          const input = e.target
                          updateBirthDate(input, input.value, input.selectionStart ?? input.value.length,
                            input.selectionEnd ?? input.value.length, (e.nativeEvent as InputEvent | undefined)?.inputType)
                        }}
                        onPaste={(e) => {
                          e.preventDefault()
                          const input = e.currentTarget
                          const start = input.selectionStart ?? 0
                          const end = input.selectionEnd ?? input.value.length
                          const pasted = e.clipboardData.getData('text').trim().replace(
                            /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
                            (_, day: string, month: string, year: string) => `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`,
                          )
                          updateBirthDate(input, input.value.slice(0, start) + pasted + input.value.slice(end), start + pasted.length)
                        }}
                        onBlur={() => touch('childBirthDate')}
                        aria-invalid={!!badFields.childBirthDate}
                        aria-describedby={badFields.childBirthDate ? 'err-child-birth-date' : ageHint ? 'hint-child-age' : undefined}
                      />
                      <span className="err">{badFields.childBirthDate && <span id="err-child-birth-date">{badFields.childBirthDate}</span>}</span>
                      {ageHint && <span className="hint" id="hint-child-age" role="status">{ageHint}</span>}
                    </label>
                    <label htmlFor="jersey_size" className="field s">
                      <span className="t-lab">Trikotgröße</span>
                      <select
                        id="jersey_size"
                        name="jersey_size"
                        value={form.jerseySize}
                        onChange={(e) => set('jerseySize', e.target.value)}
                      >
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

              {/* Section 2: Eltern & Notfall (merged) */}
              <section className="fsec sec-rise" data-section="">

                <div className="fsec-head">
                  <span className="fsec-step-lbl">{`SCHRITT 2 VON ${totalSteps}`}</span>
                  <h2 className="d3">Eltern &amp; Notfall</h2>
                </div>
                {wasPrefilled && <p className="note quiet">Ihre Angaben aus der letzten Anmeldung – bitte prüfen.</p>}
                <div className="f">
                  <label htmlFor="parent_name" className={`field${badFields.parentName ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentName = el }}>
                    <span className="t-lab">Vor- und Nachname *</span>
                    <input
                      type="text"
                      id="parent_name"
                      name="parent_name"
                      autoComplete="name"
                      required
                      aria-required="true"
                      value={form.parentName}
                      onChange={(e) => set('parentName', e.target.value)}
                      onBlur={() => touch('parentName')}
                      aria-invalid={!!badFields.parentName}
                      aria-describedby={badFields.parentName ? 'err-parent-name' : undefined}
                    />
                    <span className="err">{badFields.parentName && <span id="err-parent-name">{badFields.parentName}</span>}</span>
                  </label>
                  <label htmlFor="parent_email" className={`field${badFields.parentEmail ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentEmail = el }}>
                    <span className="t-lab">E-Mail *</span>
                    <input
                      type="email"
                      id="parent_email"
                      name="parent_email"
                      required
                      aria-required="true"
                      autoComplete="email"
                      inputMode="email"
                      value={form.parentEmail}
                      onChange={(e) => set('parentEmail', e.target.value)}
                      onBlur={() => touch('parentEmail')}
                      aria-invalid={!!badFields.parentEmail}
                      aria-describedby={badFields.parentEmail ? 'err-parent-email hint-parent-email' : 'hint-parent-email'}
                    />
                    <span className="err">{badFields.parentEmail && <span id="err-parent-email">{badFields.parentEmail}</span>}</span>
                    <span className="hint" id="hint-parent-email">Über diese Adresse erreicht Sie {orgName} bei Rückfragen.</span>
                  </label>
                  <label htmlFor="parent_phone" className={`field${badFields.parentPhone ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.parentPhone = el }}>
                    <span className="t-lab">Telefon *</span>
                    <input
                      type="tel"
                      id="parent_phone"
                      name="parent_phone"
                      autoComplete="tel"
                      required
                      aria-required="true"
                      inputMode="tel"
                      className="num"
                      value={form.parentPhone}
                      onChange={(e) => set('parentPhone', e.target.value)}
                      onBlur={() => touch('parentPhone')}
                      aria-invalid={!!badFields.parentPhone}
                      aria-describedby={badFields.parentPhone ? 'err-parent-phone' : undefined}
                    />
                    <span className="err">{badFields.parentPhone && <span id="err-parent-phone">{badFields.parentPhone}</span>}</span>
                  </label>
                  <label htmlFor="emergency_phone" className={`field${badFields.emergencyPhone ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.emergencyPhone = el }}>
                    <span className="t-lab">Notfallnummer während des Camps *</span>
                    <input
                      type="tel"
                      id="emergency_phone"
                      name="emergency_phone"
                      inputMode="tel"
                      placeholder="Nummer, die wir tagsüber erreichen"
                      autoComplete="section-emergency tel"
                      required
                      aria-required="true"
                      className="num"
                      value={form.emergencyPhone}
                      onChange={(e) => set('emergencyPhone', e.target.value)}
                      onBlur={() => touch('emergencyPhone')}
                      aria-invalid={!!badFields.emergencyPhone}
                      aria-describedby={badFields.emergencyPhone ? 'err-emergency-phone' : undefined}
                    />
                    <span className="err">{badFields.emergencyPhone && <span id="err-emergency-phone">{badFields.emergencyPhone}</span>}</span>
                  </label>
                  <label htmlFor="allergies" className="field">
                    <span className="t-lab">Allergien, Medikamente, Unverträglichkeiten</span>
                    <textarea
                      id="allergies"
                      name="allergies"
                      rows={3}
                      placeholder="Nur was die Betreuer wissen müssen. Leer lassen, wenn nichts vorliegt."
                      value={form.allergies}
                      onChange={(e) => set('allergies', e.target.value)}
                      aria-describedby="hint-allergies"
                    />
                    <span className="hint" id="hint-allergies">Freiwillig. Diese Angaben sehen nur die Betreuerinnen und Betreuer Ihres Kindes.</span>
                  </label>
                  {form.allergies.trim() && (
                    <label htmlFor="health_data_consent" className={`consent${badFields.healthDataConsent ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.healthDataConsent = el }}>
                      <input
                        type="checkbox"
                        id="health_data_consent"
                        checked={form.healthDataConsent}
                        onChange={(e) => set('healthDataConsent', e.target.checked)}
                        onBlur={() => touch('healthDataConsent')}
                        aria-invalid={!!badFields.healthDataConsent}
                        aria-describedby={badFields.healthDataConsent ? 'err-health-consent' : undefined}
                      />
                      <span className="txt">
                        <b>Gesundheitsangaben – ausdrückliche Einwilligung *</b>
                        <span>Ich willige ausdrücklich ein, dass {orgName} die von mir freiwillig angegebenen Allergien, Medikamente und medizinischen Hinweise meines Kindes zur sicheren Vorbereitung und Durchführung des Camps verarbeitet. {orgSlug === 'ksv-baunatal' && 'Beim KSV werden diese Angaben 30 Tage nach Campende zur manuellen Löschung geprüft. '}Ich kann die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen; ohne diese Angaben ist die Anmeldung weiterhin möglich.</span>
                        {badFields.healthDataConsent && <span id="err-health-consent" role="alert" style={{ color: 'var(--error)' }}>{badFields.healthDataConsent}</span>}
                      </span>
                    </label>
                  )}
                  <label htmlFor="pickup_authorized" className="field">
                    <span className="t-lab">Wer darf Ihr Kind abholen?</span>
                    <input
                      type="text"
                      id="pickup_authorized"
                      name="pickup_authorized"
                      placeholder="Namen, getrennt durch Komma"
                      value={form.pickupAuthorized}
                      onChange={(e) => set('pickupAuthorized', e.target.value)}
                    />
                  </label>
                </div>
              </section>

              {/* Section 3: Zusatzfragen — only rendered when questions exist */}
              <ExtraQuestions
                key={camp.slug}
                questions={questions}
                stepLabel={orgSlug === 'ksv-baunatal' ? 'SCHRITT 3 VON 4' : undefined}
                answers={form.extraAnswers}
                submitAttempted={submitAttempted}
                onChange={(key, value) => setForm((prev) => ({ ...prev, extraAnswers: { ...prev.extraAnswers, [key]: value } }))}
              />

              {/* Section 4 (or 3 if no extra questions): Einwilligungen */}
              <section className="fsec sec-rise" data-section="">

                <div className="fsec-head">
                  <span className="fsec-step-lbl">{`SCHRITT ${einwilligungenStep} VON ${totalSteps}`}</span>
                  <h2 className="d3">Einwilligungen</h2>
                </div>
                <div className="f">
                  <label htmlFor="terms_accepted" className={`consent${badFields.agb ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.agb = el }}>
                    <input
                      type="checkbox"
                      id="terms_accepted"
                      checked={form.termsAccepted}
                      required
                      aria-required="true"
                      onChange={(e) => set('termsAccepted', e.target.checked)}
                      onBlur={() => touch('agb')}
                      aria-invalid={!!badFields.agb}
                      aria-describedby={badFields.agb ? 'err-agb' : undefined}
                    />
                    <span className="txt">
                      <b>Teilnahmebedingungen<span className="consent-req"> Pflichtfeld *</span></b>
                      <span>Ich habe die <a href={`/pilot/${orgSlug}/teilnahmebedingungen`} target="_blank" rel="noopener noreferrer">Teilnahmebedingungen</a> gelesen und melde mein Kind verbindlich an.</span>
                      {badFields.agb && <span id="err-agb" role="alert" style={{ color: 'var(--error)' }}>{badFields.agb}</span>}
                    </span>
                  </label>
                  <label htmlFor="privacy_accepted" className={`consent${badFields.privacy ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.privacy = el }}>
                    <input
                      type="checkbox"
                      id="privacy_accepted"
                      checked={form.privacyAccepted}
                      required
                      aria-required="true"
                      onChange={(e) => set('privacyAccepted', e.target.checked)}
                      onBlur={() => touch('privacy')}
                      aria-invalid={!!badFields.privacy}
                      aria-describedby={badFields.privacy ? 'err-privacy' : undefined}
                    />
                    <span className="txt">
                      <b>Datenschutz<span className="consent-req"> Pflichtfeld *</span></b>
                      <span>
                        Ich habe die <a href={`/pilot/${orgSlug}/datenschutz`} target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a> gelesen und stimme der Verarbeitung der Daten für die Camp-Anmeldung zu.
                      </span>
                      {badFields.privacy && <span id="err-privacy" role="alert" style={{ color: 'var(--error)' }}>{badFields.privacy}</span>}
                    </span>
                  </label>
                  <label htmlFor="photo_permission" className="consent">
                    <input id="photo_permission" type="checkbox" checked={form.photoPermission} onChange={(e) => set('photoPermission', e.target.checked)} />
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
                      Informationen zur Verarbeitung und Speicherung der Daten Ihres Kindes finden Sie in der{' '}
                      <a href={`/pilot/${orgSlug}/datenschutz`} target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a>.
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <div className="dock">
              {(submitAttempted && errorCount > 0) && (
                <div className="note error" role="alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7.5v5.5" />
                    <path d="M12 16.5v.01" />
                  </svg>
                  <span>
                    {errorCount === 1
                      ? 'Eine Angabe fehlt noch. Sie ist oben markiert.'
                      : `${errorCount} Angaben fehlen noch. Sie sind oben markiert.`}
                  </span>
                </div>
              )}
              {serverError && (
                <div className="note public-submit-error" role="alert" tabIndex={-1} ref={serverErrorRef}>
                  {orgLogoUrl && <Image src={orgLogoUrl} alt={orgName} width={48} height={48} unoptimized />}
                  <span>{serverError}</span>
                </div>
              )}
              <div className="line">
                <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>{camp.title}, 1 Kind</span>
                <span className="sum num">{formatPrice(camp.price_cents, camp.currency)}</span>
              </div>
              {serverError && (errorStatus === 409 || errorStatus === 404) ? (
                <a className="btn primary btn-pill" href={errorStatus === 409 && contactEmail ? `mailto:${contactEmail}` : `/pilot/${orgSlug}`}>
                  {errorStatus === 409 && contactEmail ? 'Kontakt aufnehmen' : 'Alle Camps ansehen'}
                </a>
              ) : <button className={`btn primary btn-pill${submitting ? ' done' : ''}`} type="submit" disabled={submitting || camp.registration_open === false}>
                {submitting
                  ? camp.is_full
                    ? 'Wird eingetragen …'
                    : 'Wird gespeichert …'
                  : serverError
                    ? 'Erneut versuchen'
                  : camp.is_full
                    ? 'Auf die Warteliste setzen'
                    : `Verbindlich anmelden · ${formatPrice(camp.price_cents, camp.currency)}`}
              </button>}
              <span className="fine">
                {camp.is_full
                  ? 'Auf der Warteliste entstehen noch keine Kosten.'
                  : hasBankDetails
                    ? `Den Betrag überweisen Sie anschließend selbst an ${orgName}. Die Bankdaten stehen auf der nächsten Seite.`
                    : 'Der Verein meldet sich zur Zahlung.'}
              </span>
            </div>
          </form>
        </div>
      </div>
    </section>
  )
}
