/**
 * CampsPilot SaaS backend client (CP-S408).
 *
 * Talks ONLY to `backend_saas` (the new multi-tenant staging API) via
 * NEXT_PUBLIC_SAAS_API_URL — a separate, distinctly-named variable from
 * NEXT_PUBLIC_API_URL, which remains the KSV/JK legacy backend's URL and
 * is untouched by this module. Powers only `app/pilot/[org]/`.
 *
 * Field names mirror backend_saas/app/schemas.py exactly (OrganizationPublic,
 * CampPublic, RegistrationCreate, RegistrationCreated) — this is a pilot
 * client for that API, not a generic abstraction over "any camp backend".
 */

import { trainingConflictKind, type TrainingConflict } from './trainingFormat'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'
}

/** KV1: Eine Zusatzfrage auf dem Anmeldeformular. */
export interface RegistrationQuestion {
  key: string
  label: string
  type: 'choice' | 'text'
  options: string[] | null
  other_label: string | null
  required: boolean
}

export interface OrganizationPublic {
  slug: string
  name: string
  legal_name: string | null
  legal_address: string | null
  contact_person_name: string | null
  contact_email: string
  contact_phone: string | null
  logo_url: string | null
  primary_color: string | null
  // Eltern-Flow-Auftrag §3.1/§3.2: bestimmt, welches der drei Themes serverseitig rendert.
  theme: 'tradition' | 'akademie' | 'kompakt'
  intro_heading: string | null
  intro_text: string | null
  hero_image_url: string | null
  // Trainer-Sektion (L1e). null = Sektion nicht anzeigen.
  trainer_image_url: string | null
  trainer_text: string | null
  // Teilnahmebedingungen (F1). null = Verweis-Platzhalter statt eigenem Text.
  terms_text: string | null
  // Für die Zahlungsdaten auf der Bestätigungsseite (§6.4). null = kein Überweisungshinweis.
  iban: string | null
  // KV1: Verein-konfigurierbare Zusatzfragen. Öffentlich (kein Admin-Login nötig). Default [].
  registration_questions?: RegistrationQuestion[]
}

export interface CampPublic {
  slug: string
  title: string
  description?: string | null
  image_url?: string | null
  start_date: string
  end_date: string
  registration_start: string | null
  registration_end: string | null
  age_min: number
  age_max: number
  capacity: number
  price_cents: number
  currency: string
  registration_open: boolean
  // §6.2: Faktentabelle + Leistungsliste. null/leer = Abschnitt nicht anzeigen.
  location: string | null
  care_info: string | null
  meals_info: string | null
  includes: string[] | null
  // §6.1/§6.2: Belegungsbalken + Wartelistenzahl.
  registered_count: number
  waitlist_count: number
  spots_remaining: number
  is_full: boolean
}

export interface RegistrationCreateInput {
  parent_first_name: string
  parent_last_name: string
  parent_email: string
  parent_phone: string
  child_first_name: string
  child_last_name: string
  child_birth_date: string // ISO date, e.g. "2018-05-10"
  jersey_size?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  allergies?: string | null
  health_data_consent?: boolean
  pickup_authorized?: string | null
  photo_permission: boolean
  terms_accepted: boolean
  privacy_accepted: boolean
  // KV1: Antworten auf die Zusatzfragen des Vereins.
  extra_answers?: Record<string, string>
  // Nur Trainingsbuchungen: Pflichtangabe. Bei Camps nicht senden.
  payment_method?: TrainingPaymentMethod
}

export type TrainingPaymentMethod = 'ueberweisung' | 'bar'

export interface RegistrationCreated {
  registration_token: string
  status: string
  payment_status: string
  payment_reference: string
  // Nur Trainingsbuchungen: der vom Server berechnete Preis (Mitglied/Nichtmitglied).
  applied_price_cents?: number
}

export interface TrainingSessionPublic {
  slug: string
  starts_at: string
  ends_at: string
  // Berliner Ortszeit, vom Server geliefert; nie aus starts_at im Browser ableiten.
  local_date: string // YYYY-MM-DD
  local_time: string // HH:MM
  capacity: number
  free_spots: number
  price_member_cents: number
  price_nonmember_cents: number
  age_min: number
  age_max: number
}

export interface TrainingOfferPublic {
  slug: string
  title: string
  kind: 'einzel' | 'gruppe'
  description: string | null
  duration_minutes: number
  location: string | null
  price_member_cents: number
  price_nonmember_cents: number
}

export interface TrainingOfferDetail extends TrainingOfferPublic {
  sessions: TrainingSessionPublic[]
}

/** Both a 404 (unknown slug) and an inactive org are indistinguishable by
 * design on the API side (see backend_saas README) — surfaced here as `null`
 * either way. Any other non-2xx status throws. */
