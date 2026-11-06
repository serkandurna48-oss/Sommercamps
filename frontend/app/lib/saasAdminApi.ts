/**
 * Admin-Client für backend_saas (Richtung-C Auftrag). Getrennt von
 * app/lib/saasApi.ts (Eltern-Ansicht) — andere Auth (Bearer-Token statt
 * anonym), andere Datenform (PII, alle Status statt nur "published").
 * saasApi.ts bleibt unverändert; fetchOrganization wird von dort wiederverwendet,
 * weil OrganizationPublic (Name/Logo/Farbe) nicht schützenswert ist und über
 * denselben öffentlichen Endpunkt läuft, den die Eltern-Ansicht auch nutzt.
 */

import { cache } from 'react'
import { de } from './i18n/de'
import type { RegistrationQuestion } from './saasApi'
export type { RegistrationQuestion } from './saasApi'

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'
}

export class AdminAuthError extends Error {
  constructor() {
    super(de.adminApi.auth)
    this.name = 'AdminAuthError'
  }
}

export interface CampAdmin {
  id: string
  organization_id: string
  slug: string
  title: string
  start_date: string
  end_date: string
  registration_start: string | null
  registration_end: string | null
  age_min: number
  age_max: number
  capacity: number
  price_cents: number
  currency: string
  location: string | null
  care_info: string | null
  meals_info: string | null
  includes: string[] | null
  status: 'draft' | 'published' | 'closed' | 'archived'
}

/** Admin-Sicht einer Organisation, wie sie GET /admin/organizations und
 * POST /admin/organizations liefern — enthält `id`/`plan_status`, die
 * OrganizationPublic (Eltern-Ansicht) bewusst nie zeigt. `camp_count` nur
 * in der Listen-Antwort gesetzt (0 als sicherer Default für Create/Update-
 * Antworten, die es nicht mitliefern). */
export interface OrganizationAdmin {
  id: string
  slug: string
  name: string
  legal_name: string | null
  legal_address: string | null
  contact_email: string
  contact_phone: string | null
  contact_person_name: string | null
  logo_url: string | null
  primary_color: string | null
  plan_status: string
  theme: string
  iban: string | null
  intro_heading: string | null
  intro_text: string | null
  hero_image_url: string | null
  trainer_image_url: string | null
  trainer_text: string | null
  terms_text: string | null
  /** Present only for platform owners. */
  billing_notes?: string | null
  site_published: boolean
  camp_count?: number
  // KV1: Verein-konfigurierbare Zusatzfragen bei der Anmeldung. Default [] wenn nicht vorhanden.
  registration_questions?: RegistrationQuestion[]
  /** S1 Prüfstatus-Felder — 'draft' | 'submitted' | 'approved' | 'rejected' */
  review_status?: string
  submitted_at?: string | null
  avv_version?: string | null
  avv_accepted_at?: string | null
  review_note?: string | null
  approved_at?: string | null
}

export interface RegistrationAdmin {
  id: string
  registration_token: string
  payment_reference: string
  status: 'registered' | 'confirmed' | 'cancelled' | 'waitlist'
  payment_status: 'open' | 'paid' | 'refunded' | 'waived' | 'cancelled'
  parent_first_name: string
  parent_last_name: string
  parent_email: string
  parent_phone: string
  child_first_name: string
  child_last_name: string
  child_birth_date: string
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  medical_notes: string | null
  allergies: string | null
  jersey_size: string | null
  pickup_authorized: string | null
  photo_permission: boolean
  created_at: string
  // KV1: Antworten auf die Zusatzfragen des Vereins. Default {} wenn nicht vorhanden.
  extra_answers?: Record<string, string>
  // A2: Ergebnis der letzten Eltern-Mail (Bestätigung, Warteliste, Nachrücken, Storno).
  email_sent_at?: string | null
  email_error?: string | null
  // Trainingsbuchungen: tatsächlich vereinbarter Preis (Mitglied/Nichtmitglied).
  // null/fehlend = Camp-Preis (Altbestand). 0 ist ein gültiger Preis.
  applied_price_cents?: number | null
  member_match?: boolean | null
  payment_method?: string | null
  // Spielerakte: Verknüpfung zum Spieler und Doku-Einwilligung der Buchung.
  player_id?: string | null
  documentation_consent?: boolean | null
}

export class AdminActionError extends Error {
  constructor(message: string = de.adminApi.action) {
    super(message)
    this.name = 'AdminActionError'
  }
}

/** Eigene Fehlerklasse statt AdminActionError für 409 (Slug bereits
 * vergeben) — der aufrufenden Server Action erlaubt das, im Formular eine
 * spezifische statt einer generischen Fehlermeldung zu zeigen (siehe
 * platform/new/actions.ts). */
export class SlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(de.adminApi.slugConflict(slug))
    this.name = 'SlugConflictError'
  }
}

/** Safe to expose through server actions; never includes response bodies or URLs. */
export class AdminConnectionError extends AdminActionError {}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code, cause } = error as { name?: string; code?: string; cause?: unknown }
  return name === 'TimeoutError' || code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' || (cause !== undefined && cause !== error && isTimeout(cause))
}

function retryDelay(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const seconds = Number(value)
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now()
  return Number.isFinite(milliseconds) ? Math.min(5000, Math.max(0, milliseconds)) : null
}

