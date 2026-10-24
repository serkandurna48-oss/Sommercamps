import { describe, expect, it } from 'vitest'
import { buildCampIcs, type CampCalendarInput } from './ics'

const now = new Date('2026-10-24T12:34:56.789Z')
const input: CampCalendarInput = {
  campId: 'verein/sommer', registrationToken: 'anmeldung-123',
  title: 'Sommercamp', clubName: 'Testverein',
  ranges: [{ start_date: '2027-07-05', end_date: '2027-07-09' }],
}
const unfold = (value: string) => value.replace(/\r\n /g, '')

describe('Camp-Kalender', () => {
  it('schreibt VCALENDAR 2.0 mit Ganztagstermin und UTC-Zeitstempel', () => {
    const ics = unfold(buildCampIcs(input, now))
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//CampsPilot//DE\r\n')
    expect(ics).toContain('DTSTAMP:20261024T123456Z\r\n')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270705\r\n')
    expect(ics).toContain('DTEND;VALUE=DATE:20270710\r\n')
    expect(ics).toContain('SUMMARY:Sommercamp – Testverein\r\n')
    expect(ics).toContain('END:VEVENT\r\nEND:VCALENDAR\r\n')
    expect(ics).not.toContain('LOCATION:')
    expect(ics).not.toContain('DESCRIPTION:')
  })

  it.each([
    ['2027-07-31', '20270801'],
    ['2027-12-31', '20280101'],
    ['2028-02-28', '20280229'],
    ['2028-02-29', '20280301'],
    ['2027-03-28', '20270329'],
  ])('setzt das exklusive Ende für %s auf %s', (end, expected) => {
    const ics = buildCampIcs({ ...input, ranges: [{ start_date: end, end_date: end }] }, now)
    expect(ics).toContain(`DTEND;VALUE=DATE:${expected}\r\n`)
  })

  it('maskiert Backslash, Komma, Semikolon und alle Zeilenumbrüche in Textfeldern', () => {
    const value = 'A\\B,C;D\r\nE\nF\rG'
    const escaped = 'A\\\\B\\,C\\;D\\nE\\nF\\nG'
    const ics = unfold(buildCampIcs({ ...input, title: value, clubName: value, location: value, careInfo: value }, now))
    expect(ics).toContain(`SUMMARY:${escaped} – ${escaped}\r\n`)
    expect(ics).toContain(`LOCATION:${escaped}\r\n`)
    expect(ics).toContain(`DESCRIPTION:Betreuungszeiten: ${escaped}\r\n`)
  })

  it.each(['a'.repeat(200), 'ä⚽😀'.repeat(70)])('faltet lange Zusammenfassungen bei höchstens 75 UTF-8-Oktetten', title => {
    const ics = buildCampIcs({ ...input, title }, now)
    expect(ics).toContain('\r\n ')
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    expect(unfold(ics)).toContain(`SUMMARY:${title} – Testverein\r\n`)
    expect(ics).not.toContain('\uFFFD')
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/)
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('erzeugt pro Zeitraum einen Termin mit stabiler und eigener UID', () => {
    const data = { ...input, ranges: [...input.ranges, { start_date: '2027-08-02', end_date: '2027-08-06' }] }
    const uids = (ics: string) => unfold(ics).match(/^UID:.*$/gm)
    const first = buildCampIcs(data, now)
    expect(first.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(new Set(uids(first)).size).toBe(2)
    expect(uids(first)).toEqual(uids(buildCampIcs(data, new Date('2026-11-01T00:00:00Z'))))
    expect(uids(first)).toEqual(uids(buildCampIcs({ ...data, ranges: data.ranges.map(range => ({ ...range, end_date: '2027-08-10' })) }, now)))
    expect(uids(first)).not.toEqual(uids(buildCampIcs({ ...data, registrationToken: 'anderes-token' }, now)))
    expect(uids(first)).not.toEqual(uids(buildCampIcs({ ...data, campId: 'anderes-camp' }, now)))
  })

  it('übernimmt keine zusätzlichen Personen- oder Zahlungsdaten', () => {
    const data = { ...input, childName: 'Mia Muster', parentName: 'Eva Muster', parentEmail: 'eva@example.de', payment_reference: 'CP-GEHEIM' }
    const ics = unfold(buildCampIcs(data, now))
    for (const value of [data.childName, data.parentName, data.parentEmail, data.payment_reference]) expect(ics).not.toContain(value)
    expect(ics).not.toMatch(/ATTENDEE|ORGANIZER|MAILTO/i)
  })
})
