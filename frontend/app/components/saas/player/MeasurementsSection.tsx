'use client'

import { useId, useState } from 'react'
import type { PlayerMeasurement, PlayerMetric } from '../../../lib/saasAdminApi'
import { createMeasurementAction, deleteMeasurementAction } from '../actions/playerActions'
import EmptyState from '../state/EmptyState'
import ActionForm from '../ui/ActionForm'
import Button from '../ui/Button'
import Field from '../ui/Field'
import { INPUT_CLASS, INPUT_STYLE } from '../ui/formFieldStyles'
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

export default function MeasurementsSection({ orgSlug, playerId, measurements, metrics, today, brandStrong, brandOn }: {
  orgSlug: string
  playerId: string
  measurements: PlayerMeasurement[]
  metrics: PlayerMetric[]
  today: string
  brandStrong: string
  brandOn: string
}) {
  const id = useId()
  const { pending, result, submit, clearField } = useSubmit(createMeasurementAction.bind(null, orgSlug, playerId))
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [date, setDate] = useState(today)
  const [metric, setMetric] = useState(metrics[0]?.metric ?? CUSTOM_METRIC)
  const [customMetric, setCustomMetric] = useState('')
  const [unit, setUnit] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const custom = metric === CUSTOM_METRIC
  const standardUnit = metrics.find(entry => entry.metric === metric)?.unit
  const err = (name: string) => result?.fieldErrors?.[name]
  const groups = metricsInUse(measurements, metrics)

  return (
    <div className="flex flex-col gap-4">
      <Notice notice={notice} />
      {groups.length === 0 ? (
        <EmptyState title="Noch keine Messwerte." body="Tragen Sie z. B. Sprintzeiten ein. Der Verlauf erscheint hier als Grafik." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {groups.map(group => {
            const series = buildMetricSeries(measurements, group.metric)
            const rows = measurements.filter(m => m.metric === group.metric)
            return (
              <section key={group.metric} className="cp-card flex flex-col gap-3" aria-label={metricLabel(group.metric)}>
                <MetricChart metric={group.metric} unit={group.unit} points={series} color={brandStrong} />
                <ul className="flex flex-col">
                  {rows.map(row => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2" style={{ borderTopColor: 'var(--cp-line-2)' }}>
                      <p className="cp-body min-w-0 break-words" style={{ color: 'var(--cp-ink)' }}>
                        <span className="font-semibold">{formatMeasurement(row.value, row.unit)}</span> · {formatDay(row.measured_on)}
                        {row.note ? <span style={{ color: 'var(--cp-muted)' }}> · {row.note}</span> : null}
                      </p>
                      <ActionForm action={deleteMeasurementAction.bind(null, orgSlug, playerId, row.id)} label="Löschen" pendingLabel="Wird gelöscht …" variant="danger"
                        requireConfirm="Messwert endgültig löschen?"
                        onResult={outcome => { if (!outcome.error && outcome.success) setNotice({ kind: 'ok', text: outcome.success }) }} />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <form className="cp-card flex flex-col gap-4" aria-label="Messwert hinzufügen" noValidate onSubmit={event => {
        event.preventDefault()
        setNotice(null)
        const data = new FormData()
        data.set('measured_on', date); data.set('metric', metric); data.set('custom_metric', customMetric)
        data.set('value', value); data.set('unit', unit); data.set('note', note)
        submit(data, () => { setValue(''); setNote(''); setNotice({ kind: 'ok', text: 'Messwert gespeichert.' }) })
      }}>
        <h3 className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>Messwert hinzufügen</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Datum" htmlFor={`${id}-date`} error={err('measured_on')}>
            <input id={`${id}-date`} type="date" required value={date} className={INPUT_CLASS} style={INPUT_STYLE}
              onChange={event => { setDate(event.target.value); clearField('measured_on') }} />
          </Field>
          <Field label="Metrik" htmlFor={`${id}-metric`} error={custom ? undefined : err('metric')}>
            <select id={`${id}-metric`} value={metric} className={INPUT_CLASS} style={INPUT_STYLE} onChange={event => setMetric(event.target.value)}>
              {metrics.map(entry => <option key={entry.metric} value={entry.metric}>{metricLabel(entry.metric)} ({entry.unit})</option>)}
              <option value={CUSTOM_METRIC}>Eigene Metrik …</option>
            </select>
          </Field>
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
          <Field label="Anmerkung (optional)" htmlFor={`${id}-note`} error={err('note')}>
            <input id={`${id}-note`} maxLength={1000} autoComplete="off" value={note} className={INPUT_CLASS} style={INPUT_STYLE}
              onChange={event => { setNote(event.target.value); clearField('note') }} />
          </Field>
        </div>
        {!pending && <FormError message={result?.error} />}
        <div>
          <Button type="submit" variant="primary" disabled={pending} brandStrong={brandStrong} brandOn={brandOn} className="w-full sm:w-auto">
            {pending ? 'Wird gespeichert …' : 'Messwert speichern'}
          </Button>
        </div>
      </form>
    </div>
  )
}
