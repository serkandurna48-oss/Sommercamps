/**
 * Reine Berechnungslogik für das Camp Command Center (Auftrag Abschnitt
 * 4.3 + 9.1). Kein React, kein Fetch — isoliert testbar, gleiche
 * Begründung wie dashboardLogic.ts.
 */

import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

const ACTIVE_STATUSES = new Set(['registered', 'confirmed'])

export function isActiveRegistration(r: RegistrationAdmin): boolean {
  return ACTIVE_STATUSES.has(r.status)
}

export function hasMissingEmergencyContact(r: RegistrationAdmin): boolean {
  return !r.emergency_contact_name && !r.emergency_contact_phone
}

export function hasNotes(r: RegistrationAdmin): boolean {
  return Boolean(r.medical_notes || r.allergies)
}

export interface MoneyStats {
  collectedCents: number
  openCents: number
}

/** "Eingegangen/Offen" (Abschnitt 4.3) — Summe bezahlt vs. Summe offen,
 * nur über aktive Registrierungen (eine stornierte Anmeldung zählt für
 * keine der beiden Summen). */
export function computeMoneyStats(camp: CampAdmin, registrations: RegistrationAdmin[]): MoneyStats {
  let collectedCents = 0
  let openCents = 0
  for (const r of registrations) {
    if (!isActiveRegistration(r)) continue
    if (r.payment_status === 'paid') collectedCents += camp.price_cents
    else if (r.payment_status === 'open') openCents += camp.price_cents
  }
  return { collectedCents, openCents }
}

export type ParticipantFilter = 'payment-open' | 'missing-info' | 'all'

export function filterRegistrations(
  registrations: RegistrationAdmin[],
  filter: ParticipantFilter,
  search: string,
): RegistrationAdmin[] {
  const q = search.trim().toLowerCase()
  return registrations.filter(r => {
    if (filter === 'payment-open' && !(isActiveRegistration(r) && r.payment_status === 'open')) return false
    if (filter === 'missing-info' && !hasMissingEmergencyContact(r)) return false

    if (!q) return true
    const haystack = `${r.child_first_name} ${r.child_last_name} ${r.parent_first_name} ${r.parent_last_name} ${r.parent_email}`.toLowerCase()
    return haystack.includes(q)
  })
}

export function countByFilter(registrations: RegistrationAdmin[]): Record<ParticipantFilter, number> {
  return {
    'payment-open': registrations.filter(r => isActiveRegistration(r) && r.payment_status === 'open').length,
    'missing-info': registrations.filter(hasMissingEmergencyContact).length,
    all: registrations.length,
  }
}

export function birthYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}
