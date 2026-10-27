import type { RegistrationQuestion } from '../../../lib/saasApi'

export const MAX_QUESTIONS = 5
const FIELDS = new Set(['key', 'label', 'type', 'required', 'options', 'other_label'])
type Result = { questions: RegistrationQuestion[]; error: null } | { questions: null; error: string }

/** Read the existing API shape, including defaults used by older records.
 * Never silently drop unrecognised data: the editor must preserve it until reset. */
export function readRegistrationQuestions(value: unknown): Result {
  if (typeof value === 'string') {
    try { value = JSON.parse(value.trim() || '[]') }
    catch { return { questions: null, error: 'Zusatzfelder konnten nicht gelesen werden.' } }
  }
  if (value == null) value = []
  if (!Array.isArray(value)) return { questions: null, error: 'Zusatzfelder müssen als Liste vorliegen.' }
  if (value.length > MAX_QUESTIONS) return { questions: null, error: 'Es sind höchstens 5 Zusatzfelder möglich.' }
  const questions: RegistrationQuestion[] = []
  const keys = new Set<string>()
  for (const [index, item] of value.entries()) {
    const fail = (message: string): Result => ({ questions: null, error: `Feld ${index + 1}: ${message}` })
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail('Die gespeicherten Angaben sind ungültig.')
    if (Object.keys(item).some(key => !FIELDS.has(key))) return fail('Diese Feldkonfiguration wird noch nicht unterstützt.')
    if (typeof item.key !== 'string' || !/^[a-z][a-z0-9_]{0,29}$/.test(item.key) || keys.has(item.key)) {
      return fail('Die Feldkennung ist ungültig oder doppelt vergeben.')
    }
    if (typeof item.label !== 'string' || !item.label.trim() || item.label.trim().length > 100) {
      return fail('Bitte eine Beschriftung mit 1 bis 100 Zeichen eingeben.')
    }
    if (item.type !== 'text' && item.type !== 'choice') return fail('Dieser Feldtyp wird nicht unterstützt.')
    if (item.required !== undefined && typeof item.required !== 'boolean') return fail('Die Pflichtfeld-Angabe ist ungültig.')
    if (item.other_label != null && typeof item.other_label !== 'string') return fail('Die Freitext-Beschriftung ist ungültig.')
    if (item.options != null && (!Array.isArray(item.options) || item.options.some((option: unknown) => typeof option !== 'string'))) {
      return fail('Die Auswahlmöglichkeiten sind ungültig.')
    }
    if (item.type === 'choice') {
      if (!item.options?.length || item.options.length > 20) return fail('Bitte 1 bis 20 Auswahlmöglichkeiten eingeben.')
      // The backend trims options and accepts answers of at most 80 characters.
      const options = item.options.map((option: string) => option.trim())
      if (options.some((option: string) => option.length > 80)) return fail('Auswahlmöglichkeiten dürfen höchstens 80 Zeichen lang sein.')
      if (options.some((option: string) => !option) || new Set(options).size !== options.length) {
        return fail('Auswahlmöglichkeiten dürfen nicht leer oder doppelt sein.')
      }
    }
    keys.add(item.key)
    questions.push({ key: item.key, label: item.label, type: item.type, required: item.required ?? true,
      options: item.options ?? null, other_label: item.other_label?.trim() || null })
  }
  return { questions, error: null }
}

export function newRegistrationQuestion(): RegistrationQuestion {
  return { key: `q_${crypto.randomUUID().replaceAll('-', '').slice(0, 28)}`, label: '', type: 'text',
    required: false, options: null, other_label: null }
}

export function moveQuestion(questions: RegistrationQuestion[], index: number, direction: -1 | 1): RegistrationQuestion[] {
  const destination = index + direction
  if (index < 0 || index >= questions.length || destination < 0 || destination >= questions.length) return questions
  const result = [...questions]
  ;[result[index], result[destination]] = [result[destination], result[index]]
  return result
}