/** Only reads may retry. All attempts share a single retry budget. */
async function adminRequest(path: string, token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<Response> {
  const canRetry = method === 'GET'
  for (let attempt = 0; ; attempt++) {
    if (isOffline()) throw new AdminConnectionError(de.states.offline)
    const signal = AbortSignal.timeout(60_000)
    let res: Response
    try {
      res = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal,
      })
      // Fetch resolves at the headers; body timeouts must use the same retry budget.
      if (res.ok && res.status !== 204 && res.status !== 205) {
        res = new Response(await res.arrayBuffer(), {
          status: res.status, statusText: res.statusText, headers: res.headers,
        })
      }
    } catch (error) {
      if (isOffline()) throw new AdminConnectionError(de.states.offline)
      const timedOut = isTimeout(error) || (signal.aborted && isTimeout(signal.reason))
      if (canRetry && attempt === 0 && timedOut) {
        await new Promise<void>(resolve => setTimeout(resolve, 1000))
        continue
      }
      throw new AdminConnectionError(timedOut ? de.states.serverRestarting : de.states.networkError)
    }
    const delay = res.status === 503 ? retryDelay(res.headers.get('Retry-After')) : null
    if (canRetry && attempt === 0 && delay !== null) {
      await res.body?.cancel().catch(() => undefined)
      await new Promise<void>(resolve => setTimeout(resolve, delay))
      continue
    }
    if (res.status === 401) throw new AdminAuthError()
    if ([502, 503, 504].includes(res.status)) throw new AdminConnectionError(de.states.serverRestarting)
    return res
  }
}

async function adminFetch(path: string, token: string): Promise<Response> {
  return adminRequest(path, token, 'GET')
}

/** Für alle mutierenden Admin-Aufrufe (POST/PATCH) — anders als adminFetch
 * (nur GET) sendet dies einen JSON-Body. Ein 422 (z. B. ungültiger
 * payment_status) wird wie jeder andere Fehlerstatus zu AdminActionError —
 * die aufrufende Server Action entscheidet, was der Nutzer davon sieht. */
async function adminMutate(path: string, token: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<Response> {
  return adminRequest(path, token, method, body)
}

export async function fetchCampsAdmin(orgSlug: string, token: string): Promise<CampAdmin[]> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}/camps`, token)
  if (!res.ok) throw new AdminActionError(de.adminApi.campsLoad)
  return res.json() as Promise<CampAdmin[]>
}

/** Einzelne Organisation, admin-authentifiziert — anders als die öffentliche
 * fetchOrganization (app/lib/saasApi.ts) funktioniert das auch für einen
 * Entwurf (site_published=false). Betreiber-Konsole: Vereinsdetailseite +
 * Vorschau eines unveröffentlichten Vereins. */
export async function fetchOrganizationAdmin(orgSlug: string, token: string): Promise<OrganizationAdmin | null> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}`, token)
  if (res.status === 404) return null
  if (!res.ok) throw new AdminActionError(de.adminApi.organizationLoad)
  return res.json() as Promise<OrganizationAdmin>
}

