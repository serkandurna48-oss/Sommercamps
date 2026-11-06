'use client'

import { useActionState, useId, useState } from 'react'
import { createMemberAction, type MemberFormState } from '../actions/trainingActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'

const initialState: MemberFormState = { error: null }

export default function MemberCreateForm({ orgSlug }: { orgSlug: string }) {
  const feedbackId = useId()
  const [submitted, setSubmitted] = useState<Record<string, string>>({})
  const bound = createMemberAction.bind(null, orgSlug)
  const [state, formAction, pending] = useActionState<MemberFormState, FormData>(async (previous, data) => {
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    const result = await bound(previous, data)
    if (result.saved) setSubmitted({})
    return result
  }, initialState)
  const err = (name: string) => (pending ? undefined : state.fieldErrors?.[name])
  const value = (name: string) => submitted[name] ?? ''

  return (
    <form action={formAction} aria-describedby={!pending && state.error ? feedbackId : undefined} className="cp-card flex flex-col gap-4">
      <h3 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Mitglied einzeln eintragen</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vorname" htmlFor="member_first_name" error={err('first_name')}>
          <input id="member_first_name" name="first_name" required maxLength={100} autoComplete="off" defaultValue={value('first_name')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Nachname" htmlFor="member_last_name" error={err('last_name')}>
          <input id="member_last_name" name="last_name" required maxLength={100} autoComplete="off" defaultValue={value('last_name')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Geburtsdatum" htmlFor="member_birth_date" error={err('birth_date')}>
          <input id="member_birth_date" name="birth_date" type="date" required min="1900-01-01" autoComplete="off" defaultValue={value('birth_date')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label="Mitgliedsnummer (optional)" htmlFor="member_number" error={err('member_number')}>
          <input id="member_number" name="member_number" maxLength={50} autoComplete="off" defaultValue={value('member_number')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </div>
      {!pending && state.error && (
        <p className="cp-body rounded-[var(--cp-r-chip)] border px-3 py-2" id={feedbackId} role="alert"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
          {state.error}
        </p>
      )}
      {!pending && state.saved && <SuccessNote>Mitglied gespeichert.</SuccessNote>}
      <div>
        <Button type="submit" variant="secondary" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Wird gespeichert …' : 'Mitglied speichern'}
        </Button>
      </div>
    </form>
  )
}
