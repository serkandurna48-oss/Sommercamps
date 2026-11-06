'use client'

import { useId, useState } from 'react'
import type { PlayerMeasurement, PlayerMetric } from '../../../lib/saasAdminApi'
import { createMeasurementAction, deleteMeasurementAction } from '../actions/playerActions'
import EmptyState from '../state/EmptyState'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
import { COMPACT_BUTTONS, COMPACT_CARD, DISCLOSURE_SUMMARY } from './compact'
import MetricChart from './MetricChart'
import Notice, { FormError, type NoticeState } from './Notice'
import { CUSTOM_METRIC, buildMetricSeries, formatDay, formatMeasurement, metricLabel } from './playerLogic'
import { useSubmit } from './useSubmit'

/** Metriken in der Reihenfolge: Standardmetriken, dann freie Metriken nach erster Nennung. */
function metricsInUse(measurements: PlayerMeasurement[], standard: PlayerMetric[]): { metric: string; unit: string }[] {
  const order = standard.map(entry => entry.metric)
  for (const measurement of measurements) if (!order.includes(measurement.metric)) order.push(measurement.metric)
  return order
    .map(metric => ({ metric, unit: measurements.find(m => m.metric === metric)?.unit ?? standard.find(s => s.metric === metric)?.unit ?? '' }))
    .filter(entry => measurements.some(m => m.metric === entry.metric))
}

/** Angepinnte Karte „Messwerte“: je Messgröße letzter Wert, Veränderung und Mini-Verlauf; Einzelwerte und
 * „hinzufügen“ stehen eingeklappt darunter. Unter 1024 px ist die Karte eingeklappt (Kopf bleibt sichtbar). */