export async function fetchRegistrationsAdmin(
  orgSlug: string,
  campSlug: string,
  token: string,
): Promise<RegistrationAdmin[]> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}/camps/${campSlug}/registrations`, token)
  if (res.status === 404) return []
  if (!res.ok) throw new AdminActionError(de.adminApi.registrationsLoad)
  return res.json() as Promise<RegistrationAdmin[]>
}

/** Alle Felder optional — nur mitgeschickte Felder werden geändert
 * (PATCH /admin/organizations/{slug}, exclude_unset auf Backend-Seite).
 * `theme` bewusst kein Feld: kein Theme-Editor im Admin. */
export interface OrganizationConfigUpdate {
  name?: string
  legal_name?: string | null
  legal_address?: string | null
  contact_email?: string
  contact_phone?: string | null
  contact_person_name?: string | null
  logo_url?: string | null
  primary_color?: string | null
  iban?: string | null
  intro_heading?: string | null
  intro_text?: string | null
  hero_image_url?: string | null
  trainer_image_url?: string | null
  trainer_text?: string | null
  terms_text?: string | null
  /** Der "Veröffentlichen"/"Zurückziehen"-Schalter — siehe
   * backend_saas admin_schemas.OrganizationUpdate.site_published. */
  site_published?: boolean
  // KV1: Verein-konfigurierbare Zusatzfragen bei der Anmeldung (max. 5).
  registration_questions?: RegistrationQuestion[]
}

/** Internal contract notes may only be changed by platform owners. */
export interface PlatformOrganizationUpdate extends OrganizationConfigUpdate {
  billing_notes?: string | null
}

/** Alle Felder optional — nur mitgeschickte Felder werden geändert
 * (PATCH .../camps/{campSlug}, exclude_unset auf Backend-Seite). `slug`
 * bewusst kein Feld: unveränderlich, siehe Backend CampUpdate-Docstring. */
export interface CampConfigUpdate {
  title?: string
  start_date?: string
  end_date?: string
  registration_start?: string | null
  registration_end?: string | null
  age_min?: number
  age_max?: number
  capacity?: number
  price_cents?: number
  currency?: string
  location?: string | null
  care_info?: string | null
  meals_info?: string | null
  includes?: string[] | null
  status?: 'draft' | 'published' | 'closed' | 'archived'
}

/** What an admin may manually set via setPaymentStatusAdmin — deliberately
 * excludes 'cancelled' even though RegistrationAdmin.payment_status can
 * read that value; see backend_saas admin_schemas.PaymentStatusUpdate's
 * docstring for why (nothing currently sets it automatically, so manually
 * typing it in would only ever be a confusing fake). */
export type PaymentStatus = Exclude<RegistrationAdmin['payment_status'], 'cancelled'>

export interface RegistrationStatusResult {
  registration_token: string
  status: string
  payment_status: string
}

async function mutateOrThrow(path: string, token: string, method: 'POST' | 'PATCH', body?: unknown): Promise<Response> {
  const res = await adminMutate(path, token, method, body)
  if (!res.ok) throw new AdminActionError()
  return res
}

/** Plattform-Konsole (/platform) — jede Organisation, für den Betreiber
 * selbst, nie für einen Vereins-Admin. Siehe backend_saas
 * organizations_repo.list_organizations's Docstring für die
 * Sicherheitsbegründung (nur hinter require_platform_admin, nie öffentlich). */
export async function fetchOrganizationsAdmin(token: string): Promise<OrganizationAdmin[]> {
  const res = await adminFetch('/admin/organizations', token)
  if (!res.ok) throw new AdminActionError(de.adminApi.organizationsLoad)
  return res.json() as Promise<OrganizationAdmin[]>
}

export interface OrganizationCreateInput {
  slug: string
  name: string
  legal_name?: string | null
  legal_address?: string | null
  contact_email: string
  contact_phone?: string | null
  contact_person_name?: string | null
  primary_color?: string | null
  iban?: string | null
  /** Backend-Default ist bereits false (siehe admin_schemas.
   * OrganizationCreate.site_published) — hier trotzdem explizit, damit
   * jeder Aufrufer im Frontend bewusst entscheidet statt sich auf einen
   * unsichtbaren Server-Default zu verlassen. */
  site_published?: boolean
}

export async function createOrganizationAdmin(token: string, data: OrganizationCreateInput): Promise<OrganizationAdmin> {
  const res = await adminMutate('/admin/organizations', token, 'POST', data)
  if (res.status === 409) throw new SlugConflictError(data.slug)
  if (!res.ok) throw new AdminActionError(de.adminApi.organizationCreate)
  return res.json() as Promise<OrganizationAdmin>
}

export interface CampCreateInput {
  slug: string
  title: string
  start_date: string
  end_date: string
  age_min: number
  age_max: number
  capacity: number
  price_cents: number
  status?: 'draft' | 'published'
}

export async function createCampAdmin(orgSlug: string, token: string, data: CampCreateInput): Promise<CampAdmin> {
  const res = await adminMutate(`/admin/organizations/${orgSlug}/camps`, token, 'POST', data)
  if (res.status === 409) throw new SlugConflictError(data.slug)
  if (!res.ok) throw new AdminActionError(de.adminApi.campCreate)
  return res.json() as Promise<CampAdmin>
}

export async function updateOrganizationAdmin(
  orgSlug: string,
  token: string,
  data: PlatformOrganizationUpdate,
): Promise<void> {
  await mutateOrThrow(`/admin/organizations/${orgSlug}`, token, 'PATCH', data)
}

export async function updateCampAdmin(
  orgSlug: string,
  campSlug: string,
  token: string,
  data: CampConfigUpdate,
): Promise<CampAdmin> {
  const res = await mutateOrThrow(`/admin/organizations/${orgSlug}/camps/${campSlug}`, token, 'PATCH', data)
  return res.json() as Promise<CampAdmin>
}

/** Rückt die eine älteste Warteliste-Anmeldung auf (FIFO) — nie eine vom
 * Aufrufer gewählte. `promoted: null` ist kein Fehler, nur "nichts zu tun"
 * (keine freie Kapazität oder niemand wartet). */
export async function promoteWaitlistAdmin(
  orgSlug: string,
  campSlug: string,
  token: string,
): Promise<{ promoted: RegistrationStatusResult | null }> {
  const res = await mutateOrThrow(`/admin/organizations/${orgSlug}/camps/${campSlug}/waitlist/promote`, token, 'POST')
  return res.json() as Promise<{ promoted: RegistrationStatusResult | null }>
}

/** `registrationToken` — never the internal `id` — see root CLAUDE.md
 * "registration_token vs. id: nie `id` in URLs ... exponieren". Also the
 * boundary the backend actually enforces camp-scoping on, see
 * backend_saas registrations_repo.cancel_registration_and_promote_next. */
export async function cancelRegistrationAdmin(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  token: string,
): Promise<{ cancelled: RegistrationStatusResult; promoted: RegistrationStatusResult | null }> {
  const res = await mutateOrThrow(
    `/admin/organizations/${orgSlug}/camps/${campSlug}/registrations/${registrationToken}/cancel`,
    token,
    'POST',
  )
  return res.json() as Promise<{ cancelled: RegistrationStatusResult; promoted: RegistrationStatusResult | null }>
}

/** A2: Sendet die zum aktuellen Status passende Eltern-Mail erneut.
 * 422 = Mailversand abgelehnt (Grund steht danach in email_error). Bewusst
 * nicht 502: 502 deutet adminRequest als Server-Neustart. */
export async function resendRegistrationMailAdmin(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  token: string,
): Promise<{ registration_token: string; email_sent_at: string | null }> {
  const res = await mutateOrThrow(
    `/admin/organizations/${orgSlug}/camps/${campSlug}/registrations/${registrationToken}/resend-mail`,
    token,
    'POST',
  )
  return res.json() as Promise<{ registration_token: string; email_sent_at: string | null }>
}

export async function setPaymentStatusAdmin(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  token: string,
  paymentStatus: PaymentStatus,
): Promise<RegistrationAdmin> {
  const res = await mutateOrThrow(
    `/admin/organizations/${orgSlug}/camps/${campSlug}/registrations/${registrationToken}/payment-status`,
    token,
    'PATCH',
    { payment_status: paymentStatus },
  )
  return res.json() as Promise<RegistrationAdmin>
}

export interface RegistrationDetailsInput {
  child_first_name: string
  child_last_name: string
  jersey_size: string | null
  allergies: string | null
  pickup_authorized: string | null
  parent_email?: string
}

/** MVP-Auftrag "Teilnehmerdaten-Korrektur" — lässt einen org_admin/owner
 * Tippfehler oder veraltete Angaben in einer bereits eingegangenen
 * Anmeldung korrigieren (Name, Trikotgröße, Allergien, Abholberechtigte).
 * Immer alle Felder mitschicken, wie updateCampAdmin — kein Teil-PATCH. */
export async function updateRegistrationDetailsAdmin(
  orgSlug: string,
  campSlug: string,
  registrationToken: string,
  token: string,
  data: RegistrationDetailsInput,
): Promise<RegistrationAdmin> {
  const res = await mutateOrThrow(
    `/admin/organizations/${orgSlug}/camps/${campSlug}/registrations/${registrationToken}/details`,
    token,
    'PATCH',
    data,
  )
  return res.json() as Promise<RegistrationAdmin>
}

// --- feat/platform-foundation: CEO-console-only surface ------------------

/** Wer bin ich, was darf ich sehen — einmal nach dem Login abgefragt, um
 * zwischen CEO-Konsole (platform_owner) und Einzelvereins-Ansicht
 * (org_admin) zu entscheiden. Nie clientseitig als Sicherheitsgrenze
 * behandelt — jeder einzelne Admin-Aufruf wird serverseitig erneut
 * geprüft (app/auth_deps.py); dies steuert nur, was gerendert wird. */
export interface Me {
  user_id: string
  email: string | null
  is_platform_owner: boolean
  admin_organization_slugs: string[]
}

/** Dedupliziert innerhalb eines Server-Requests: Layout und Seite teilen
 * sich denselben Aufruf wenn beide fetchMe mit demselben Token aufrufen. */
export const fetchMe = cache(async (token: string): Promise<Me> => {
  const res = await adminFetch('/admin/me', token)
  if (!res.ok) throw new AdminAuthError()
  return res.json() as Promise<Me>
})

export interface PlatformStats {
  organizations_published: number
  organizations_draft: number
  camps_total: number
  registrations_total: number
  registrations_last_30_days: number
  payments_open_cents: number
  payments_paid_cents: number
  waitlist_total: number
}

export async function fetchPlatformStats(token: string): Promise<PlatformStats> {
  const res = await adminFetch('/admin/stats', token)
  if (!res.ok) throw new AdminActionError(de.adminApi.statsLoad)
  return res.json() as Promise<PlatformStats>
}

export interface GlobalRegistration extends RegistrationAdmin {
  organization_slug: string
  organization_name: string
  camp_slug: string
  camp_title: string
}

export interface GlobalRegistrationFilter {
  organizationSlug?: string
  campSlug?: string
  status?: RegistrationAdmin['status']
}

export async function fetchGlobalRegistrationsAdmin(
  token: string,
  filter: GlobalRegistrationFilter = {},
): Promise<GlobalRegistration[]> {
  const params = new URLSearchParams()
  if (filter.organizationSlug) params.set('organization_slug', filter.organizationSlug)
  if (filter.campSlug) params.set('camp_slug', filter.campSlug)
  if (filter.status) params.set('registration_status', filter.status)
  const query = params.toString()
  const res = await adminFetch(`/admin/registrations${query ? `?${query}` : ''}`, token)
  if (!res.ok) throw new AdminActionError(de.adminApi.registrationsLoad)
  return res.json() as Promise<GlobalRegistration[]>
}

export interface AuditLogEntry {
  id: string
  actor_user_id: string | null
  actor_email: string | null
  action: string
  organization_id: string | null
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function fetchAuditLogAdmin(token: string, organizationSlug?: string): Promise<AuditLogEntry[]> {
  const query = organizationSlug ? `?organization_slug=${encodeURIComponent(organizationSlug)}` : ''
  const res = await adminFetch(`/admin/audit-log${query}`, token)
  if (!res.ok) throw new AdminActionError(de.adminApi.auditLoad)
  return res.json() as Promise<AuditLogEntry[]>
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  email: string | null
  role: string
  created_at: string
  invited?: boolean
  invite_mail_sent?: boolean | null
}

export async function fetchOrganizationMembersAdmin(orgSlug: string, token: string): Promise<OrganizationMember[]> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}/members`, token)
  if (!res.ok) throw new AdminActionError(de.adminApi.membersLoad)
  return res.json() as Promise<OrganizationMember[]>
}

