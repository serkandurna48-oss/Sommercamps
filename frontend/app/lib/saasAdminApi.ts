/**
 * Admin-Client für backend_saas (Richtung-C Auftrag). Getrennt von
 * app/lib/saasApi.ts (Eltern-Ansicht) — andere Auth (Bearer-Token statt
 * anonym), andere Datenform (PII, alle Status statt nur "published").
 * saasApi.ts bleibt unverändert; fetchOrganization wird von dort wiederverwendet,
 * weil OrganizationPublic (Name/Logo/Farbe) nicht schützenswert ist und über
 * denselben öffentlichen Endpunkt läuft, den die Eltern-Ansicht auch nutzt.
 */

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_SAAS_API_URL ?? 'http://localhost:8000'
}

export class AdminAuthError extends Error {
  constructor() {
    super('Admin-Sitzung abgelaufen oder ungültig')
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
  billing_notes: string | null
  site_published: boolean
  camp_count?: number
}

export interface RegistrationAdmin {
  id: string
  registration_token: string
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
}

export class AdminActionError extends Error {
  constructor(message = 'Aktion konnte nicht ausgeführt werden') {
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
    super(`Slug '${slug}' ist bereits vergeben`)
    this.name = 'SlugConflictError'
  }
}

async function adminFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 401) throw new AdminAuthError()
  return res
}

/** Für alle mutierenden Admin-Aufrufe (POST/PATCH) — anders als adminFetch
 * (nur GET) sendet dies einen JSON-Body. Ein 422 (z. B. ungültiger
 * payment_status) wird wie jeder andere Fehlerstatus zu AdminActionError —
 * die aufrufende Server Action entscheidet, was der Nutzer davon sieht. */
async function adminMutate(path: string, token: string, method: 'POST' | 'PATCH', body?: unknown): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  if (res.status === 401) throw new AdminAuthError()
  return res
}

export async function adminLogin(password: string): Promise<{ token: string; expiresInHours: number }> {
  const res = await fetch(`${baseUrl()}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new AdminAuthError()
  const body = (await res.json()) as { token: string; expires_in_hours: number }
  return { token: body.token, expiresInHours: body.expires_in_hours }
}

export async function fetchCampsAdmin(orgSlug: string, token: string): Promise<CampAdmin[]> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}/camps`, token)
  if (!res.ok) throw new Error(`GET admin camps failed: ${res.status}`)
  return res.json() as Promise<CampAdmin[]>
}

/** Einzelne Organisation, admin-authentifiziert — anders als die öffentliche
 * fetchOrganization (app/lib/saasApi.ts) funktioniert das auch für einen
 * Entwurf (site_published=false). Betreiber-Konsole: Vereinsdetailseite +
 * Vorschau eines unveröffentlichten Vereins. */
export async function fetchOrganizationAdmin(orgSlug: string, token: string): Promise<OrganizationAdmin | null> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}`, token)
  if (res.status === 404) return null
  if (!res.ok) throw new AdminActionError('Verein konnte nicht geladen werden')
  return res.json() as Promise<OrganizationAdmin>
}

export async function fetchRegistrationsAdmin(
  orgSlug: string,
  campSlug: string,
  token: string,
): Promise<RegistrationAdmin[]> {
  const res = await adminFetch(`/admin/organizations/${orgSlug}/camps/${campSlug}/registrations`, token)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`GET admin registrations failed: ${res.status}`)
  return res.json() as Promise<RegistrationAdmin[]>
}

/** Alle Felder optional — nur mitgeschickte Felder werden geändert
 * (PATCH /admin/organizations/{slug}, exclude_unset auf Backend-Seite).
 * `theme` bewusst kein Feld: kein Theme-Editor im Admin. */
export interface OrganizationConfigUpdate {
  name?: string
  legal_name?: string | null
  contact_email?: string
  contact_phone?: string | null
  contact_person_name?: string | null
  logo_url?: string | null
  primary_color?: string | null
  iban?: string | null
  intro_heading?: string | null
  intro_text?: string | null
  hero_image_url?: string | null
  billing_notes?: string | null
  /** Der "Veröffentlichen"/"Zurückziehen"-Schalter — siehe
   * backend_saas admin_schemas.OrganizationUpdate.site_published. */
  site_published?: boolean
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
  if (!res.ok) throw new AdminActionError('Vereine konnten nicht geladen werden')
  return res.json() as Promise<OrganizationAdmin[]>
}

export interface OrganizationCreateInput {
  slug: string
  name: string
  legal_name?: string | null
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
  if (!res.ok) throw new AdminActionError('Verein konnte nicht angelegt werden')
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
  if (!res.ok) throw new AdminActionError('Camp konnte nicht angelegt werden')
  return res.json() as Promise<CampAdmin>
}

export async function updateOrganizationAdmin(
  orgSlug: string,
  token: string,
  data: OrganizationConfigUpdate,
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
