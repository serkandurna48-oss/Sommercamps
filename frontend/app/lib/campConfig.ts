import { addYears, isBefore, parseISO, startOfDay } from 'date-fns'

// ---------------------------------------------------------------------------
// Timezone strategy
//
// All date comparisons in this file are "calendar-day only" — we never care
// about hours/minutes/seconds, only about which calendar day a birthday or
// camp start falls on.
//
// Rule: represent every date as a LOCAL midnight Date object so that two dates
// on the same calendar day are always numerically equal regardless of the
// runtime's UTC offset.
//
//   parseISO("2026-06-29")          → local midnight (correct ✓)
//   new Date("2026-06-29")          → UTC midnight, shifts to previous day
//                                     in UTC+ timezones (wrong ✗)
//   new Date(year, month-1, day)    → local midnight (correct ✓)
//
// Form inputs give us a string like "2010-05-15" (from <input type="date">).
// We parse those with parseISO so they land on local midnight, not UTC.
//
// addYears() from date-fns is used instead of setFullYear() because it clamps
// Feb 29 to Feb 28 in non-leap target years — matching Python's relativedelta.
// setFullYear() overflows to Mar 1, which would create a Frontend/Backend
// inconsistency for leap-year birthdays (verified in Node, 2026-05-19).
// ---------------------------------------------------------------------------

export interface CampWeek {
  label: string      // matches DB value in selected_camp_week column exactly
  start_date: string // ISO date string, e.g. "2026-06-29"
  end_date: string   // ISO date string, e.g. "2026-07-02"
}

export interface CampInfo {
  price_cents: number
  currency: string
  age_min: number
  age_max: number
}

export interface CampConfig {
  camp: CampInfo
  weeks: CampWeek[]
}

export async function fetchCampConfig(): Promise<CampConfig> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
  const res = await fetch(`${apiUrl}/config`, { next: { revalidate: 300 } })
  if (!res.ok) {
    throw new Error(`GET /config fehlgeschlagen: ${res.status}`)
  }
  return res.json() as Promise<CampConfig>
}

// ---------------------------------------------------------------------------
// Age validation
// ---------------------------------------------------------------------------

export function isAgeValidAtCampStart(
  birthDate: Date,   // local midnight — use parseISO() to create this
  campStart: Date,   // local midnight — use parseISO() to create this
  ageMin: number,
  ageMax: number,
): { valid: boolean; reason?: string } {
  // The child is "old enough" when campStart >= their ageMin birthday.
  // The child is "too old"     when campStart >= their (ageMax+1) birthday.
  //
  // addYears clamps Feb 29 → Feb 28 in non-leap years (same as Python
  // relativedelta), so a child born 2016-02-29 turns 13 on 2029-02-28,
  // not 2029-03-01. A camp starting on 2029-02-28 is therefore the first
  // day they are too old — correctly rejected.

  const birth = startOfDay(birthDate)
  const start = startOfDay(campStart)

  const turnsAgeMin      = addYears(birth, ageMin)
  const turnsAgeMaxPlus1 = addYears(birth, ageMax + 1)

  if (isBefore(start, turnsAgeMin)) {
    return {
      valid: false,
      reason: `Das Kind muss am ersten Camp-Tag mindestens ${ageMin} Jahre alt sein.`,
    }
  }
  if (!isBefore(start, turnsAgeMaxPlus1)) {
    return {
      valid: false,
      reason: `Das Kind darf am ersten Camp-Tag höchstens ${ageMax} Jahre alt sein.`,
    }
  }
  return { valid: true }
}

/**
 * Parses an ISO date string (e.g. "2026-06-29") to a local-midnight Date.
 *
 * Use this instead of `new Date(isoString)`, which parses date-only strings
 * as UTC midnight and shifts the calendar day backward in UTC+ timezones.
 * `parseISO` from date-fns interprets date-only strings as local midnight,
 * keeping the calendar day stable regardless of the runtime's UTC offset.
 */
export function parseLocalDate(isoString: string): Date {
  return parseISO(isoString)
}