/** Weist ein bereits bestehendes Supabase-Auth-Konto (per E-Mail gesucht)
 * als org_admin zu — sendet keine Einladungs-E-Mail (siehe Backend-
 * Docstring). 404 heißt: noch kein Konto für diese E-Mail vorhanden. */
export async function addOrganizationMemberAdmin(orgSlug: string, token: string, email: string): Promise<OrganizationMember> {
  const res = await adminMutate(`/admin/organizations/${orgSlug}/members`, token, 'POST', { email })
  if (!res.ok) throw new AdminActionError(de.adminApi.memberAdd)
  return res.json() as Promise<OrganizationMember>
}

export async function removeOrganizationMemberAdmin(orgSlug: string, memberId: string, token: string): Promise<void> {
  const res = await adminMutate(`/admin/organizations/${orgSlug}/members/${memberId}`, token, 'DELETE')
  if (!res.ok) throw new AdminActionError(de.adminApi.memberRemove)
}

/** Alle Vereine mit dem gegebenen Prüfstatus (z. B. 'submitted') — nur platform_owner.
 * Liefert dieselbe Datenform wie fetchOrganizationsAdmin, nur gefiltert. */
export async function listOrganizationsByReviewStatus(status: string, token: string): Promise<OrganizationAdmin[]> {
  const res = await adminFetch(`/admin/organizations?review_status=${encodeURIComponent(status)}`, token)
  if (!res.ok) throw new AdminActionError(de.adminApi.organizationsLoad)
  return res.json() as Promise<OrganizationAdmin[]>
}

/** Freigabe-Entscheidung (platform_owner only).
 * decision='approve' → Verein wird freigegeben und öffentlich.
 * decision='reject' → note ist Pflicht (min. 10 Zeichen). */
export async function reviewOrganization(
  slug: string,
  decision: 'approve' | 'reject',
  token: string,
  note?: string,
): Promise<OrganizationAdmin> {
  const body: { decision: string; note?: string } = { decision }
  if (note) body.note = note
  const res = await adminMutate(`/admin/organizations/${slug}/review`, token, 'POST', body)
  if (res.status === 409)
    throw new AdminActionError(de.adminApi.reviewConflict)
  if (!res.ok) throw new AdminActionError(de.adminApi.reviewSave)
  return res.json() as Promise<OrganizationAdmin>
}

