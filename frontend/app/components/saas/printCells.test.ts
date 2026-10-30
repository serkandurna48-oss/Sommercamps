import { expect, it } from 'vitest'
import { participantPrintFields } from './participantPrint'

// Trainer handout: safety fields are marked, short fields get narrow columns.
it('Allergien und medizinische Hinweise sind hervorgehoben, kurze Felder schmal', () => {
  const fields = Object.fromEntries(participantPrintFields().map(f => [f.id, f]))
  expect(fields.allergies.alert).toBe(true)
  expect(fields.medical.alert).toBe(true)
  expect(fields.name.alert).toBeUndefined()
  expect(fields.year.size).toBe('s')
  expect(fields.jersey.size).toBe('s')
  expect(fields.name.size).toBe('l')
})
