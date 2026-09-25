'use client'

import { useActionState, useState } from 'react'
import { CAMP_STATUSES, campStatusLabel, de } from '../../../lib/i18n/de'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import { updateCampConfigAction, type ConfigActionState } from '../actions/configActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'
import { localInputToIso, toLocalInputValue } from '../../../lib/dateTimeInput'

/** Local wall times are converted to explicit instants before invoking the Server Action. */
export default function CampConfigForm({
  orgSlug,
  camp,
  brandStrong,
  brandOn,
}: {
  orgSlug: string
  camp: CampAdmin
  brandStrong: string
  brandOn: string
}) {
  const [submitted, setSubmitted] = useState<Record<string, string> | null>(null)
  const [previousCamp, setPreviousCamp] = useState(camp)
  if (camp !== previousCamp) {
    setPreviousCamp(camp)
    setSubmitted(null)
  }
  const inputValue = (field: string, fallback: string | number) => submitted?.[field] ?? fallback
  const boundAction = updateCampConfigAction.bind(null, orgSlug, camp.slug)
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(async (previous, data) => {
    // React resets uncontrolled fields after a resolved action, including
    // validation failures. Keep submitted defaults until fresh props arrive.
    setSubmitted(Object.fromEntries([...data].filter((entry): entry is [string, string] => typeof entry[1] === 'string')))
    // A datetime-local field has no offset. Convert on the device that
    // displayed it, not in the Server Action's unrelated timezone.
    try {
      for (const field of ['registration_start', 'registration_end'] as const) {
        data.set(field, localInputToIso(data.get(field), camp[field]))
      }
    } catch {
      return { error: 'Bitte gültige Anmeldezeiten eingeben. Diese Uhrzeit existiert in deiner Zeitzone möglicherweise nicht.', saved: false }
    }
    return boundAction(previous, data)
  }, { error: null, saved: false })

  // Remount the uncontrolled select after each action, using the confirmed
  // status on success and the submitted selection on failure.
  const [status, setStatus] = useState<CampAdmin['status']>(camp.status)
  const [selectGeneration, setSelectGeneration] = useState(0)

  const [prevState, setPrevState] = useState(state)
  if (state !== prevState) {
    setPrevState(state)
    const confirmed = state.error ? submitted?.status as CampAdmin['status'] | undefined : state.saved && state.status ? state.status : null
    if (confirmed) {
      setStatus(confirmed)
      setSelectGeneration(g => g + 1)
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
        /pilot/{orgSlug}/camps/<strong>{camp.slug}</strong> — {de.configPage.hint.slugLocked}
      </p>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.facts}
        </h3>
        <Field label={de.configPage.field.title} htmlFor="title">
          <input id="title" name="title" required defaultValue={inputValue('title', camp.title)} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.location} htmlFor="location">
          <input id="location" name="location" defaultValue={inputValue('location', camp.location ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.schedule}
        </h3>
        <p className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          Die Anmeldezeiten werden in der Zeitzone deines Geräts angezeigt.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={de.configPage.field.startDate} htmlFor="start_date">
            <input id="start_date" name="start_date" type="date" required defaultValue={inputValue('start_date', camp.start_date)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.endDate} htmlFor="end_date">
            <input id="end_date" name="end_date" type="date" required defaultValue={inputValue('end_date', camp.end_date)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.registrationStart} htmlFor="registration_start">
            <input
              id="registration_start"
              name="registration_start"
              type="datetime-local"
              defaultValue={inputValue('registration_start', toLocalInputValue(camp.registration_start))}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.registrationEnd} htmlFor="registration_end">
            <input
              id="registration_end"
              name="registration_end"
              type="datetime-local"
              defaultValue={inputValue('registration_end', toLocalInputValue(camp.registration_end))}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.ageMin} htmlFor="age_min">
            <input id="age_min" name="age_min" type="number" min={0} required defaultValue={inputValue('age_min', camp.age_min)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.ageMax} htmlFor="age_max">
            <input id="age_max" name="age_max" type="number" min={0} required defaultValue={inputValue('age_max', camp.age_max)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.capacity} htmlFor="capacity">
            <input id="capacity" name="capacity" type="number" min={1} required defaultValue={inputValue('capacity', camp.capacity)} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.price} htmlFor="price_euros">
            <input
              id="price_euros"
              name="price_euros"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={inputValue('price_euros', (camp.price_cents / 100).toFixed(2))}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.parentInfo}
        </h3>
        <Field label={de.configPage.field.careInfo} htmlFor="care_info">
          <textarea id="care_info" name="care_info" rows={2} defaultValue={inputValue('care_info', camp.care_info ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.mealsInfo} htmlFor="meals_info">
          <textarea id="meals_info" name="meals_info" rows={2} defaultValue={inputValue('meals_info', camp.meals_info ?? '')} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.includes} htmlFor="includes" hint={de.configPage.hint.includes}>
          <textarea
            id="includes"
            name="includes"
            rows={4}
            defaultValue={inputValue('includes', camp.includes?.join('\n') ?? '')}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.visibility}
        </h3>
        <Field label={de.configPage.field.status} htmlFor="status">
          <select
            key={selectGeneration}
            id="status"
            name="status"
            required
            defaultValue={status}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          >
            {CAMP_STATUSES.map(s => (
              <option key={s} value={s}>
                {campStatusLabel[s]}
              </option>
            ))}
          </select>
        </Field>
      </section>

      {state.error && (
        <p
          className="cp-confirm-pop cp-body rounded-[var(--cp-r-chip)] border px-3 py-2 motion-reduce:animate-none"
          style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}
          role="alert"
        >
          {state.error}
        </p>
      )}
      {state.saved && !state.error && <SuccessNote>{de.configPage.saved}</SuccessNote>}

      <div>
        <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn}>
          {pending ? de.configPage.saving : de.configPage.save}
        </Button>
      </div>
    </form>
  )
}
