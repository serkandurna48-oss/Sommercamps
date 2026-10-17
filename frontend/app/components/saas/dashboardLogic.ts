/**
 * Reine Berechnungslogik für das Organisation-Dashboard (Auftrag Abschnitt
 * 4.2 + 9.1: "Berechnete Werte werden im Frontend aus den gelieferten
 * Rohdaten berechnet, nicht als neue Backend-Felder verlangt"). Kein
 * React, kein Fetch — nur Transformation, damit sie isoliert testbar ist.
 *
 * Bewusst NICHT berechnet, weil die Rohdaten dafür fehlen (siehe
 * Bestandsaufnahme-Feature-Matrix, nichts wird erfunden — Abschnitt 9.1):
 * - "Zahlung über Frist" — es gibt kein Fälligkeitsdatum, nur den binären
 *   payment_status. Task heißt deshalb ehrlich "Zahlung offen", nicht
 *   "überfällig".
 * - "E-Mail-Zustellfehler" — email_sent_at ist nur ein Zeitstempel, kein
 *   Fehlerstatus. Kein Task-Typ dafür.
 * - "Camp ohne Termin" — start_date ist DB-seitig NOT NULL, kann nicht
 *   fehlen.
 */

import type { CampAdmin, RegistrationAdmin } from '../../lib/saasAdminApi'

const ACTIVE_STATUSES = new Set(['registered', 'confirmed'])

export interface CampWithStats {
  camp: CampAdmin
  registeredCount: number
  waitlistCount: number
  openPaymentsCount: number
  missingEmergencyContactCount: number
}

export function computeCampStats(camp: CampAdmin, registrations: RegistrationAdmin[]): CampWithStats {
  let registeredCount = 0
  let waitlistCount = 0
  let openPaymentsCount = 0
  let missingEmergencyContactCount = 0

  for (const r of registrations) {
    if (ACTIVE_STATUSES.has(r.status)) {
      registeredCount++
      if (r.payment_status === 'open') openPaymentsCount++
      if (!r.emergency_contact_name && !r.emergency_contact_phone) missingEmergencyContactCount++
    } else if (r.status === 'waitlist') {
      waitlistCount++
    }
  }

  return { camp, registeredCount, waitlistCount, openPaymentsCount, missingEmergencyContactCount }
}

/** Nächstes Camp: veröffentlicht, noch nicht vorbei, frühestes Startdatum. */
export function pickNextCamp(campsWithStats: CampWithStats[]): CampWithStats | null {
  const todayIso = new Date().toISOString().slice(0, 10)
  const upcoming = campsWithStats
    .filter(c => c.camp.status === 'published' && c.camp.end_date >= todayIso)
    .sort((a, b) => a.camp.start_date.localeCompare(b.camp.start_date))
  return upcoming[0] ?? null
}

export interface Task {
  id: string
  kind: 'payment' | 'waitlist' | 'missing-contact'
  campSlug: string
  campTitle: string
  count: number
  /** Priorität absteigend: kleinere Zahl = dringlicher (Abschnitt 4.2). */
  priority: number
}

/** Priorisierung aus Abschnitt 4.2: Zahlung -> fehlende Angaben ->
 * Kapazität/Warteliste (die zwei nicht berechenbaren Typen entfallen,
 * siehe Moduldoc oben). */
export function buildTasks(campsWithStats: CampWithStats[]): Task[] {
  const tasks: Task[] = []
  for (const c of campsWithStats) {
    if (c.openPaymentsCount > 0) {
      tasks.push({
        id: `${c.camp.slug}-payment`,
        kind: 'payment',
        campSlug: c.camp.slug,
        campTitle: c.camp.title,
        count: c.openPaymentsCount,
        priority: 1,
      })
    }
    if (c.missingEmergencyContactCount > 0) {
      tasks.push({
        id: `${c.camp.slug}-contact`,
        kind: 'missing-contact',
        campSlug: c.camp.slug,
        campTitle: c.camp.title,
        count: c.missingEmergencyContactCount,
        priority: 2,
      })
    }
    if (c.waitlistCount > 0) {
      tasks.push({
        id: `${c.camp.slug}-waitlist`,
        kind: 'waitlist',
        campSlug: c.camp.slug,
        campTitle: c.camp.title,
        count: c.waitlistCount,
        priority: 3,
      })
    }
  }
  return tasks.sort((a, b) => a.priority - b.priority)
}
