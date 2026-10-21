import { expect, it } from 'vitest'
import { formatCampDateRange } from './parentFlowFormat'

it.each([
  ['2027-10-25', '2027-10-29', '25.–29. Okt. 2027'],
  ['2027-10-25', '2027-10-25', '25. Okt. 2027'],
  ['2027-10-30', '2027-11-02', '30. Okt.–2. Nov. 2027'],
  ['2027-12-30', '2028-01-02', '30. Dez. 2027–2. Jan. 2028'],
])('formats %s to %s', (start, end, expected) => {
  expect(formatCampDateRange(start, end)).toBe(expected)
})