export async function submitReviewAdmin(
  orgSlug: string,
  token: string,
  avvVersion: string,
): Promise<OrganizationAdmin> {
  const res = await adminMutate(
    `/admin/organizations/${orgSlug}/submit-review`,
    token,
    'POST',
    { accept_avv: true as const, avv_version: avvVersion },
  )
  if (!res.ok) throw new AdminActionError(de.adminApi.reviewSubmit)
  return res.json() as Promise<OrganizationAdmin>
}

export interface StripeConnectStatus {
  configured: boolean
  charges_enabled: boolean
  online_payment_enabled: boolean
}

/** Owner only: links a Stripe account that is already connected to the
 * CampsPilot platform. 422 = unknown or not connected account, 503 = Stripe
 * is not configured for this environment. */
export async function connectStripeAccount(orgSlug: string, token: string, stripeAccountId: string): Promise<StripeConnectStatus> {
  const res = await adminMutate(`/admin/organizations/${orgSlug}/stripe/connect-account`, token, 'POST', { stripe_account_id: stripeAccountId })
  if (res.status === 422) throw new AdminActionError('Stripe-Konto nicht gefunden oder nicht mit CampsPilot verbunden.')
  if (res.status === 503) throw new AdminActionError('Online-Zahlung ist in dieser Umgebung noch nicht eingerichtet.')
  if (!res.ok) throw new AdminActionError('Stripe-Konto konnte nicht verbunden werden.')
  return res.json() as Promise<StripeConnectStatus>
}

// --- Trainingsangebote, Termine und Vereinsmitglieder ---------------------

/** Fehler mit festem, nutzerverständlichem deutschem Text. Die Meldung darf an
 * den Browser durchgereicht werden; sie enthält nie Antwortinhalte. */
export class TrainingAdminError extends AdminActionError {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'TrainingAdminError'
  }
}

export interface ImportErrorItem {
  row: number
  field: string
  code: string
}

/** Import abgelehnt (422/413): nichts wurde gespeichert. Trägt bewusst nur
 * Zeile, Feld und Code — nie Zellinhalte (Kinderdaten). */
export class MemberImportError extends AdminActionError {
  constructor(public readonly errors: ImportErrorItem[]) {
    super('Import abgelehnt – es wurde nichts gespeichert.')
    this.name = 'MemberImportError'
  }
}

export type TrainingOfferCategory = 'fussball' | 'athletik' | 'mental' | 'videoanalyse' | 'premium'

export interface TrainingOffer {
  id: string
  slug: string
  title: string
  kind: 'einzel' | 'gruppe'
  description: string | null
  duration_minutes: number
  location: string | null
  price_member_cents: number
  price_nonmember_cents: number
  status: 'draft' | 'published' | 'archived'
  category?: TrainingOfferCategory | null
  created_at: string
  updated_at: string
}

export interface TrainingOfferCreateInput {
  slug: string
  title: string
  kind: 'einzel' | 'gruppe'
  description: string | null
  duration_minutes: number
  location: string | null
  price_member_cents: number
  price_nonmember_cents: number
  status: 'draft' | 'published' | 'archived'
  category?: TrainingOfferCategory | null
}

/** slug und kind sind unveränderlich. */
export type TrainingOfferUpdateInput = Partial<Omit<TrainingOfferCreateInput, 'slug' | 'kind'>>

/** Termin eines Angebots. `local_date`/`local_time` sind Berliner Ortszeit —
 * für die Anzeige verwenden, nie aus `starts_at` (UTC) im Browser rechnen. */
export interface TrainingSessionAdmin {
  id: string
  offer_id: string
  slug: string
  status: 'draft' | 'published' | 'closed' | 'archived'
  starts_at: string
  ends_at: string
  local_date: string
  local_time: string
  capacity: number
  booked_count: number
  free_spots: number
  price_member_cents: number
  price_nonmember_cents: number
  age_min: number
  age_max: number
  location: string | null
}

export interface TrainingSessionCreateInput {
  date: string
  start_time: string
  capacity?: number
  age_min?: number
  age_max?: number
  status: 'published' | 'draft'
}

export interface TrainingSessionSeriesInput {
  start_date: string
  start_time: string
  weeks: number
  capacity?: number
  age_min?: number
  age_max?: number
  status: 'published' | 'draft'
}

export interface TrainingSessionSeriesResult {
  created: number
  sessions: TrainingSessionAdmin[]
}

/** Buchung aus `GET …/training-payments`: nur die Felder, die die Zahlungsseite braucht
 * (keine Gesundheits-, Notfall- oder Telefonangaben). */
export type TrainingPaymentRegistration = Pick<RegistrationAdmin,
  | 'id' | 'registration_token' | 'status' | 'payment_status' | 'payment_reference'
  | 'parent_first_name' | 'parent_last_name' | 'parent_email'
  | 'child_first_name' | 'child_last_name' | 'created_at'
  | 'payment_method' | 'member_match' | 'applied_price_cents'>

/** Ein Termin mit mindestens einer Buchung (jeder Status), sortiert nach Angebot und Beginn. */
export interface TrainingPaymentSessionGroup {
  offer: Pick<TrainingOffer, 'id' | 'title' | 'kind' | 'status'>
  session: TrainingSessionAdmin
  registrations: TrainingPaymentRegistration[]
}

/** `GET …/training-offers/{id}/overview`: Angebot, Termine und je Termin die vollen Buchungen. */
export interface TrainingOfferOverview {
  offer: TrainingOffer
  sessions: (TrainingSessionAdmin & { registrations: RegistrationAdmin[] })[]
}

export interface ClubMember {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  member_number: string | null
  active: boolean
  source: 'csv' | 'manual'
  created_at: string
}

export interface ClubMemberCreateInput {
  first_name: string
  last_name: string
  birth_date: string
  member_number?: string | null
}

export interface MemberImportResult {
  rows: number
  created: number
  updated: number
  merged_in_file: number
}

