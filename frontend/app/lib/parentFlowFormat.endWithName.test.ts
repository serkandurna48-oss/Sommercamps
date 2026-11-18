import { expect, it } from 'vitest'
import { endWithName } from './parentFlowFormat'

it('ends a sentence after a club name without a double period', () => {
  expect(endWithName('JK Performance Academy')).toBe('JK Performance Academy.')
  expect(endWithName('SV Musterstadt 1910 e. V.')).toBe('SV Musterstadt 1910 e. V.')
})
