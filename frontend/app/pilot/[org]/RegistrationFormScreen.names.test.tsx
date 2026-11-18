// Finding 1 (18.11.2026): markup was accepted as a child's name.
// The same rule lives in backend_saas/app/name_validation.py; the name lists
// here and in backend_saas/tests/test_name_validation.py are kept alike.
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/saasApi', () => ({ submitRegistration: vi.fn() }))

import { validateForm } from './RegistrationFormScreen'

type Form = Parameters<typeof validateForm>[0]

function form(overrides: Partial<Form>): Form {
  return {
    childFirstName: 'Mia', childLastName: 'Muster', childBirthDate: '01.01.2018',
    parentName: 'Eva Muster', parentEmail: 'eva@example.de', parentPhone: '12345', emergencyPhone: '67890',
    allergies: '', healthDataConsent: false, termsAccepted: true, privacyAccepted: true,
    billingStreet: '', billingPostalCode: '', billingCity: '',
    ...overrides,
  } as Form
}

const TEXT_MSG = 'Bitte verwenden Sie keine Zeichen wie < > oder = und keine Zeilenumbrüche.'
const ATTACKS = ['<script>alert(1)</script>', '<b>Mia</b>', '=HYPERLINK("http://x","y")', 'Mia =1+1', 'Mia\nMuster', 'Mia\tMuster',
  'Mia Muster', '‮aiM', 'Mia⁦x', 'Mia\u0085Muster']
const REAL = ['Mia', 'Anne-Marie', "O'Brien", 'D’Angelo', 'Müller-Lüdenscheidt', 'Nguyễn', 'Zoë', 'José María', 'Łukasz',
  'Αλέξανδρος', 'Дмитрий', 'محمد', '李', 'St. Clair', 'علی‌رضا',
  'Anne‐Marie', 'Anne‑Marie', 'Anne–Marie', 'בן־דוד', 'O‘Brien', 'D´Angelo', 'O`Brien', "'t Hooft",
  'Jean Pierre', 'Jean Pierre', '李　明', 'محمد‏', 'Max­',
  'Max (Maxi)', 'Max "Maxi"', 'Mohammed/Muhammed', 'Müller, Max', 'Max & Moritz', 'Paul·la', 'ジョン・スミス', 'Max jun.', 'Mª José']

describe('child name rule', () => {
  it.each(REAL)('accepts %s', (name) => {
    const bad = validateForm(form({ childFirstName: name, childLastName: name }))
    expect(bad.childFirstName).toBeUndefined()
    expect(bad.childLastName).toBeUndefined()
  })

  it.each(ATTACKS)('rejects %j', (name) => {
    const bad = validateForm(form({ childFirstName: name, childLastName: name }))
    expect(bad.childFirstName).toBe(TEXT_MSG)
    expect(bad.childLastName).toBe(TEXT_MSG)
  })

  it('needs a letter and limits the length', () => {
    expect(validateForm(form({ childFirstName: '123' })).childFirstName).toBe('Bitte geben Sie einen Namen mit Buchstaben an.')
    expect(validateForm(form({ childFirstName: 'a'.repeat(81) })).childFirstName).toBe('Bitte höchstens 80 Zeichen.')
    expect(validateForm(form({ childFirstName: 'a'.repeat(80) })).childFirstName).toBeUndefined()
  })
})

describe('parent name rule', () => {
  it.each(['Anna & Peter Müller', 'Oma (Erna) Schmidt', 'Dr. Eva Muster', 'Muster, Eva', "Eva Muster-O'Neil", 'Eva "Evi" Muster', 'Eva und Tom Muster'])('accepts %s', (name) => {
    expect(validateForm(form({ parentName: name })).parentName).toBeUndefined()
  })

  it.each(['Eva <script>', 'Eva =1+1', 'Eva\tMuster x', 'Eva Muster x'])('rejects %j', (name) => {
    expect(validateForm(form({ parentName: name })).parentName).toBe(TEXT_MSG)
  })

  it('catches what the server would refuse per name part', () => {
    // The server gets first word and rest separately and checks each.
    expect(validateForm(form({ parentName: 'Eva ❤' })).parentName).toBe('Bitte geben Sie einen Namen mit Buchstaben an.')
    expect(validateForm(form({ parentName: `Eva ${'a'.repeat(81)}` })).parentName).toBe('Bitte höchstens 80 Zeichen.')
  })
})
