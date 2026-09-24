'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { CAMP_STATUSES, campStatusLabel, de } from '../../../lib/i18n/de'
import type { CampAdmin } from '../../../lib/saasAdminApi'
import { updateCampConfigAction, type ConfigActionState } from '../actions/configActions'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import SuccessNote from '../state/SuccessNote'

/** `datetime-local` erwartet "YYYY-MM-DDTHH:mm" ohne Zeitzone. Bewusst
 * NICHT per String-slice (Bug, gefunden im Review): `camp.registration_start`
 * kommt vom Backend als tz-behaftetes ISO ("...+02:00"); ein Slice auf 16
 * Zeichen behält zwar dieselben Ziffern, verliert aber den Offset — beim
 * erneuten Absenden (siehe toIsoDateTime in configActions.ts) interpretiert
 * der Server dieselben Ziffern dann in einer anderen Zeitzone und
 * verschiebt registration_start/_end lautlos um den Offset, selbst wenn
 * der Admin dieses Feld nie angefasst hat (das Formular schickt bei jedem
 * Speichern alle Felder mit). Über echte Date-Methoden (lokale Zeitzone
 * des Browsers) hin und zurück ist der einzige Weg, der konsistent bleibt. */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
  const boundAction = updateCampConfigAction.bind(null, orgSlug, camp.slug)
  const [state, formAction, pending] = useActionState<ConfigActionState, FormData>(boundAction, { error: null, saved: false })

  /** `<select>` unten ist bewusst controlled statt `defaultValue` (Bug,
   * gefunden im Review): ein `defaultValue`-Select zeigt nach einem
   * fehlgeschlagenen Save weiter den gerade gewählten, nie gespeicherten
   * Wert — sieht nach einem geänderten Status aus, obwohl der Server ihn
   * nie bekommen hat.
   *
   * `status` wird bei einem abgeschlossenen Save-Versuch WÄHREND des
   * Renderns angepasst (React-Pattern "Adjusting state when a prop
   * changes"), nicht in einem Effect — ein `setState` synchron im Effect-
   * Body erzeugt einen unnötigen Kaskaden-Render (react-hooks/set-state-
   * in-effect) und ist hier auch nicht nötig, da React einen solchen
   * Render-Zeit-`setState`-Aufruf ohnehin vor dem Commit abfängt.
   *
   * Bei Erfolg zählt NUR `state.status` (von der Action zurückgemeldet),
   * nie `camp.status` (Bug, gefunden im Review): in genau dem Render, in
   * dem `state.saved` erstmals true wird, kommt `camp` noch aus der
   * Server-Komponente von VOR diesem Save — `revalidatePath` liefert die
   * aktualisierte Prop erst in einem eigenen, späteren Render. `camp.status`
   * bleibt hier ausschließlich der Fehlerfall-Fallback, wo nie revalidiert
   * wird und der Wert deshalb nie veraltet.
   *
   * Der separate Effect danach schreibt `status` zusätzlich direkt auf
   * `selectRef.current.value` (Bug, im Review nachgestellt): React setzt
   * die DOM-`value` eines controlled `<select>` nur, wenn sich der Wert
   * gegenüber dem zuletzt VON REACT SELBST geschriebenen Wert
   * unterscheidet — nicht gegenüber dem, was aktuell im echten DOM steht.
   * Nach einer Tastatur-Auswahl (Browser setzt den DOM-Wert direkt) +
   * Server-Save, bei dem der zurückgemeldete Stand zufällig wieder dem
   * VOR der Auswahl gemerkten React-Wert entspricht, überspringt React
   * den DOM-Write komplett, und das Select bleibt auf einem längst
   * überholten Browser-internen Stand hängen — reproduzierbar, kein
   * Einzelfall. Ein erzwungener Write über die Ref bei jeder
   * `status`-Änderung schließt genau diese Lücke. */
  const [status, setStatus] = useState<CampAdmin['status']>(camp.status)
  const selectRef = useRef<HTMLSelectElement>(null)

  const [prevState, setPrevState] = useState(state)
  if (state !== prevState) {
    setPrevState(state)
    const confirmed = state.error ? camp.status : state.saved && state.status ? state.status : null
    if (confirmed) setStatus(confirmed)
  }

  useEffect(() => {
    /** Erzwingt `status` auf das native `<select>` über ein kurzes
     * Zeitfenster, nicht nur einmalig (Bug, gefunden im Review, per
     * MutationObserver-Trace nachgewiesen): irgendetwas außerhalb dieser
     * Komponente schreibt den DOM-Wert nach einem erfolgreichen Save
     * manchmal — nicht immer, reproduzierbar flakey — auf einen älteren
     * Stand zurück, NACHDEM `value={status}` bzw. ein einmaliger
     * `selectRef.current.value = status`-Write bereits korrekt
     * angewendet wurden. React merkt diesen externen Rückschreib-Vorgang
     * nicht (sein zuletzt geschriebener Wert stimmt ja noch mit `status`
     * überein) und korrigiert ihn deshalb nie selbst. Einmaliges
     * Erzwingen gewinnt das Timing-Rennen nicht zuverlässig; wiederholtes
     * Erzwingen über ein Fenster von 1s tut es unabhängig vom exakten
     * Timing der Störung. */
    let ticks = 0
    const id = setInterval(() => {
      if (selectRef.current && selectRef.current.value !== status) {
        selectRef.current.value = status
      }
      ticks += 1
      if (ticks >= 20) clearInterval(id)
    }, 50)
    if (selectRef.current) selectRef.current.value = status
    return () => clearInterval(id)
  }, [status])

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
          <input id="title" name="title" required defaultValue={camp.title} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.location} htmlFor="location">
          <input id="location" name="location" defaultValue={camp.location ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="cp-heading" style={{ color: 'var(--cp-ink)' }}>
          {de.configPage.section.schedule}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={de.configPage.field.startDate} htmlFor="start_date">
            <input id="start_date" name="start_date" type="date" required defaultValue={camp.start_date} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.endDate} htmlFor="end_date">
            <input id="end_date" name="end_date" type="date" required defaultValue={camp.end_date} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.registrationStart} htmlFor="registration_start">
            <input
              id="registration_start"
              name="registration_start"
              type="datetime-local"
              defaultValue={toLocalInputValue(camp.registration_start)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.registrationEnd} htmlFor="registration_end">
            <input
              id="registration_end"
              name="registration_end"
              type="datetime-local"
              defaultValue={toLocalInputValue(camp.registration_end)}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
            />
          </Field>
          <Field label={de.configPage.field.ageMin} htmlFor="age_min">
            <input id="age_min" name="age_min" type="number" min={0} required defaultValue={camp.age_min} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.ageMax} htmlFor="age_max">
            <input id="age_max" name="age_max" type="number" min={0} required defaultValue={camp.age_max} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.capacity} htmlFor="capacity">
            <input id="capacity" name="capacity" type="number" min={1} required defaultValue={camp.capacity} className={INPUT_CLASS} style={INPUT_STYLE} />
          </Field>
          <Field label={de.configPage.field.price} htmlFor="price_euros">
            <input
              id="price_euros"
              name="price_euros"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={(camp.price_cents / 100).toFixed(2)}
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
          <textarea id="care_info" name="care_info" rows={2} defaultValue={camp.care_info ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.mealsInfo} htmlFor="meals_info">
          <textarea id="meals_info" name="meals_info" rows={2} defaultValue={camp.meals_info ?? ''} className={INPUT_CLASS} style={INPUT_STYLE} />
        </Field>
        <Field label={de.configPage.field.includes} htmlFor="includes" hint={de.configPage.hint.includes}>
          <textarea
            id="includes"
            name="includes"
            rows={4}
            defaultValue={camp.includes?.join('\n') ?? ''}
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
            id="status"
            name="status"
            required
            ref={selectRef}
            value={status}
            onChange={e => setStatus(e.target.value as CampAdmin['status'])}
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
