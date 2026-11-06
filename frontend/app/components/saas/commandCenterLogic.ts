/**
 * Reine Berechnungslogik für das Camp Command Center (Auftrag Abschnitt
 * 4.3 + 9.1). Kein React, kein Fetch — isoliert testbar, gleiche
 * Begründung wie dashboardLogic.ts.
 */

import type { CampAdmin, RegistrationAdmin, TrainingPaymentRegistration } from '../../lib/saasAdminApi'
import { de } from '../../lib/i18n/de'

/** The registration fields the payment views read; full RegistrationAdmin rows fit as well. */
export type PaymentRegistration = TrainingPaymentRegistration

const ACTIVE_STATUSES = new Set(['registered', 'confirmed'])

export function isActiveRegistration(r: Pick<RegistrationAdmin, 'status'>): boolean {
  return ACTIVE_STATUSES.has(r.status)
}

/** Price owed for this registration: the applied price if set (0 is valid),
 * otherwise the camp price (legacy registrations). */
export function registrationPriceCents(camp: Pick<CampAdmin, 'price_cents'>, r: Pick<RegistrationAdmin, 'applied_price_cents'>): number {
  return r.applied_price_cents ?? camp.price_cents
}

/** Only active registrations carry an outstanding payment obligation. */
export function isOpenPayment(r: Pick<RegistrationAdmin, 'status' | 'payment_status'>): boolean {
  return isActiveRegistration(r) && r.payment_status === 'open'
}

/** Why a registration cannot be hard-deleted (null = deletable). Same order as
 * the backend guard: invoice first (GoBD), then money still held online, then
 * a recorded platform fee. The backend re-checks; this only picks the hint. */
export function deleteBlockedHint(
  r: Pick<RegistrationAdmin, 'payment_status' | 'payment_method' | 'has_invoice' | 'fee_recorded'>,
): string | null {
  if (r.has_invoice) return de.adminActions.deleteHasInvoice
  if (['paid', 'partially_refunded'].includes(r.payment_status) && r.payment_method === 'online') {
    return 'Online bezahlt: erst erstatten oder stornieren, dann löschen.'
  }
  if (r.fee_recorded) return de.adminActions.deleteHasFeeRecord
  return null
}

/** Any manual payment decision (paid, free, refunded) can be undone while the registration is active. */
export function canReopenPayment(r: Pick<RegistrationAdmin, 'status' | 'payment_status'>): boolean {
  return isActiveRegistration(r) && ['paid', 'waived', 'refunded'].includes(r.payment_status)
}

/** Amounts are calculated by the caller using each camp's price. */
export function openPaymentStats(registrations: readonly Pick<RegistrationAdmin, 'status' | 'payment_status'>[]): { count: number } {
  return { count: registrations.filter(isOpenPayment).length }
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
export function computeMoneyStats(camp: Pick<CampAdmin, 'price_cents'>, registrations: readonly Pick<RegistrationAdmin, 'status' | 'payment_status' | 'applied_price_cents'>[]): MoneyStats {
  let collectedCents = 0
  let openCents = 0
  for (const r of registrations) {
    if (!isActiveRegistration(r)) continue
    if (r.payment_status === 'paid') collectedCents += registrationPriceCents(camp, r)
    else if (isOpenPayment(r)) openCents += registrationPriceCents(camp, r)
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
    if (filter === 'payment-open' && !isOpenPayment(r)) return false
    if (filter === 'missing-info' && (!isActiveRegistration(r) || !hasMissingEmergencyContact(r))) return false

    if (!q) return true
    const haystack = `${r.child_first_name} ${r.child_last_name} ${r.parent_first_name} ${r.parent_last_name} ${r.parent_email}`.toLowerCase()
    return haystack.includes(q)
  })
}

export function countByFilter(registrations: RegistrationAdmin[]): Record<ParticipantFilter, number> {
  return {
    'payment-open': openPaymentStats(registrations).count,
    'missing-info': registrations.filter(r => isActiveRegistration(r) && hasMissingEmergencyContact(r)).length,
    all: registrations.length,
  }
}

export function birthYear(isoDate: string): number {
  return Number(isoDate.slice(0, 4))
}
