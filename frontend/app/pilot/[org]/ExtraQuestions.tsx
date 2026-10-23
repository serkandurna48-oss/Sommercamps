'use client'

import { useState } from 'react'
import type { RegistrationQuestion } from '../../lib/saasApi'

interface ExtraQuestionsProps {
  questions: RegistrationQuestion[]
  answers: Record<string, string>
  submitAttempted: boolean
  onChange: (key: string, value: string) => void
}

export default function ExtraQuestions({ questions, answers, submitAttempted, onChange }: ExtraQuestionsProps) {
  if (!questions.length) return null

  return (
    <section className="fsec">
      <div className="fsec-head">
        <span className="sec-label">Weitere Angaben</span>
        <h2 className="d3">Angaben zum Fußball</h2>
      </div>
      <div className="f">
        {questions.map((q) => (
          <ExtraQuestion
            key={q.key}
            question={q}
            value={answers[q.key] ?? ''}
            submitAttempted={submitAttempted}
            onChange={(val) => onChange(q.key, val)}
          />
        ))}
      </div>
    </section>
  )
}

function ExtraQuestion({
  question,
  value,
  submitAttempted,
  onChange,
}: {
  question: RegistrationQuestion
  value: string
  submitAttempted: boolean
  onChange: (val: string) => void
}) {
  // Local state: tracks whether the "Sonstiges" radio is selected.
  // Initialized from value: if value is not empty and not in options, "other" was previously selected.
  const options = question.options ?? []
  const isOtherPreselected = question.type === 'choice' && question.other_label !== null
    && value !== '' && !options.includes(value)
  const [showOtherText, setShowOtherText] = useState(isOtherPreselected)

  const errorId = `err-extra-${question.key}`
  const showError = submitAttempted && question.required && !value.trim()

  if (question.type === 'text') {
    return (
      <label className={`field${showError ? ' bad' : ''}`}>
        <span className="t-lab">{question.label}{question.required ? ' *' : ''}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={80}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
        />
        {showError && (
          <span className="err">
            <span id={errorId}>Bitte geben Sie eine Antwort ein.</span>
          </span>
        )}
      </label>
    )
  }

  // choice type
  const hasOtherOption = question.other_label !== null
  const selectedIsOther = hasOtherOption && value !== '' && !options.includes(value)

  return (
    <fieldset className={`field${showError ? ' bad' : ''}`} style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend className="t-lab">{question.label}{question.required ? ' *' : ''}</legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        {options.map((opt) => (
          <label
            key={opt}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '12px 16px', borderRadius: 'var(--cp-r-chip)',
              border: `1.5px solid ${value === opt ? 'var(--cp-brand)' : 'var(--cp-field-line)'}`,
              background: value === opt ? 'var(--cp-band)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name={`extra-${question.key}`}
              value={opt}
              checked={value === opt}
              onChange={() => {
                setShowOtherText(false)
                onChange(opt)
              }}
            />
            <span>{opt}</span>
          </label>
        ))}
        {hasOtherOption && (
          <label
            style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '12px 16px', borderRadius: 'var(--cp-r-chip)',
              border: `1.5px solid ${selectedIsOther || showOtherText ? 'var(--cp-brand)' : 'var(--cp-field-line)'}`,
              background: selectedIsOther || showOtherText ? 'var(--cp-band)' : 'transparent',
            }}
          >
            <input
              type="radio"
              name={`extra-${question.key}`}
              checked={selectedIsOther || showOtherText}
              onChange={() => {
                setShowOtherText(true)
                // Clear prior value so the freetext input starts empty
                // (unless already in other-text mode with a value)
                if (!selectedIsOther) onChange('')
              }}
            />
            <span>{question.other_label}</span>
          </label>
        )}
        {(showOtherText || selectedIsOther) && (
          <input
            data-testid={`extra-other-${question.key}`}
            type="text"
            placeholder={`${question.other_label} eingeben`}
            value={selectedIsOther ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={80}
            style={{ marginTop: 4 }}
            className="field"
            aria-label={`${question.other_label ?? ''} eingeben`}
          />
        )}
      </div>
      {showError && (
        <span className="err">
          <span id={errorId}>Bitte wählen Sie eine Option.</span>
        </span>
      )}
    </fieldset>
  )
}
