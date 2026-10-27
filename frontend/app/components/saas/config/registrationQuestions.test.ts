import { describe, expect, it } from 'vitest'
import { moveQuestion, newRegistrationQuestion, readRegistrationQuestions } from './registrationQuestions'

const text = { key: 'hinweis', label: 'Hinweis', type: 'text', required: false, options: null, other_label: null }
const choice = { key: 'auswahl', label: 'Auswahl', type: 'choice', required: true, options: ['A', 'B'], other_label: 'Weitere Antwort' }

describe('existing registration_questions contract', () => {
  it('round-trips stored JSON, stable keys, order, options and optional free text', () => {
    expect(readRegistrationQuestions(JSON.stringify([choice, text]))).toEqual({ questions: [choice, text], error: null })
  })
  it('uses the backend defaults for legacy records', () => {
    expect(readRegistrationQuestions([{ key: 'alt', label: 'Alt', type: 'text' }]).questions).toEqual([
      { key: 'alt', label: 'Alt', type: 'text', required: true, options: null, other_label: null },
    ])
    for (const value of [null, undefined, '', ' ', '[]']) expect(readRegistrationQuestions(value).questions).toEqual([])
  })
  it('disables blank free-text alternatives and accepts the maximum answer length', () => {
    const result = readRegistrationQuestions([{ ...choice, other_label: '   ', options: ['x'.repeat(80)] }])
    expect(result.error).toBeNull()
    expect(result.questions![0].other_label).toBeNull()
  })
  it.each([
    '{', '{}', 'false', [null], [3], [{ ...text, type: 'date' }], [{ ...text, label: '  ' }],
    [{ ...text, label: 'x'.repeat(101) }], [{ ...text, key: 'bad key' }], [text, text],
    [{ ...text, required: 'false' }], [{ ...choice, options: 'A' }], [{ ...choice, options: [] }],
    [{ ...choice, options: ['A', null] }], [{ ...choice, options: ['A', 'A'] }], [{ ...choice, options: [' '] }],
    [{ ...choice, options: ['A', ' A '] }], [{ ...choice, options: ['x'.repeat(81)] }],
    [{ ...choice, options: Array.from({ length: 21 }, (_, i) => String(i)) }], [{ ...choice, other_label: {} }],
    [{ ...text, unknown: true }], Array.from({ length: 6 }, (_, i) => ({ ...text, key: `q${i}` })),
  ])('rejects malformed data without throwing: %j', value => {
    const result = readRegistrationQuestions(value)
    expect(result.error).toBeTruthy()
    expect(result.questions).toBeNull()
  })
  it('moves fields without mutating identifiers, content or the original list', () => {
    const questions = readRegistrationQuestions([text, choice]).questions!
    expect(moveQuestion(questions, 1, -1)).toEqual([choice, text])
    expect(moveQuestion(questions, 0, 1)).toEqual([choice, text])
    expect(questions).toEqual([text, choice])
    expect(moveQuestion(questions, 0, -1)).toBe(questions)
    expect(moveQuestion(questions, 1, 1)).toBe(questions)
  })
  it('generates independent contract-compatible keys, including after removing a field', () => {
    const first = newRegistrationQuestion()
    const second = newRegistrationQuestion()
    expect(first.key).not.toBe(second.key)
    expect(first.key).toMatch(/^[a-z][a-z0-9_]{0,29}$/)
    expect(readRegistrationQuestions([{ ...first, label: 'Neues Feld' }]).error).toBeNull()
  })
})