const TRAINING_BASE = (orgSlug: string) => `/admin/organizations/${encodeURIComponent(orgSlug)}/training-offers`
const MEMBERS_BASE = (orgSlug: string) => `/admin/organizations/${encodeURIComponent(orgSlug)}/club-members`

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json() as { detail?: { code?: unknown } }
    return typeof body?.detail?.code === 'string' ? body.detail.code : undefined
  } catch {
    return undefined
  }
}

const SESSION_BLOCKED: Record<string, string> = {
  session_has_active_registrations: 'Für diesen Termin gibt es noch aktive Buchungen. Bitte zuerst die Buchungen stornieren.',
  session_has_registration_history: 'Für diesen Termin gab es schon Buchungen. Sie können ihn nur noch absagen, nicht löschen.',
}

export async function fetchTrainingOffersAdmin(orgSlug: string, token: string): Promise<TrainingOffer[]> {
  const res = await adminFetch(TRAINING_BASE(orgSlug), token)
  if (!res.ok) throw new TrainingAdminError('Angebote konnten nicht geladen werden.')
  return res.json() as Promise<TrainingOffer[]>
}

export async function fetchTrainingOfferAdmin(orgSlug: string, offerId: string, token: string): Promise<TrainingOffer | null> {
  const res = await adminFetch(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}`, token)
  // 422: keine gültige ID in der URL, für den Nutzer ebenfalls "nicht gefunden".
  if (res.status === 404 || res.status === 422) return null
  if (!res.ok) throw new TrainingAdminError('Angebot konnte nicht geladen werden.')
  return res.json() as Promise<TrainingOffer>
}

export async function createTrainingOfferAdmin(orgSlug: string, token: string, data: TrainingOfferCreateInput): Promise<TrainingOffer> {
  const res = await adminMutate(TRAINING_BASE(orgSlug), token, 'POST', data)
  if (res.status === 409) throw new SlugConflictError(data.slug)
  if (!res.ok) throw new TrainingAdminError('Angebot konnte nicht angelegt werden – Angaben prüfen.')
  return res.json() as Promise<TrainingOffer>
}

export async function updateTrainingOfferAdmin(orgSlug: string, offerId: string, token: string, data: TrainingOfferUpdateInput): Promise<TrainingOffer> {
  const res = await adminMutate(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}`, token, 'PATCH', data)
  if (!res.ok) throw new TrainingAdminError('Angebot konnte nicht gespeichert werden – Angaben prüfen.')
  return res.json() as Promise<TrainingOffer>
}

export async function fetchTrainingSessionsAdmin(orgSlug: string, offerId: string, token: string): Promise<TrainingSessionAdmin[]> {
  const res = await adminFetch(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions`, token)
  if (!res.ok) throw new TrainingAdminError('Termine konnten nicht geladen werden.')
  return res.json() as Promise<TrainingSessionAdmin[]>
}

export async function createTrainingSessionAdmin(
  orgSlug: string,
  offerId: string,
  token: string,
  data: TrainingSessionCreateInput,
): Promise<TrainingSessionAdmin> {
  const res = await adminMutate(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions`, token, 'POST', data)
  if (res.status === 409) throw new TrainingAdminError('Zu diesem Zeitpunkt existiert bereits ein Termin für dieses Angebot.', 'session_exists')
  if (res.status === 422) {
    throw new TrainingAdminError('Termin ungültig – bitte Datum, Uhrzeit und Plätze prüfen. Während der Zeitumstellung gibt es Uhrzeiten, die nicht oder doppelt vorkommen.', 'invalid')
  }
  if (!res.ok) throw new TrainingAdminError('Termin konnte nicht angelegt werden.')
  return res.json() as Promise<TrainingSessionAdmin>
}

/** Wöchentliche Serie: ganz oder gar nicht (409 `session_exists` = es wurde nichts angelegt). */
export async function createTrainingSessionSeriesAdmin(
  orgSlug: string,
  offerId: string,
  token: string,
  data: TrainingSessionSeriesInput,
): Promise<TrainingSessionSeriesResult> {
  const res = await adminMutate(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions/series`, token, 'POST', data)
  if (res.status === 409) {
    throw new TrainingAdminError('Mindestens ein Termin der Serie existiert bereits – es wurde nichts angelegt.', 'session_exists')
  }
  if (res.status === 422) {
    throw new TrainingAdminError('Serie ungültig – bitte Datum, Uhrzeit, Wochen und Plätze prüfen. Fällt ein Termin in die Zeitumstellung (Uhrzeit nicht oder doppelt vorhanden), wird nichts angelegt.', 'invalid')
  }
  if (!res.ok) throw new TrainingAdminError('Serie konnte nicht angelegt werden.')
  return res.json() as Promise<TrainingSessionSeriesResult>
}

export async function deleteTrainingSessionAdmin(orgSlug: string, offerId: string, sessionId: string, token: string): Promise<void> {
  const res = await adminMutate(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions/${encodeURIComponent(sessionId)}`, token, 'DELETE')
  if (res.status === 409) {
    const code = await errorCode(res)
    throw new TrainingAdminError((code && SESSION_BLOCKED[code]) || 'Der Termin kann nicht gelöscht werden.', code)
  }
  if (!res.ok) throw new TrainingAdminError('Termin konnte nicht gelöscht werden.')
}

export async function cancelTrainingSessionAdmin(orgSlug: string, offerId: string, sessionId: string, token: string): Promise<TrainingSessionAdmin> {
  const res = await adminMutate(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions/${encodeURIComponent(sessionId)}/cancel`, token, 'POST')
  if (res.status === 409) {
    const code = await errorCode(res)
    throw new TrainingAdminError((code && SESSION_BLOCKED[code]) || 'Der Termin kann nicht abgesagt werden.', code)
  }
  if (!res.ok) throw new TrainingAdminError('Termin konnte nicht abgesagt werden.')
  return res.json() as Promise<TrainingSessionAdmin>
}

export async function fetchSessionRegistrationsAdmin(orgSlug: string, offerId: string, sessionId: string, token: string): Promise<RegistrationAdmin[]> {
  const res = await adminFetch(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/sessions/${encodeURIComponent(sessionId)}/registrations`, token)
  if (!res.ok) throw new TrainingAdminError('Buchungen konnten nicht geladen werden.')
  return res.json() as Promise<RegistrationAdmin[]>
}