export default function MeasurementsSection({ orgSlug, playerId, measurements, metrics, today }: {
  orgSlug: string
  playerId: string
  measurements: PlayerMeasurement[]
  metrics: PlayerMetric[]
  today: string
}) {
  const id = useId()
  const { pending, result, submit, clearField } = useSubmit(createMeasurementAction.bind(null, orgSlug, playerId))
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const groups = metricsInUse(measurements, metrics)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [date, setDate] = useState(today)
  const [metric, setMetric] = useState(metrics[0]?.metric ?? CUSTOM_METRIC)
  const [customMetric, setCustomMetric] = useState('')
  const [unit, setUnit] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const custom = metric === CUSTOM_METRIC
  const standardUnit = metrics.find(entry => entry.metric === metric)?.unit
  const err = (name: string) => result?.fieldErrors?.[name]
  const formOpen = adding || groups.length === 0
  const bodyId = `${id}-body`

  return (
    <section className={`${COMPACT_CARD} ${COMPACT_BUTTONS} flex flex-col gap-3`} aria-labelledby="measurements-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="measurements-heading" className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Messwerte</h2>
        <Button type="button" className="lg:hidden" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(open => !open)}>
          {expanded ? 'Einklappen' : groups.length > 0 ? `Anzeigen (${groups.length})` : 'Anzeigen'}
        </Button>
      </div>
      <div id={bodyId} className={`flex flex-col gap-3 ${expanded ? '' : 'max-lg:hidden'}`}>
        <Notice notice={notice} />
        {groups.length === 0 ? (
          <EmptyState title="Noch keine Messwerte." body="Tragen Sie z. B. Sprintzeiten ein. Der Verlauf erscheint hier als Grafik." />
        ) : (
          <ul className="flex flex-col">
            {groups.map(group => {
              const series = buildMetricSeries(measurements, group.metric)
              const rows = measurements.filter(m => m.metric === group.metric)
              return (
                <li key={group.metric} className="flex flex-col border-t py-3 first:border-t-0 first:pt-0" style={{ borderTopColor: 'var(--cp-line-2)' }}>
                  <MetricChart metric={group.metric} unit={group.unit} points={series} color="var(--cp-accent-ink)" />
                  <details className="group mt-1">
                    <summary className={DISCLOSURE_SUMMARY} style={{ color: 'var(--cp-ink-2)' }}>Einzelwerte ({rows.length})</summary>
                    <ul className="flex flex-col">
                      {rows.map(row => (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-1.5" style={{ borderTopColor: 'var(--cp-line-2)' }}>
                          <p className="cp-chip min-w-0 break-words" style={{ color: 'var(--cp-ink)' }}>
                            <span className="font-bold">{formatMeasurement(row.value, row.unit)}</span> · {formatDay(row.measured_on)}
                            {row.note ? <span style={{ color: 'var(--cp-muted)' }}> · {row.note}</span> : null}
                          </p>
                          <ActionForm action={deleteMeasurementAction.bind(null, orgSlug, playerId, row.id)} label="Löschen" pendingLabel="Wird gelöscht …" variant="danger"
                            requireConfirm="Messwert endgültig löschen?"
                            onResult={outcome => { if (!outcome.error && outcome.success) setNotice({ kind: 'ok', text: outcome.success }) }} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        )}

        {!formOpen && (
          <Button type="button" className="w-full" aria-expanded={false} onClick={() => { setNotice(null); setAdding(true) }}>Messwert hinzufügen</Button>
        )}
        {formOpen && (
          <form className="flex flex-col gap-3 border-t pt-3" style={{ borderTopColor: 'var(--cp-line-2)' }} aria-label="Messwert hinzufügen" noValidate onSubmit={event => {
            event.preventDefault()
            setNotice(null)
            const data = new FormData()
            data.set('measured_on', date); data.set('metric', metric); data.set('custom_metric', customMetric)
            data.set('value', value); data.set('unit', unit); data.set('note', note)
            submit(data, () => { setValue(''); setNote(''); setAdding(false); setNotice({ kind: 'ok', text: 'Messwert gespeichert.' }) })
          }}>
            <h3 className="cp-label" style={{ color: 'var(--cp-ink)' }}>Messwert hinzufügen</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Metrik" htmlFor={`${id}-metric`} error={custom ? undefined : err('metric')}>
                  <select id={`${id}-metric`} value={metric} className={INPUT_CLASS} style={INPUT_STYLE} onChange={event => setMetric(event.target.value)}>
                    {metrics.map(entry => <option key={entry.metric} value={entry.metric}>{metricLabel(entry.metric)} ({entry.unit})</option>)}
                    <option value={CUSTOM_METRIC}>Eigene Metrik …</option>
                  </select>
                </Field>
              </div>
              {custom && (
                <>
                  <Field label="Name der Metrik" htmlFor={`${id}-custom`} error={err('metric')}>
                    <input id={`${id}-custom`} maxLength={60} autoComplete="off" value={customMetric} className={INPUT_CLASS} style={INPUT_STYLE}
                      onChange={event => { setCustomMetric(event.target.value); clearField('metric') }} />
                  </Field>
                  <Field label="Einheit" htmlFor={`${id}-unit`} error={err('unit')}>
                    <input id={`${id}-unit`} maxLength={20} autoComplete="off" value={unit} className={INPUT_CLASS} style={INPUT_STYLE}
                      onChange={event => { setUnit(event.target.value); clearField('unit') }} />
                  </Field>
                </>
              )}
              <Field label="Wert" htmlFor={`${id}-value`} error={err('value')} suffix={custom ? undefined : standardUnit}>
                <input id={`${id}-value`} inputMode="decimal" autoComplete="off" required value={value} placeholder="z. B. 2,14" className={INPUT_CLASS} style={INPUT_STYLE}
                  onChange={event => { setValue(event.target.value); clearField('value') }} />
              </Field>
              <Field label="Datum" htmlFor={`${id}-date`} error={err('measured_on')}>
                <input id={`${id}-date`} type="date" required value={date} className={INPUT_CLASS} style={INPUT_STYLE}
                  onChange={event => { setDate(event.target.value); clearField('measured_on') }} />
              </Field>
              <div className="col-span-2">
                <Field label="Anmerkung (optional)" htmlFor={`${id}-note`} error={err('note')}>
                  <input id={`${id}-note`} maxLength={1000} autoComplete="off" value={note} className={INPUT_CLASS} style={INPUT_STYLE}
                    onChange={event => { setNote(event.target.value); clearField('note') }} />
                </Field>
              </div>
            </div>
            {!pending && <FormError message={result?.error} />}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="secondary" disabled={pending} className="flex-1">
                {pending ? 'Wird gespeichert …' : 'Messwert speichern'}
              </Button>
              {groups.length > 0 && <Button type="button" disabled={pending} onClick={() => setAdding(false)}>Abbrechen</Button>}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}
