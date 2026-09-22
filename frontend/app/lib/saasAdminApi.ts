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
  status: 'draft' | 'published' | 'closed' | 'archived'
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
  photo_permission: boolean
  created_at: string
}

async function adminFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
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
