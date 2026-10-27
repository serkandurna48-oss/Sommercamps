'use client'

import { useId, useState } from 'react'
import type { RegistrationQuestion } from '../../../lib/saasApi'
import ExtraQuestions from '../../../pilot/[org]/ExtraQuestions'
import { previewTheme } from '../brand/BrandPreview'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { MAX_QUESTIONS, moveQuestion, newRegistrationQuestion, readRegistrationQuestions } from './registrationQuestions'
import { REGISTRATION_QUESTION_TEMPLATES, registrationQuestionTemplate } from './registrationQuestionTemplates'

export default function RegistrationQuestionsBuilder({ value, theme, orgSlug, disabled = false }: {
  value: unknown
  theme: string
  orgSlug?: string
  disabled?: boolean
}) {
  const id = useId()
  const [source, setSource] = useState(value)
  const [loaded, setLoaded] = useState(() => readRegistrationQuestions(value))
  const [questions, setQuestions] = useState(() => loaded.questions ?? [])
  const [notice, setNotice] = useState('')
  if (value !== source) {
    const next = readRegistrationQuestions(value)
    setSource(value)
    setLoaded(next)
    setQuestions(next.questions ?? [])
    setNotice('')
  }
  const validation = readRegistrationQuestions(questions)
  const template = orgSlug && Object.prototype.hasOwnProperty.call(REGISTRATION_QUESTION_TEMPLATES, orgSlug)
    ? REGISTRATION_QUESTION_TEMPLATES[orgSlug] : null
  const update = (index: number, patch: Partial<RegistrationQuestion>) => {
    setQuestions(current => current.map((question, i) => i === index ? { ...question, ...patch } : question))
  }

  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-4" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="cp-heading" style={{ color: 'var(--cp-ink)' }}>Zusatzfelder bei der Anmeldung</h3>
      <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        Bis zu 5 Felder für alle Camps dieses Vereins. Änderungen werden mit den Vereinseinstellungen gespeichert.
      </p>
      {loaded.error ? (
        <>
          <p role="alert" className="cp-body" style={{ color: 'var(--cp-error)' }}>
            Die gespeicherten Zusatzfelder können nicht bearbeitet werden. {loaded.error} Beim Speichern bleiben sie unverändert.
          </p>
          <Button type="button" onClick={() => { setLoaded({ questions: [], error: null }); setQuestions([]) }}>
            Zusatzfelder verwerfen und neu einrichten
          </Button>
          <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Erst beim Speichern wird die bisherige Konfiguration ersetzt.</p>
        </>
      ) : (
        <>
          <input type="hidden" name="registration_questions" value={JSON.stringify(questions)} />
          {questions.length === 0 && <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>Noch keine Zusatzfelder eingerichtet.</p>}
          {questions.length === 0 && template && (
            <div className="flex flex-wrap items-end gap-3">
              <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Vorlage: {template.label}. Sie können danach alle Felder anpassen.</p>
              <Button type="button" onClick={() => { setQuestions(registrationQuestionTemplate(orgSlug!) ?? []); setNotice('Vorlage übernommen. Bitte vor dem Speichern prüfen.') }}>Vorlage übernehmen</Button>
            </div>
          )}
          {questions.map((question, index) => {
            const prefix = `${id}-${question.key}`
            return (
              <fieldset key={question.key} className="flex min-w-0 flex-col gap-4 rounded-[var(--cp-r-card)] border p-4" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
                <legend className="cp-label" style={{ color: 'var(--cp-ink)' }}>Feld {index + 1}</legend>
                <Field label="Beschriftung" htmlFor={`${prefix}-label`}>
                  <input id={`${prefix}-label`} required maxLength={100} pattern={'[\\s\\S]*\\S[\\s\\S]*'} value={question.label} onChange={event => update(index, { label: event.target.value })} className={INPUT_CLASS} style={INPUT_STYLE} />
                </Field>
                <Field label="Feldtyp" htmlFor={`${prefix}-type`}>
                  <select id={`${prefix}-type`} value={question.type} onChange={event => update(index, { type: event.target.value as RegistrationQuestion['type'] })} className={INPUT_CLASS} style={INPUT_STYLE}>
                    <option value="text">Kurzer Text</option>
                    <option value="choice">Auswahl (eine Antwort)</option>
                  </select>
                </Field>
                <label className="cp-label flex min-h-[44px] items-center gap-3" style={{ color: 'var(--cp-ink)' }}>
                  <input type="checkbox" checked={question.required} onChange={event => update(index, { required: event.target.checked })} style={{ accentColor: 'var(--cp-ink)' }} /> Pflichtfeld
                </label>
                {question.type === 'choice' && (
                  <>
                    <Field label="Auswahlmöglichkeiten" htmlFor={`${prefix}-options`} hint="Eine Möglichkeit pro Zeile, höchstens 20 mit je maximal 80 Zeichen.">
                      <textarea id={`${prefix}-options`} rows={3} required value={(question.options ?? []).join('\n')} onChange={event => update(index, { options: event.target.value.split('\n') })} className={INPUT_CLASS} style={INPUT_STYLE} />
                    </Field>
                    <Field label="Freitext-Alternative (optional)" htmlFor={`${prefix}-other`} hint="Mit einer Beschriftung erlauben Sie zusätzlich eine eigene Antwort. Leer lassen, um nur die Auswahl anzubieten.">
                      <input id={`${prefix}-other`} value={question.other_label ?? ''} onChange={event => update(index, { other_label: event.target.value.trim() ? event.target.value : null })} className={INPUT_CLASS} style={INPUT_STYLE} />
                    </Field>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={index === 0} aria-label={`Feld ${index + 1} nach oben`} onClick={() => { setQuestions(moveQuestion(questions, index, -1)); setNotice(`Feld nach Position ${index} verschoben.`) }}>Hoch</Button>
                  <Button type="button" disabled={index === questions.length - 1} aria-label={`Feld ${index + 1} nach unten`} onClick={() => { setQuestions(moveQuestion(questions, index, 1)); setNotice(`Feld nach Position ${index + 2} verschoben.`) }}>Runter</Button>
                  <Button type="button" variant="danger" aria-label={`Feld ${index + 1} entfernen`} onClick={() => { setQuestions(questions.filter((_, i) => i !== index)); setNotice('Feld entfernt.') }}>Entfernen</Button>
                </div>
              </fieldset>
            )
          })}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { setQuestions([...questions, newRegistrationQuestion()]); setNotice('Neues Feld hinzugefügt. Bitte die Beschriftung eingeben.') }}>Feld hinzufügen</Button>
            <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>{questions.length} von {MAX_QUESTIONS} Feldern</span>
          </div>
          <p className="sr-only" aria-live="polite">{notice}</p>
          {validation.error && <p role="alert" className="cp-chip" style={{ color: 'var(--cp-error)' }}>{validation.error}</p>}
          <div className="flex min-w-0 flex-col gap-3">
            <h4 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Vorschau für Eltern</h4>
            <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>So erscheinen die Felder im Anmeldeformular. Die Vorschau ist nicht ausfüllbar. * kennzeichnet Pflichtfelder.</p>
            {questions.length ? (
              <fieldset disabled aria-label="Vorschau der Zusatzfelder" className="cp-public min-w-0 rounded-[var(--cp-r-card)] border p-4" data-theme={previewTheme(theme)} style={{ borderColor: 'var(--line)', background: 'var(--surface)', paddingBottom: 'var(--state-gap)', overflowWrap: 'anywhere' }}>
                <div id="s-form">
                  <ExtraQuestions questions={questions.map(question => ({ ...question, label: question.label || 'Beschriftung fehlt' }))} answers={{}} submitAttempted={false} onChange={() => {}} />
                </div>
              </fieldset>
            ) : <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>Das Elternformular enthält keine Zusatzfelder.</p>}
          </div>
        </>
      )}
    </fieldset>
  )
}
