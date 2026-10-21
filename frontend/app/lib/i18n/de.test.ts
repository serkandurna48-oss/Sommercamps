import { describe, expect, it } from 'vitest'
import { berlinDay, formatDate, formatDateRange, formatDateTime, formatRelativeDateTime } from './de'

describe('German admin dates', () => {
  it.each([
    ['2027-10-25', '2027-10-29', '25.–29. Okt. 2027'],
    ['2027-10-28', '2027-11-02', '28. Okt.–2. Nov. 2027'],
    ['2027-12-28', '2028-01-02', '28. Dez. 2027–2. Jan. 2028'],
    ['2027-02-17', '2027-02-17', '17. Feb. 2027'],
  ])('formats %s to %s', (start, end, expected) => expect(formatDateRange(start, end)).toBe(expected))

  it.each(['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'])('uses the agreed month abbreviation %s', month => {
    const index = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'].indexOf(month) + 1
    const prefix = `2027-${String(index).padStart(2, '0')}`
    expect(formatDateRange(`${prefix}-01`, `${prefix}-02`)).toBe(`1.–2. ${month} 2027`)
  })

  it('formats single dates and timestamps in Berlin including midnight and DST', () => {
    expect(formatDate('2027-02-17')).toBe('17.02.2027')
    expect(formatDateTime('2027-02-17T10:00:00Z')).toBe('17.02.2027, 11:00')
    expect(formatDateTime('2027-07-17T10:00:00Z')).toBe('17.07.2027, 12:00')
    expect(formatDate('2027-02-16T23:30:00Z')).toBe('17.02.2027')
    expect(berlinDay(new Date('2027-02-16T23:30:00Z'))).toBe('2027-02-17')
    expect(formatDate('invalid')).toBe('Unbekannt')
    expect(formatDateTime('invalid')).toBe('Unbekannt')
  })

  it('keeps relative wording inside the formatter and falls back to an absolute date', () => {
    const now = new Date('2027-02-17T12:00:00Z')
    expect(formatRelativeDateTime('2027-02-17T05:38:00Z', now)).toBe('heute, 06:38')
    expect(formatRelativeDateTime('2027-02-16T05:38:00Z', now)).toBe('16.02.2027, 06:38')
  })
})