/** Alle Trainingsbuchungen des Vereins für die Zahlungsseite, eine Anfrage statt Angebote → Termine → Buchungen. */
export async function fetchTrainingPaymentsAdmin(orgSlug: string, token: string): Promise<TrainingPaymentSessionGroup[]> {
  const res = await adminFetch(`/admin/organizations/${encodeURIComponent(orgSlug)}/training-payments`, token)
  if (!res.ok) throw new TrainingAdminError('Trainingszahlungen konnten nicht geladen werden.')
  return res.json() as Promise<TrainingPaymentSessionGroup[]>
}

/** Angebot samt Terminen und Buchungen in einer Anfrage; `null` bei unbekanntem Angebot. */
export async function fetchTrainingOfferOverviewAdmin(orgSlug: string, offerId: string, token: string): Promise<TrainingOfferOverview | null> {
  const res = await adminFetch(`${TRAINING_BASE(orgSlug)}/${encodeURIComponent(offerId)}/overview`, token)
  // 422: keine gültige ID in der URL, für den Nutzer ebenfalls "nicht gefunden".
  if (res.status === 404 || res.status === 422) return null
  if (!res.ok) throw new TrainingAdminError('Angebot konnte nicht geladen werden.')
  return res.json() as Promise<TrainingOfferOverview>
}

export async function fetchClubMembersAdmin(orgSlug: string, token: string, filter: { q?: string; active?: boolean } = {}): Promise<ClubMember[]> {
  const params = new URLSearchParams()
  if (filter.q?.trim()) params.set('q', filter.q.trim())
  if (filter.active !== undefined) params.set('active', String(filter.active))
  const query = params.toString()
  const res = await adminFetch(`${MEMBERS_BASE(orgSlug)}${query ? `?${query}` : ''}`, token)
  if (!res.ok) throw new TrainingAdminError('Mitglieder konnten nicht geladen werden.')
  return res.json() as Promise<ClubMember[]>
}

export async function createClubMemberAdmin(orgSlug: string, token: string, data: ClubMemberCreateInput): Promise<ClubMember> {
  const res = await adminMutate(MEMBERS_BASE(orgSlug), token, 'POST', data)
  if (res.status === 409) throw new TrainingAdminError('Dieses Mitglied ist bereits eingetragen.', 'member_exists')
  if (!res.ok) throw new TrainingAdminError('Mitglied konnte nicht gespeichert werden – Angaben prüfen.')
  return res.json() as Promise<ClubMember>
}

export async function setClubMemberActiveAdmin(orgSlug: string, memberId: string, token: string, active: boolean): Promise<ClubMember> {
  const res = await adminMutate(`${MEMBERS_BASE(orgSlug)}/${encodeURIComponent(memberId)}`, token, 'PATCH', { active })
  if (!res.ok) throw new TrainingAdminError('Status konnte nicht geändert werden.')
  return res.json() as Promise<ClubMember>
}

/** Sendet den bereits dekodierten CSV-Text. Bei Ablehnung (422/413) wird nur
 * Zeile/Feld/Code übernommen, sonst nichts aus der Antwort. */
export async function importClubMembersAdmin(orgSlug: string, token: string, csv: string): Promise<MemberImportResult> {
  const res = await adminMutate(`${MEMBERS_BASE(orgSlug)}/import`, token, 'POST', { csv })
  if (res.status === 422 || res.status === 413) {
    let errors: ImportErrorItem[] = []
    try {
      const body = await res.json() as { detail?: { errors?: unknown } }
      const raw = body?.detail?.errors
      if (Array.isArray(raw)) {
        errors = raw.flatMap(item => {
          const e = item as Partial<ImportErrorItem>
          return typeof e?.row === 'number' && typeof e.field === 'string' && typeof e.code === 'string'
            ? [{ row: e.row, field: e.field, code: e.code }]
            : []
        })
      }
    } catch {
      errors = []
    }
    throw new MemberImportError(errors)
  }
  if (!res.ok) throw new TrainingAdminError('Import fehlgeschlagen – es wurde nichts gespeichert.')
  return res.json() as Promise<MemberImportResult>
}

// --- Spielerakte (nur Admin, Kinderdaten) ---------------------------------

/** Fehler mit festem deutschem Text; enthält nie Antwortinhalte (Notiztexte, Namen). */
export class PlayerRecordError extends AdminActionError {
  constructor(message: string, public readonly field?: string) {
    super(message)
    this.name = 'PlayerRecordError'
  }
}

export type PlayerFocus = 'technik' | 'athletik' | 'taktik' | 'mental' | 'video' | 'sonstiges'
export type PlayerGoalStatus = 'offen' | 'erreicht' | 'verworfen'

export interface PlayerSummary {
  id: string
  first_name: string
  last_name: string
  birth_date: string
  age: number
  last_booking_at: string | null
  booking_count: number
  note_count: number
  open_goal_count: number
}

export interface PlayerBooking {
  registration_id: string
  camp_id: string
  kind: 'training' | 'camp'
  camp_title: string
  offer_title: string | null
  local_date: string
  local_time: string | null
  status: 'registered' | 'confirmed' | 'cancelled' | 'waitlist'
  payment_status: 'open' | 'paid' | 'refunded' | 'waived' | 'cancelled'
  documentation_consent: boolean | null
}

export interface PlayerNote {
  id: string
  player_id: string
  camp_id: string | null
  note_date: string
  focus: PlayerFocus[]
  body: string
  rating: number | null
  next_steps: string | null
  video_url: string | null
  created_at: string
  updated_at: string
}

