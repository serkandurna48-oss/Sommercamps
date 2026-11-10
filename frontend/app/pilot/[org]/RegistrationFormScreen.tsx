'use client'

import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CampPublic, RegistrationCreated, RegistrationQuestion, TrainingPaymentMethod } from '../../lib/saasApi'
import { submitRegistration } from '../../lib/saasApi'
import { captureSaasEvent } from '../../lib/saasAnalytics'
import { campHasMemberPrice, campPriceLong, campPriceShort, formatCampDateRange, formatPrice, parseGermanDate } from '../../lib/parentFlowFormat'
import { trainingSubmitErrorMessage } from '../../lib/trainingFormat'
import ExtraQuestions from './ExtraQuestions'
import { getClubAssets } from './clubAssets'
import { demoLegalHref } from './demoMode'
import { submitErrorMessage } from './submitError'
import { parentDetailsOnly, type ParentDetails } from './siblingRegistration'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[\d ]*\d[\d ]*$/
// Same bounds as the backend (schemas.py / chk_camp_registrations_parent_address).
const POSTAL_CODE_RE = /^[0-9A-Za-z][0-9A-Za-z -]{2,8}[0-9A-Za-z]$/
// Newlines would add own lines to the invoice; same rule as the backend.
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/
const CONTROL_CHARS_MSG = 'Bitte verwenden Sie keine Zeilenumbrüche oder Steuerzeichen.'
const STREET_MAX = 120
const CITY_MAX = 80

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
  documentationConsent: boolean
  extraAnswers: Record<string, string>
  billingStreet: string
  billingPostalCode: string
  billingCity: string
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
  documentationConsent: false,
  extraAnswers: {},
  billingStreet: '',
  billingPostalCode: '',
  billingCity: '',
}

/**
 * Einzel-/Gruppentraining statt Camp: `camp` ist dann ein aus Angebot und
 * Termin gebildeter Platzhalter (Titel, Datum, Altersfenster), Datum, Uhrzeit
 * und Preistext kommen fertig formatiert aus dem Trainings-Flow.
 */
export interface TrainingFormConfig {
  dateTimeLabel: string
  priceText: string
  /** Stripe des Vereins aktiv (payment-options): dann erscheint die Zahlart "Online bezahlen". */
  onlinePaymentAvailable?: boolean
  /** Termin inzwischen voll oder vergangen: Flow lädt die Termine neu. */
  onSlotTaken?: (conflict: 'full' | 'past') => void
  /** Termin kann Geld kosten (Mitglieds- oder Nichtmitgliedspreis > 0): Rechnungsanschrift abfragen.
   * Bewusst nicht vom Mitgliedsstatus abhängig: der Browser erfährt ihn nicht. */
  billingAddressRequired?: boolean
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
  | 'billingStreet'
  | 'billingPostalCode'
  | 'billingCity'

// One source for blur feedback, progress and submit validation.
function validateForm(form: FormState, training = false, needsAddress = false): Partial<Record<FieldKey, string>> {
  const bad: Partial<Record<FieldKey, string>> = {}
  if (!form.childFirstName.trim()) bad.childFirstName = 'Bitte tragen Sie den Vornamen ein.'
  if (!form.childLastName.trim()) bad.childLastName = 'Bitte tragen Sie den Nachnamen ein.'
  if (parseGermanDate(form.childBirthDate) === null) bad.childBirthDate = 'Bitte im Format TT.MM.JJJJ.'
  if (!form.parentName.trim().includes(' ')) bad.parentName = 'Bitte Vor- und Nachnamen angeben.'
  if (!EMAIL_RE.test(form.parentEmail.trim())) bad.parentEmail = 'Diese Adresse ist unvollständig. Beispiel: name@beispiel.de'
  if (!form.parentPhone.trim()) bad.parentPhone = 'Bitte tragen Sie eine Telefonnummer ein.'
  else if (!PHONE_RE.test(form.parentPhone.trim())) bad.parentPhone = 'Bitte verwenden Sie nur Ziffern, Leerzeichen und ein + am Anfang.'
  if (!form.emergencyPhone.trim()) bad.emergencyPhone = training
    ? 'Bitte tragen Sie eine Notfallnummer ein, unter der wir Sie erreichen.'
    : 'Ohne Notfallnummer dürfen wir Ihr Kind am ersten Tag nicht übernehmen.'
  else if (!PHONE_RE.test(form.emergencyPhone.trim())) bad.emergencyPhone = 'Bitte verwenden Sie nur Ziffern, Leerzeichen und ein + am Anfang.'
  if (!form.termsAccepted) bad.agb = 'Bitte akzeptieren Sie die Teilnahmebedingungen.'
  if (!form.privacyAccepted) bad.privacy = 'Bitte stimmen Sie der Datenschutzerklärung zu.'
  if (form.allergies.trim() && !form.healthDataConsent) bad.healthDataConsent = 'Bitte stimmen Sie der Verarbeitung der Gesundheitsangaben ausdrücklich zu oder entfernen Sie diese Angaben.'
  if (needsAddress) {
    const street = form.billingStreet.trim()
    const postalCode = form.billingPostalCode.trim()
    const city = form.billingCity.trim()
    if (!street) bad.billingStreet = 'Bitte tragen Sie Straße und Hausnummer ein.'
    else if (CONTROL_CHARS_RE.test(street)) bad.billingStreet = CONTROL_CHARS_MSG
    else if (street.length > STREET_MAX) bad.billingStreet = `Bitte höchstens ${STREET_MAX} Zeichen.`
    if (!postalCode) bad.billingPostalCode = 'Bitte tragen Sie die Postleitzahl ein.'
    else if (!POSTAL_CODE_RE.test(postalCode)) bad.billingPostalCode = 'Bitte prüfen Sie die Postleitzahl (4 bis 10 Zeichen).'
    if (!city) bad.billingCity = 'Bitte tragen Sie den Ort ein.'
    else if (CONTROL_CHARS_RE.test(city)) bad.billingCity = CONTROL_CHARS_MSG
    else if (city.length > CITY_MAX) bad.billingCity = `Bitte höchstens ${CITY_MAX} Zeichen.`
  }
  return bad
}

function formatBirthDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.slice(0, 2) + (digits.length >= 2 ? '.' : '')
    + digits.slice(2, 4) + (digits.length >= 4 ? '.' : '') + digits.slice(4)
}

