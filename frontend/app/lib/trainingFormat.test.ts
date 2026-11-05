import { describe, expect, it } from 'vitest'
import {
  bookingPriceText,
  findBookableSession,
  sessionAsCamp,
  euroText,
  formatSessionDateTime,
  memberPriceText,
  sessionAvailability,
  trainingConflictKind,
  trainingSubmitErrorMessage,
} from './trainingFormat'

describe('euroText', () => {
  it('shows whole euros without decimals and others with a comma', () => {
    expect(euroText(3500)).toBe('35 €')
    expect(euroText(0)).toBe('0 €')
    expect(euroText(3550)).toBe('35,50 €')
    expect(euroText(4505)).toBe('45,05 €')
  })
})

describe('memberPriceText', () => {
  it('builds the text from the real prices', () => {
    expect(memberPriceText(3500, 4500)).toBe('35 € für Mitglieder, 45 € sonst – geprüft bei der Buchung')
    expect(memberPriceText(2500, 3000)).toBe('25 € für Mitglieder, 30 € sonst – geprüft bei der Buchung')
    expect(memberPriceText(3550, 4500)).toBe('35,50 € für Mitglieder, 45 € sonst – geprüft bei der Buchung')
  })

  it('shows only the price when both prices are equal (no membership hint)', () => {
    expect(memberPriceText(4000, 4000)).toBe('40 €')
  })
})

describe('formatSessionDateTime', () => {
  it('uses the Berlin local date and time as delivered, with weekday', () => {
    expect(formatSessionDateTime('2026-11-12', '16:00')).toBe('Do., 12. Nov. 2026, 16:00 Uhr')
    expect(formatSessionDateTime('2026-03-29', '18:30')).toBe('So., 29. März 2026, 18:30 Uhr')
  })

  it('drops seconds from a HH:MM:SS time', () => {
    expect(formatSessionDateTime('2026-11-12', '16:00:00')).toBe('Do., 12. Nov. 2026, 16:00 Uhr')
  })
})

describe('sessionAvailability', () => {
  it('marks full sessions as ausgebucht and not bookable', () => {
    expect(sessionAvailability({ capacity: 1, free_spots: 0 })).toEqual({ bookable: false, label: 'ausgebucht' })
  })

  it('treats negative free spots as full', () => {
    expect(sessionAvailability({ capacity: 4, free_spots: -1 }).bookable).toBe(false)
  })

  it('labels a free single slot and group spots', () => {
    expect(sessionAvailability({ capacity: 1, free_spots: 1 })).toEqual({ bookable: true, label: 'Platz frei' })
    expect(sessionAvailability({ capacity: 6, free_spots: 1 })).toEqual({ bookable: true, label: '1 Platz frei' })
    expect(sessionAvailability({ capacity: 6, free_spots: 4 })).toEqual({ bookable: true, label: '4 Plätze frei' })
  })
})

describe('bookingPriceText', () => {
  it('formats exactly the server price', () => {
    expect(bookingPriceText({ applied_price_cents: 3500 })).toBe('35,00 €')
    expect(bookingPriceText({ applied_price_cents: 0 })).toBe('0,00 €')
  })

  it('never computes a price when the server did not send one', () => {
    expect(bookingPriceText({})).toBeNull()
    expect(bookingPriceText({ applied_price_cents: null })).toBeNull()
  })
})

describe('trainingConflictKind', () => {
  it('reads the stable detail.code of the backend', () => {
    expect(trainingConflictKind({ code: 'training_session_full', message: 'x' })).toBe('full')
    expect(trainingConflictKind({ code: 'training_session_past', message: 'x' })).toBe('past')
    expect(trainingConflictKind({ code: 'registration_duplicate', message: 'x' })).toBe('duplicate')
  })

  it('falls back to a generic conflict and never parses text', () => {
    expect(trainingConflictKind('Dieser Trainingstermin ist leider bereits belegt.')).toBe('unknown')
    expect(trainingConflictKind({ code: 'something_new' })).toBe('unknown')
    expect(trainingConflictKind(undefined)).toBe('unknown')
  })
})

describe('trainingSubmitErrorMessage', () => {
  it('gives friendly German texts per outcome', () => {
    expect(trainingSubmitErrorMessage(409, 'full')).toContain('gerade vergeben')
    expect(trainingSubmitErrorMessage(409, 'past')).toContain('nicht mehr buchbar')
    expect(trainingSubmitErrorMessage(409, 'duplicate')).toContain('bereits eine Buchung')
    expect(trainingSubmitErrorMessage(409, 'unknown')).toContain('nicht abgeschlossen werden')
    expect(trainingSubmitErrorMessage(404)).toContain('nicht mehr verfügbar')
    expect(trainingSubmitErrorMessage(0)).toContain('Verbindung')
    expect(trainingSubmitErrorMessage(429)).toContain('zu viele')
  })
})

const session = (slug: string, free: number, extra = {}) => ({
  slug, starts_at: '2026-11-12T15:00:00Z', ends_at: '2026-11-12T15:30:00Z', local_date: '2026-11-12', local_time: '16:00',
  capacity: 1, free_spots: free, price_member_cents: 3500, price_nonmember_cents: 4500, age_min: 6, age_max: 14, ...extra,
})
const offer = {
  slug: 'einzel-30', title: 'Einzeltraining 30 Min', kind: 'einzel' as const, description: null, duration_minutes: 30,
  location: 'Sportplatz', price_member_cents: 3500, price_nonmember_cents: 4500,
}

describe('findBookableSession', () => {
  const sessions = [session('a', 0), session('b', 1)]

  it('returns a session only while it is bookable', () => {
    expect(findBookableSession(sessions, 'b')?.slug).toBe('b')
    expect(findBookableSession(sessions, 'a')).toBeNull()
    expect(findBookableSession(sessions, 'gone')).toBeNull()
    expect(findBookableSession(sessions, null)).toBeNull()
  })
})

describe('sessionAsCamp', () => {
  it('maps offer and session onto the form model without any usable price', () => {
    const camp = sessionAsCamp(offer, session('b', 1))
    expect(camp).toMatchObject({
      slug: 'b', title: 'Einzeltraining 30 Min', start_date: '2026-11-12', end_date: '2026-11-12',
      age_min: 6, age_max: 14, location: 'Sportplatz', registration_open: true, is_full: false, price_cents: 0,
    })
  })
})

describe('fromPriceText / uniformSessionPriceText', () => {
  it('builds an "ab" price from the lowest session prices and nothing without sessions', async () => {
    const { fromPriceText } = await import('./trainingFormat')
    expect(fromPriceText(3500, 4500)).toBe('ab 35 € für Mitglieder, ab 45 € sonst – geprüft bei der Buchung')
    expect(fromPriceText(4000, 4000)).toBe('ab 40 €')
    expect(fromPriceText(null, null)).toBeNull()
  })

  it('returns a shared session price only when all sessions agree', async () => {
    const { uniformSessionPriceText } = await import('./trainingFormat')
    const a = { price_member_cents: 3500, price_nonmember_cents: 4500 }
    expect(uniformSessionPriceText([a, { ...a }])).toBe('35 € für Mitglieder, 45 € sonst – geprüft bei der Buchung')
    expect(uniformSessionPriceText([a, { ...a, price_nonmember_cents: 4000 }])).toBeNull()
    expect(uniformSessionPriceText([])).toBeNull()
  })
})