export async function fetchOrganization(orgSlug: string): Promise<OrganizationPublic | null> {
  const res = await fetch(`${baseUrl()}/api/v1/organizations/${orgSlug}`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET organization failed: ${res.status}`)
  return res.json() as Promise<OrganizationPublic>
}

export async function fetchCamps(orgSlug: string): Promise<CampPublic[]> {
  const res = await fetch(`${baseUrl()}/api/v1/organizations/${orgSlug}/camps`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET camps failed: ${res.status}`)
  return res.json() as Promise<CampPublic[]>
}

export async function fetchTrainingOffers(orgSlug: string): Promise<TrainingOfferPublic[]> {
  const res = await fetch(`${baseUrl()}/api/v1/organizations/${encodeURIComponent(orgSlug)}/training-offers`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET training offers failed: ${res.status}`)
  return res.json() as Promise<TrainingOfferPublic[]>
}

/** 404 (unknown, draft, archived or foreign slug) -> null; other errors throw. */
export async function fetchTrainingOffer(orgSlug: string, offerSlug: string): Promise<TrainingOfferDetail | null> {
  const res = await fetch(
    `${baseUrl()}/api/v1/organizations/${encodeURIComponent(orgSlug)}/training-offers/${encodeURIComponent(offerSlug)}`,
    { cache: 'no-store' },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET training offer failed: ${res.status}`)
  return res.json() as Promise<TrainingOfferDetail>
}

export type SubmitRegistrationResult =
  | { ok: true; data: RegistrationCreated }
  | { ok: false; status: number; detail: string; conflict?: TrainingConflict; fieldErrors?: Partial<Record<keyof RegistrationCreateInput, string>> }

export async function submitRegistration(
  orgSlug: string,
  campSlug: string,
  payload: RegistrationCreateInput,
): Promise<SubmitRegistrationResult> {
  const res = await fetch(
    `${baseUrl()}/api/v1/organizations/${orgSlug}/camps/${campSlug}/registrations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const fieldErrors: Partial<Record<keyof RegistrationCreateInput, string>> = {}
    if (res.status === 422 && Array.isArray(body?.detail)) {
      for (const error of body.detail) {
        const field = error.loc?.[0] === 'body' ? error.loc[1] : undefined
        if (typeof field === 'string' && Object.hasOwn(payload, field)) {
          fieldErrors[field as keyof RegistrationCreateInput] = field === 'parent_email'
            ? 'Bitte geben Sie eine gültige E-Mail-Adresse an.'
            : 'Bitte prüfen Sie diese Angabe.'
        }
      }
    }
    if (body?.detail === "Child's age does not meet this camp's age requirements") {
      fieldErrors.child_birth_date = 'Das Alter Ihres Kindes passt zum Campbeginn nicht zur angegebenen Altersgruppe.'
    }
    const detail = Object.keys(fieldErrors).length > 0
      ? 'Bitte prüfen Sie die markierten Angaben.'
      : res.status === 409
        ? 'Für dieses Kind liegt für dieses Camp bereits eine Anmeldung vor.'
        : res.status === 429
          ? 'Zu viele Anmeldungen in kurzer Zeit. Bitte versuchen Sie es in einer Stunde erneut.'
        : res.status === 404 || res.status === 422
          ? 'Die Anmeldung für dieses Camp ist derzeit nicht möglich. Bitte wenden Sie sich an den Verein.'
          : 'Die Anmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.'
    return {
      ok: false, status: res.status, detail, fieldErrors,
      ...(res.status === 409 ? { conflict: trainingConflictKind(body?.detail) } : {}),
    }
  }
  return { ok: true, data: body as RegistrationCreated }
}

/** Stripe availability is separate from registration and defaults to false. */
export async function getStripePaymentAvailability(orgSlug: string, campSlug: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${baseUrl()}/api/v1/organizations/${encodeURIComponent(orgSlug)}/camps/${encodeURIComponent(campSlug)}/payment-options`,
      { cache: 'no-store' },
    )
    if (!res.ok) return false
    const data = await res.json()
    return data?.online_payment_available === true
  } catch {
    return false
  }
}

/** Registration token is a bearer capability; never send child data to Stripe. */
export async function createStripeCheckout(
  orgSlug: string, campSlug: string, registrationToken: string,
): Promise<string> {
  const res = await fetch(
    `${baseUrl()}/api/v1/organizations/${encodeURIComponent(orgSlug)}/camps/${encodeURIComponent(campSlug)}/registrations/${encodeURIComponent(registrationToken)}/checkout`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error('Online-Zahlung ist gerade nicht verfügbar')
  const data = await res.json()
  if (typeof data?.url !== 'string' || !/^https:\/\/checkout\.stripe\.com\//.test(data.url)) {
    throw new Error('Ungültiger Checkout-Link')
  }
  return data.url
}
