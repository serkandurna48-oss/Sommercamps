import type { RegistrationQuestion } from '../../../lib/saasApi'

// Templates are opt-in configuration data. No organization receives questions automatically.
export const REGISTRATION_QUESTION_TEMPLATES: Record<string, { label: string; questions: RegistrationQuestion[] }> = {
  'ksv-baunatal': {
    label: 'Fußballschule: Position und Herkunftsverein',
    questions: [
      { key: 'position', label: 'Position', type: 'choice', options: ['Feldspieler', 'Torwart'], other_label: null, required: true },
      { key: 'verein', label: 'Herkunftsverein', type: 'choice', options: ['KSV Baunatal', 'Kein Verein'], other_label: 'Anderer Verein', required: false },
    ],
  },
}

export function registrationQuestionTemplate(orgSlug: string): RegistrationQuestion[] | null {
  if (!Object.prototype.hasOwnProperty.call(REGISTRATION_QUESTION_TEMPLATES, orgSlug)) return null
  const template = REGISTRATION_QUESTION_TEMPLATES[orgSlug]
  return template ? template.questions.map(question => ({ ...question, options: question.options ? [...question.options] : null })) : null
}
