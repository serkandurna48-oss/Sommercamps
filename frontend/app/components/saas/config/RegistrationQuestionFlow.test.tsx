// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import RegistrationQuestionsBuilder from './RegistrationQuestionsBuilder'
import ExtraQuestions from '../../../pilot/[org]/ExtraQuestions'
import { participantPrintFields, selectedPrintColumns } from '../participantPrint'
import { toCsv } from '../../../lib/exportCsv'
import { registrations } from '../../../dev/admin-vorschau/fixtures'
import type { RegistrationQuestion } from '../../../lib/saasAdminApi'

it('takes a selected KSV template through the parent form, saved answers and chosen export columns', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(() => root.render(<form><RegistrationQuestionsBuilder value={[]} theme="tradition" orgSlug="ksv-baunatal" /></form>))
    await act(() => [...container.querySelectorAll('button')].find(button => button.textContent === 'Vorlage übernehmen')!.click())
    const questions = JSON.parse(String(new FormData(container.querySelector('form')!).get('registration_questions'))) as RegistrationQuestion[]
    expect(questions.map(question => question.key)).toEqual(['position', 'verein'])
    expect(questions[1].required).toBe(false)
    expect(questions[1].options).toContain('Kein Verein')

    let answers: Record<string, string> = {}
    function ParentForm() {
      const [current, setCurrent] = useState<Record<string, string>>({})
      answers = current
      return <ExtraQuestions questions={questions} answers={current} submitAttempted={false}
        onChange={(key, value) => setCurrent(previous => ({ ...previous, [key]: value }))} />
    }
    await act(() => root.render(<ParentForm />))
    await act(() => container.querySelector<HTMLInputElement>('input[value="Torwart"]')!.click())
    await act(() => container.querySelector<HTMLInputElement>('input[value="Kein Verein"]')!.click())
    expect(answers.verein).toBe('Kein Verein')
    await act(() => container.querySelector<HTMLInputElement>('#extra-verein-other')!.click())
    await act(() => {
      const input = container.querySelector<HTMLInputElement>('[data-testid="extra-other-verein"]')!
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'FC Teststadt')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(answers).toEqual({ position: 'Torwart', verein: 'FC Teststadt' })

    const fields = participantPrintFields(questions)
    const columns = selectedPrintColumns(fields, ['name', 'extra:position', 'extra:verein'], { start_date: '2027-01-04', end_date: '2027-01-07' })
    const row = { ...registrations[0], extra_answers: answers }
    expect(columns.map(column => column.value(row))).toEqual([`${row.child_first_name} ${row.child_last_name}`, 'Torwart', 'FC Teststadt'])
    expect(toCsv([row], columns)).toContain('Torwart;FC Teststadt')
  } finally {
    await act(() => root.unmount())
    container.remove()
  }
})
