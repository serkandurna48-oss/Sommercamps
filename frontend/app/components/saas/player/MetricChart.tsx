import { formatDay, formatDelta, formatMeasurement, isLowerBetter, metricLabel, metricTrend, scaleSeries, type SeriesPoint, type TrendDirection } from './playerLogic'

const AREA = { width: 104, height: 36, pad: 5 }

const TREND: Record<TrendDirection, { arrow: string; word: string; color: string }> = {
  better: { arrow: '▲', word: 'besser', color: 'var(--cp-ok)' },
  worse: { arrow: '▼', word: 'schlechter', color: 'var(--cp-error)' },
  same: { arrow: '■', word: 'unverändert', color: 'var(--cp-muted)' },
}

/** Eine Messgröße kompakt: letzter Wert, Veränderung zum vorherigen Wert (Richtung nach „besser/schlechter“,
 * bei Zeiten und Sprints sinkt der Wert beim Verbessern) und ein kleiner Verlauf als Inline-SVG (keine Abhängigkeit).
 * Zeit läuft von links nach rechts, größere Werte liegen weiter oben. Der Pfeil zeigt die Bewertung, nicht die Richtung der Zahl. */
export default function MetricChart({ metric, unit, points, color, lowerIsBetter }: {
  metric: string
  unit: string
  points: SeriesPoint[]
  color: string
  /** Ausdrückliche Angabe der Messgröße; sonst Zeiteinheit oder Name (siehe isLowerBetter). */
  lowerIsBetter?: boolean | null
}) {
  const trend = metricTrend(metric, points, unit, lowerIsBetter)
  if (!trend) return null
  const scaled = scaleSeries(points, AREA)
  const first = points[0]
  const last = trend.latest
  const label = metricLabel(metric)
  const summary = points.length === 1
    ? `${label}: ${formatMeasurement(last.value, unit)} am ${formatDay(last.date)}`
    : `${label}: von ${formatMeasurement(first.value, unit)} am ${formatDay(first.date)} auf ${formatMeasurement(last.value, unit)} am ${formatDay(last.date)}`
  const tone = trend.direction ? TREND[trend.direction] : null
  return (
    <figure className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5" data-metric={metric}>
      <figcaption className="min-w-0">
        <span className="cp-label block break-words" style={{ color: 'var(--cp-ink-2)' }}>{label}</span>
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="cp-num text-[22px] font-extrabold leading-7 tracking-tight" style={{ color: 'var(--cp-ink)' }}>{formatMeasurement(last.value, unit)}</span>
          {tone && trend.delta !== null && (
            <span className="cp-chip" style={{ color: tone.color }} data-trend={trend.direction}>
              <span aria-hidden="true">{tone.arrow} </span>{trend.direction === 'same' ? tone.word : `${formatDelta(trend.delta, unit)} ${tone.word}`}
            </span>
          )}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${AREA.width} ${AREA.height}`} role="img" aria-label={summary} className="h-9 w-[104px]">
        <line x1={AREA.pad} y1={AREA.height - 1} x2={AREA.width - AREA.pad} y2={AREA.height - 1} stroke="var(--cp-line)" strokeWidth="1" />
        {scaled.length > 1 && (
          <polyline fill="none" style={{ stroke: color }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            points={scaled.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')} />
        )}
        {scaled.map((point, index) => (
          <circle key={point.id ?? `${point.date}-${index}`} cx={point.x.toFixed(1)} cy={point.y.toFixed(1)} r={index === scaled.length - 1 ? 3.5 : 2} style={{ fill: color }} />
        ))}
      </svg>
      <p className="cp-chip col-span-2" style={{ color: 'var(--cp-muted)' }}>
        {isLowerBetter(metric, unit, lowerIsBetter) ? 'Niedriger ist besser' : 'Höher ist besser'} · {formatDay(last.date)}
        {points.length > 1 ? ` · ${points.length} Messungen` : ''}
      </p>
    </figure>
  )
}