function ageHintForCamp(value: string, camp: CampPublic, training = false): string | null {
  const birth = parseGermanDate(value)
  if (!birth) return null
  const age = Number(camp.start_date.slice(0, 4)) - Number(birth.slice(0, 4))
    - (camp.start_date.slice(5, 10) < birth.slice(5, 10) ? 1 : 0)
  if (training) {
    return age < camp.age_min || age > camp.age_max
      ? `Dieses Training ist für Kinder von ${camp.age_min} bis ${camp.age_max} Jahren vorgesehen. Bitte prüfen Sie das Geburtsdatum oder sprechen Sie mit dem Verein.`
      : null
  }
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
  training,
  demo = false,
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
  onSubmitted: (result: RegistrationCreated, childFirstName: string, parentEmail: string, parentDetails: ParentDetails, paymentMethod?: TrainingPaymentMethod) => void
  parentPrefill?: ParentDetails | null
  onPrefillConsumed?: () => void
  siblingCamps?: CampPublic[]
  onCampChange?: (slug: string) => void
  training?: TrainingFormConfig
  /** Public demo: the form answers locally and never calls the API. */
  demo?: boolean
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
  // slot 17: Zahlart (nur Training). Neue Hooks nur hinten anfügen.
  const [paymentMethod, setPaymentMethod] = useState<TrainingPaymentMethod | null>(null)
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

  // Paid booking: the invoice needs the parent's address. Also shown when the server asks for it
  // (price changed since the page loaded). Derived, no extra hook (see hook order note above).
  const needsAddress = (training ? Boolean(training.billingAddressRequired) : camp.price_cents > 0)
    || Boolean(serverFields.billingStreet || serverFields.billingPostalCode || serverFields.billingCity)
  const validation = useMemo(() => validateForm(form, Boolean(training), needsAddress), [form, training, needsAddress])
  const ageHint = (submitAttempted || touched.childBirthDate) ? ageHintForCamp(form.childBirthDate, camp, Boolean(training)) : null

  const extraDone = useMemo(
    () => questions.every((q) => !q.required || (form.extraAnswers[q.key] ?? '').trim() !== ''),
    [questions, form.extraAnswers],
  )

  const sectionDone = useMemo(
    () => ({
      1: !validation.childFirstName && !validation.childLastName && !validation.childBirthDate,
      2: !validation.parentName && !validation.parentEmail && !validation.parentPhone
        && !validation.billingStreet && !validation.billingPostalCode && !validation.billingCity,
      3: !validation.emergencyPhone,
      4: form.termsAccepted && form.privacyAccepted && !validation.healthDataConsent && extraDone && (!training || paymentMethod !== null),
    }),
    [form, validation, extraDone, training, paymentMethod],
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

    if (Object.keys(validation).length > 0 || !extraDone || (training && !paymentMethod)) {
      captureSaasEvent('camp_registration_failed', orgSlug, camp.slug, { error_kind: 'validation' })
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
      const outcome = demo
        // Demo: answer locally, never call the API.
        ? { ok: true as const, data: { registration_token: 'demo-token', status: camp.is_full ? 'waitlist' : 'registered', payment_status: camp.is_full ? 'none' : 'open', payment_reference: 'CP-DEMO0001' } satisfies RegistrationCreated }
        : await submitRegistration(orgSlug, camp.slug, {
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
        ...(training && paymentMethod ? { payment_method: paymentMethod } : {}),
        ...(training ? { documentation_consent: form.documentationConsent } : {}),
        ...(needsAddress ? {
          parent_street: form.billingStreet.trim(),
          parent_postal_code: form.billingPostalCode.trim(),
          parent_city: form.billingCity.trim(),
        } : {}),
      })
      if (!outcome.ok) {
        captureSaasEvent('camp_registration_failed', orgSlug, camp.slug, { error_kind: 'api', status_code: outcome.status })
        setErrorStatus(outcome.status)
        setServerError(training ? trainingSubmitErrorMessage(outcome.status, outcome.conflict) : submitErrorMessage(outcome.status))
        const mapping = {
          child_first_name: 'childFirstName', child_last_name: 'childLastName', child_birth_date: 'childBirthDate',
          parent_first_name: 'parentName', parent_last_name: 'parentName', parent_email: 'parentEmail',
          parent_phone: 'parentPhone', emergency_contact_phone: 'emergencyPhone', terms_accepted: 'agb', privacy_accepted: 'privacy',
          health_data_consent: 'healthDataConsent',
          parent_street: 'billingStreet', parent_postal_code: 'billingPostalCode', parent_city: 'billingCity',
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
        if (training && outcome.status === 409 && (outcome.conflict === 'full' || outcome.conflict === 'past')) {
          training.onSlotTaken?.(outcome.conflict)
        }
        return
      }
      if (!demo) captureSaasEvent('camp_registration_succeeded', orgSlug, camp.slug, {
        result: outcome.data.status === 'registered' || outcome.data.status === 'waitlist' ? outcome.data.status : 'other',
      })
      setSubmitted(true)
      const childName = form.childFirstName.trim() || 'Ihr Kind'
      if (training && paymentMethod) onSubmitted(outcome.data, childName, form.parentEmail.trim(), parentDetailsOnly(form), paymentMethod)
      else onSubmitted(outcome.data, childName, form.parentEmail.trim(), parentDetailsOnly(form))
    } catch {
      captureSaasEvent('camp_registration_failed', orgSlug, camp.slug, { error_kind: 'network', status_code: 0 })
      setErrorStatus(0)
      setServerError(training ? trainingSubmitErrorMessage(0) : submitErrorMessage(0))
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const baseSteps = questions.length > 0 ? 4 : 3
  const totalSteps = baseSteps + (training ? 1 : 0)
  const einwilligungenStep = String(totalSteps)
  const paymentMissing = Boolean(training) && paymentMethod === null
  const errorCount = Object.keys(badFields).length + (submitAttempted
    ? questions.filter((q) => q.required && !(form.extraAnswers[q.key] ?? '').trim()).length + (paymentMissing ? 1 : 0)
    : 0)

  return (
    <section className="screen" id="s-form">
      <h1 ref={headingRef} tabIndex={-1} className="sr">{training ? 'Buchung' : 'Anmeldung'}: {camp.title}</h1>
      <div className="top">
        <button className="back" type="button" onClick={onBack} disabled={submitting} aria-label={training ? 'Zurück zu den Terminen' : 'Zurück zum Camp'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="who">
          <b>{camp.title}</b>
          <span className="num">
            {orgName}, {training ? training.dateTimeLabel : formatCampDateRange(camp.start_date, camp.end_date)}
          </span>
        </div>
      </div>

      <div className="d3c-prog" aria-hidden="true">
        <div className="d3c-prog-fill" style={{ width: `${Math.round((doneCount / 4) * 100)}%` }} />
      </div>

      <div className="form-layout d3c-layout">
        {/* Left aside — sticky on desktop, hidden on mobile */}
        <aside className="form-aside d3c-aside" aria-label={training ? 'Termin-Zusammenfassung' : 'Camp-Zusammenfassung'}>
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
                <dt>{training ? 'Termin' : 'Zeitraum'}</dt>
                <dd>{training ? training.dateTimeLabel : formatCampDateRange(camp.start_date, camp.end_date)}</dd>
              </div>
              {camp.location && (
                <div className="d3c-aside-row">
                  <dt>Ort</dt>
                  <dd>{camp.location}</dd>
                </div>
              )}
              <div className="d3c-aside-price num">{training ? training.priceText : campPriceLong(camp)}</div>
              {!training && camp.spots_remaining != null && !camp.is_full && (
                <span className={`d3c-aside-spots${camp.spots_remaining <= 10 ? ' accent' : ''}`}>
                  {camp.spots_remaining} Plätze frei
                </span>
              )}
              {!training && camp.is_full && (
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
              <span>{training ? training.dateTimeLabel : formatCampDateRange(camp.start_date, camp.end_date)}</span>
            </span>
            {!training && <span className="d3c-mob-bar-price num">{campPriceShort(camp).from ? 'ab ' : ''}{campPriceShort(camp).text}</span>}
          </button>
          {asideOpen && (
            <div className="d3c-mob-bar-body pad">
              <dl className="d3c-aside-facts">
                <div className="d3c-aside-row">
                  <dt>{training ? 'Termin' : 'Zeitraum'}</dt>
                  <dd>{training ? training.dateTimeLabel : formatCampDateRange(camp.start_date, camp.end_date)}</dd>
                </div>
                {camp.location && (
                  <div className="d3c-aside-row">
                    <dt>Ort</dt>
                    <dd>{camp.location}</dd>
                  </div>
                )}
                <div className="d3c-aside-row">
                  <dt>Preis</dt>
                  <dd className="num">{training ? training.priceText : campPriceLong(camp)}</dd>
                </div>
                {!training && camp.spots_remaining != null && !camp.is_full && camp.spots_remaining <= 10 && (
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
                    {!training && <label htmlFor="jersey_size" className="field s">
                      <span className="t-lab">Trikotgröße{orgSlug === 'ksv-baunatal' && <span className="opt-tag"> freiwillig</span>}</span>
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
                    </label>}
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
                    <span className="t-lab">Notfallnummer während {training ? 'des Trainings' : 'des Camps'} *</span>
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
                    <span className="t-lab">Allergien, Medikamente, Unverträglichkeiten{orgSlug === 'ksv-baunatal' && <span className="opt-tag"> freiwillig</span>}</span>
                    <textarea
                      id="allergies"
                      name="allergies"
                      rows={3}
                      placeholder="Nur was die Betreuer wissen müssen. Leer lassen, wenn nichts vorliegt."
                      value={form.allergies}
                      onChange={(e) => set('allergies', e.target.value)}
                      aria-describedby="hint-allergies"
                    />
                    <span className="hint" id="hint-allergies">{orgSlug === 'ksv-baunatal' ? '' : 'Freiwillig. '}Diese Angaben sehen nur die Betreuerinnen und Betreuer Ihres Kindes.</span>
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
                        <span>Ich willige ausdrücklich ein, dass {orgName} die von mir freiwillig angegebenen Allergien, Medikamente und medizinischen Hinweise meines Kindes zur sicheren Vorbereitung und Durchführung {training ? 'des Trainings' : 'des Camps'} verarbeitet. {orgSlug === 'ksv-baunatal' && !training && 'Beim KSV werden diese Angaben 30 Tage nach Campende zur manuellen Löschung geprüft. '}Ich kann die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen; ohne diese Angaben ist die Anmeldung weiterhin möglich.</span>
                        {badFields.healthDataConsent && <span id="err-health-consent" role="alert" style={{ color: 'var(--error)' }}>{badFields.healthDataConsent}</span>}
                      </span>
                    </label>
                  )}
                  <label htmlFor="pickup_authorized" className="field">
                    <span className="t-lab">Wer darf Ihr Kind abholen?{orgSlug === 'ksv-baunatal' && <span className="opt-tag"> freiwillig</span>}</span>
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
                {needsAddress && (
                  <fieldset className="f billing-address" aria-describedby="hint-billing-address" style={{ border: 'none', padding: 0, margin: '24px 0 0' }}>
                    <legend className="d3" style={{ fontSize: '1.05em', marginBottom: 4 }}>Rechnungsanschrift</legend>
                    <p className="hint" id="hint-billing-address" style={{ marginTop: 0 }}>
                      Für Ihre Rechnung von {orgName}. Wir verwenden die Anschrift nur für die Rechnungsstellung.
                    </p>
                    <label htmlFor="parent_street" className={`field${badFields.billingStreet ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.billingStreet = el }}>
                      <span className="t-lab">Straße und Hausnummer *</span>
                      <input
                        type="text"
                        id="parent_street"
                        name="parent_street"
                        autoComplete="address-line1"
                        required
                        aria-required="true"
                        value={form.billingStreet}
                        onChange={(e) => set('billingStreet', e.target.value)}
                        onBlur={() => touch('billingStreet')}
                        aria-invalid={!!badFields.billingStreet}
                        aria-describedby={badFields.billingStreet ? 'err-billing-street' : undefined}
                      />
                      <span className="err">{badFields.billingStreet && <span id="err-billing-street">{badFields.billingStreet}</span>}</span>
                    </label>
                    <div className="row2">
                      <label htmlFor="parent_postal_code" className={`field s${badFields.billingPostalCode ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.billingPostalCode = el }}>
                        <span className="t-lab">PLZ *</span>
                        <input
                          type="text"
                          id="parent_postal_code"
                          name="parent_postal_code"
                          autoComplete="postal-code"
                          inputMode="text"
                          required
                          aria-required="true"
                          maxLength={10}
                          className="num"
                          value={form.billingPostalCode}
                          onChange={(e) => set('billingPostalCode', e.target.value)}
                          onBlur={() => touch('billingPostalCode')}
                          aria-invalid={!!badFields.billingPostalCode}
                          aria-describedby={badFields.billingPostalCode ? 'err-billing-postal-code' : undefined}
                        />
                        <span className="err">{badFields.billingPostalCode && <span id="err-billing-postal-code">{badFields.billingPostalCode}</span>}</span>
                      </label>
                      <label htmlFor="parent_city" className={`field${badFields.billingCity ? ' bad' : ''}`} ref={(el) => { fieldRefs.current.billingCity = el }}>
                        <span className="t-lab">Ort *</span>
                        <input
                          type="text"
                          id="parent_city"
                          name="parent_city"
                          autoComplete="address-level2"
                          required
                          aria-required="true"
                          value={form.billingCity}
                          onChange={(e) => set('billingCity', e.target.value)}
                          onBlur={() => touch('billingCity')}
                          aria-invalid={!!badFields.billingCity}
                          aria-describedby={badFields.billingCity ? 'err-billing-city' : undefined}
                        />
                        <span className="err">{badFields.billingCity && <span id="err-billing-city">{badFields.billingCity}</span>}</span>
                      </label>
                    </div>
                  </fieldset>
                )}
              </section>

              {/* Section 3: Zusatzfragen — only rendered when questions exist */}
              <ExtraQuestions
                key={camp.slug}
                questions={questions}
                stepLabel={orgSlug === 'ksv-baunatal' && !training ? 'SCHRITT 3 VON 4' : undefined}
                answers={form.extraAnswers}
                submitAttempted={submitAttempted}
                onChange={(key, value) => setForm((prev) => ({ ...prev, extraAnswers: { ...prev.extraAnswers, [key]: value } }))}
              />

              {training && (
                <section className="fsec sec-rise" data-section="">
                  <div className="fsec-head">
                    <span className="fsec-step-lbl">{`SCHRITT ${baseSteps} VON ${totalSteps}`}</span>
                    <h2 className="d3">Zahlart</h2>
                  </div>
                  <div className="f">
                    <fieldset role="radiogroup" aria-required="true" aria-invalid={submitAttempted && paymentMissing}
                      aria-describedby={submitAttempted && paymentMissing ? 'err-payment-method' : undefined}
                      className={`field${submitAttempted && paymentMissing ? ' bad' : ''}`} style={{ border: 'none', padding: 0, margin: 0 }}>
                      <legend className="t-lab">Wie möchten Sie bezahlen? *</legend>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
                        {([['ueberweisung', 'Überweisung'], ['bar', 'Bar beim Training'], ...(training.onlinePaymentAvailable ? [['online', 'Online bezahlen']] as const : [])] as readonly (readonly [TrainingPaymentMethod, string])[]).map(([value, label]) => (
                          <label key={value} htmlFor={`payment_${value}`} style={{
                            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                            padding: '12px 16px', borderRadius: 'var(--cp-r-chip)',
                            border: `1.5px solid ${paymentMethod === value ? 'var(--cp-brand)' : 'var(--cp-field-line)'}`,
                            background: paymentMethod === value ? 'var(--cp-band)' : 'transparent',
                          }}>
                            <input id={`payment_${value}`} type="radio" name="payment_method" value={value}
                              checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} />
                            <span>{label}</span>
                          </label>
                        ))}
                      </div>
                      {submitAttempted && paymentMissing && (
                        <span className="err"><span id="err-payment-method" role="alert">Bitte wählen Sie eine Zahlart.</span></span>
                      )}
                    </fieldset>
                    <p className="note quiet">Kostenlose Absage bis 24 h vorher – bitte direkt beim Verein melden.</p>
                  </div>
                </section>
              )}

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
                      <span>Ich habe die <a href={demoLegalHref(demo, `/pilot/${orgSlug}/teilnahmebedingungen`)} target="_blank" rel="noopener noreferrer">Teilnahmebedingungen</a> gelesen und melde mein Kind verbindlich an.</span>
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
                        Ich habe die <a href={demoLegalHref(demo, `/pilot/${orgSlug}/datenschutz`)} target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a> gelesen und stimme der Verarbeitung der Daten für {training ? 'die Buchung' : 'die Camp-Anmeldung'} zu.
                      </span>
                      {badFields.privacy && <span id="err-privacy" role="alert" style={{ color: 'var(--error)' }}>{badFields.privacy}</span>}
                    </span>
                  </label>
                  <label htmlFor="photo_permission" className="consent">
                    <input id="photo_permission" type="checkbox" checked={form.photoPermission} onChange={(e) => set('photoPermission', e.target.checked)} />
                    <span className="txt">
                      <b>Fotos, freiwillig</b>
                      <span>
                        Der Verein darf Fotos meines Kindes {training ? 'vom Training' : 'vom Camp'} auf seiner Website und in sozialen Netzwerken zeigen. Ohne diese Einwilligung nimmt Ihr Kind
                        ganz normal teil.
                      </span>
                    </span>
                  </label>
                  {training && (
                    <label htmlFor="documentation_consent" className="consent">
                      <input id="documentation_consent" type="checkbox" checked={form.documentationConsent} onChange={(e) => set('documentationConsent', e.target.checked)} />
                      <span className="txt">
                        <b>Trainingsdokumentation, freiwillig</b>
                        <span>
                          Ich bin einverstanden, dass der Verein Trainingsinhalte und die Entwicklung meines Kindes intern dokumentiert (z. B. Notizen, Ziele, Messwerte). Diese Notizen sind nur für den Verein bestimmt.
                        </span>
                      </span>
                    </label>
                  )}
                  <div className="note quiet">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.5 }}>
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span>
                      Informationen zur Verarbeitung und Speicherung der Daten Ihres Kindes finden Sie in der{' '}
                      <a href={demoLegalHref(demo, `/pilot/${orgSlug}/datenschutz`)} target="_blank" rel="noopener noreferrer">Datenschutzerklärung</a>.
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
                <span className="sum num">{training ? training.priceText : campPriceLong(camp)}</span>
              </div>
              {serverError && (errorStatus === 409 || errorStatus === 404) ? (
                <a className="btn primary btn-pill" href={errorStatus === 409 && contactEmail ? `mailto:${contactEmail}` : training ? `/pilot/${orgSlug}/training` : `/pilot/${orgSlug}`}>
                  {errorStatus === 409 && contactEmail ? 'Kontakt aufnehmen' : training ? 'Alle Angebote ansehen' : 'Alle Camps ansehen'}
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
                    : training
                      ? 'Verbindlich buchen'
                      : campHasMemberPrice(camp)
                        ? 'Verbindlich anmelden'
                        : `Verbindlich anmelden · ${formatPrice(camp.price_cents, camp.currency)}`}
              </button>}
              <span className="fine">
                {training
                  ? paymentMethod === 'bar'
                    ? 'Sie zahlen bar beim Training.'
                    : paymentMethod === 'ueberweisung' && hasBankDetails
                      ? `Den Betrag überweisen Sie anschließend selbst an ${orgName}. Die Bankdaten stehen auf der nächsten Seite.`
                      : 'Den Preis bestätigen wir Ihnen auf der nächsten Seite.'
                  : camp.is_full
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