export interface PlayerGoal {
  id: string
  player_id: string
  title: string
  area: PlayerFocus
  status: PlayerGoalStatus
  target_date: string | null
  created_at: string
  updated_at: string
}

export interface PlayerMeasurement {
  id: string
  player_id: string
  measured_on: string
  metric: string
  value: number
  unit: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface PlayerMetric {
  metric: string
  unit: string
}

export interface PlayerDetail {
  player: { id: string; first_name: string; last_name: string; birth_date: string; age: number }
  bookings: PlayerBooking[]
  notes: PlayerNote[]
  goals: PlayerGoal[]
  measurements: PlayerMeasurement[]
  metrics: PlayerMetric[]
}

/** Notiz-Eingabe; Felder wie im Backend (`video_url` nur https). */
export interface PlayerNoteInput {
  note_date: string
  body: string
  focus: PlayerFocus[]
  rating: number | null
  next_steps: string | null
  video_url: string | null
  camp_id: string | null
}

export interface PlayerGoalInput {
  title: string
  area: PlayerFocus
  target_date: string | null
}

export interface PlayerMeasurementInput {
  measured_on: string
  metric: string
  value: number
  unit: string
  note: string | null
}

const PLAYERS_BASE = (orgSlug: string) => `/admin/organizations/${encodeURIComponent(orgSlug)}/players`
const playerPath = (orgSlug: string, playerId: string) => `${PLAYERS_BASE(orgSlug)}/${encodeURIComponent(playerId)}`

/** Backend-422 nennt nur Feld und festen Grund; hier wird daraus ein Feldname ohne Werte. */
async function validationField(res: Response): Promise<string | undefined> {
  try {
    const body = await res.json() as { detail?: { field?: unknown } }
    return typeof body?.detail?.field === 'string' ? body.detail.field : undefined
  } catch {
    return undefined
  }
}

async function playerWrite<T>(path: string, token: string, method: 'POST' | 'PATCH', body: unknown, failure: string): Promise<T> {
  const res = await adminMutate(path, token, method, body)
  if (res.status === 422) throw new PlayerRecordError(`${failure} Bitte die Eingaben prüfen.`, await validationField(res))
  if (res.status === 404) throw new PlayerRecordError('Eintrag nicht gefunden – bitte die Seite neu laden.')
  if (!res.ok) throw new PlayerRecordError(failure)
  return res.json() as Promise<T>
}

async function playerDelete(path: string, token: string, failure: string): Promise<void> {
  const res = await adminMutate(path, token, 'DELETE')
  if (res.status === 404) throw new PlayerRecordError('Eintrag nicht gefunden – bitte die Seite neu laden.')
  if (!res.ok) throw new PlayerRecordError(failure)
}

export async function fetchPlayersAdmin(orgSlug: string, token: string): Promise<PlayerSummary[]> {
  const res = await adminFetch(PLAYERS_BASE(orgSlug), token)
  if (!res.ok) throw new PlayerRecordError('Spieler konnten nicht geladen werden.')
  return res.json() as Promise<PlayerSummary[]>
}

export async function fetchPlayerAdmin(orgSlug: string, playerId: string, token: string): Promise<PlayerDetail | null> {
  const res = await adminFetch(playerPath(orgSlug, playerId), token)
  if (res.status === 404 || res.status === 422) return null
  if (!res.ok) throw new PlayerRecordError('Spielerakte konnte nicht geladen werden.')
  return res.json() as Promise<PlayerDetail>
}

export async function createPlayerNoteAdmin(orgSlug: string, playerId: string, token: string, data: PlayerNoteInput): Promise<PlayerNote> {
  return playerWrite(`${playerPath(orgSlug, playerId)}/notes`, token, 'POST', data, 'Notiz konnte nicht gespeichert werden.')
}

export async function updatePlayerNoteAdmin(orgSlug: string, playerId: string, noteId: string, token: string, data: Partial<PlayerNoteInput>): Promise<PlayerNote> {
  return playerWrite(`${playerPath(orgSlug, playerId)}/notes/${encodeURIComponent(noteId)}`, token, 'PATCH', data, 'Notiz konnte nicht gespeichert werden.')
}

export async function deletePlayerNoteAdmin(orgSlug: string, playerId: string, noteId: string, token: string): Promise<void> {
  return playerDelete(`${playerPath(orgSlug, playerId)}/notes/${encodeURIComponent(noteId)}`, token, 'Notiz konnte nicht gelöscht werden.')
}

export async function createPlayerGoalAdmin(orgSlug: string, playerId: string, token: string, data: PlayerGoalInput): Promise<PlayerGoal> {
  return playerWrite(`${playerPath(orgSlug, playerId)}/goals`, token, 'POST', data, 'Ziel konnte nicht gespeichert werden.')
}

export async function updatePlayerGoalAdmin(orgSlug: string, playerId: string, goalId: string, token: string, data: Partial<PlayerGoalInput> & { status?: PlayerGoalStatus }): Promise<PlayerGoal> {
  return playerWrite(`${playerPath(orgSlug, playerId)}/goals/${encodeURIComponent(goalId)}`, token, 'PATCH', data, 'Ziel konnte nicht geändert werden.')
}

export async function createPlayerMeasurementAdmin(orgSlug: string, playerId: string, token: string, data: PlayerMeasurementInput): Promise<PlayerMeasurement> {
  return playerWrite(`${playerPath(orgSlug, playerId)}/measurements`, token, 'POST', data, 'Messwert konnte nicht gespeichert werden.')
}

export async function deletePlayerMeasurementAdmin(orgSlug: string, playerId: string, measurementId: string, token: string): Promise<void> {
  return playerDelete(`${playerPath(orgSlug, playerId)}/measurements/${encodeURIComponent(measurementId)}`, token, 'Messwert konnte nicht gelöscht werden.')
}
