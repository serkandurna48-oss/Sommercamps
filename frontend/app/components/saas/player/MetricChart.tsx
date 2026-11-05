import { formatDay, formatMeasurement, isLowerBetter, metricLabel, scaleSeries, type SeriesPoint } from './playerLogic'

const AREA = { width: 320, height: 120, pad: 14 }

/** Verlauf einer Metrik als einfaches Inline-SVG (keine Abhängigkeit). Zeit läuft
 * von links nach rechts, größere Werte liegen weiter oben. Bei Sprintzeiten ist
 * ein niedrigerer Wert besser; das steht ausdrücklich dabei. */
export default function MetricChart({ metric, unit, points, color }: {
  metric: string
  unit: string
  points: SeriesPoint[]
  color: string
}) {
  if (points.length === 0) return null
  const scaled = scaleSeries(points, AREA)
  const first = points[0]
  const last = points[points.length - 1]
  const label = metricLabel(metric)
  const summary = points.length === 1
    ? `${label}: ${formatMeasurement(last.value, unit)} am ${formatDay(last.date)}`
    : `${label}: von ${formatMeasurement(first.value, unit)} am ${formatDay(first.date)} auf ${formatMeasurement(last.value, unit)} am ${formatDay(last.date)}`
  return (
    <figure className="flex flex-col gap-1" data-metric={metric}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>{label}</span>
        <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          {isLowerBetter(metric) ? 'Niedriger ist besser' : 'Höher ist besser'}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${AREA.width} ${AREA.height}`} role="img" aria-label={summary} className="h-auto w-full max-w-[420px]">
        <line x1={AREA.pad} y1={AREA.height - 2} x2={AREA.width - AREA.pad} y2={AREA.height - 2} stroke="var(--cp-line)" strokeWidth="1" />
        {scaled.length > 1 && (
          <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            points={scaled.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} />
        )}
        {scaled.map((point, index) => (
          <circle key={point.id ?? `${point.date}-${index}`} cx={point.x.toFixed(1)} cy={point.y.toFixed(1)} r={index === scaled.length - 1 ? 5 : 3.5} fill={color} />
        ))}
      </svg>
      <p className="cp-chip" style={{ color: 'var(--cp-ink-2)' }}>
        {points.length > 1 && <>Zuerst {formatMeasurement(first.value, unit)} ({formatDay(first.date)}) · </>}
        Zuletzt {formatMeasurement(last.value, unit)} ({formatDay(last.date)})
      </p>
    </figure>
  )
}
