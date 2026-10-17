import CountUpNumber from '../CountUpNumber'

export interface BandMetricProps {
  label: string
  value: string
  /** Belegungsbalken (Abschnitt 3.1: --cp-r-bar, absichtlich eckig). 0-1. */
  bar?: number
  /** Vereinsfarbe für den Balken — eine der fünf erlaubten Stellen (3.3). */
  barColor?: string
  size?: 'band' | 'inline' | 'hero'
  /** Wenn gesetzt, zählt `value` beim Einblenden von 0 hoch — nur für
   * reine Ganzzahlen (z. B. "Tage"), nicht für "3/3"-Belegung. */
  numericValue?: number
}

const SIZE_CLASS: Record<NonNullable<BandMetricProps['size']>, string> = {
  hero: 'cp-band-hero-metric',
  band: 'cp-band-metric',
  inline: 'cp-band-title',
}

export default function BandMetric({ label, value, bar, barColor, size = 'band', numericValue }: BandMetricProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`cp-num ${SIZE_CLASS[size]}`} style={{ color: 'var(--cp-on-band)' }}>
        {numericValue !== undefined ? <CountUpNumber value={numericValue} /> : value}
      </span>
      <span className="cp-label" style={{ color: 'var(--cp-on-band-2)' }}>
        {label}
      </span>
      {typeof bar === 'number' && (
        <div className="mt-1 h-1 w-full max-w-24" style={{ background: 'var(--cp-band-2)' }}>
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(1, bar)) * 100}%`,
              background: barColor ?? 'var(--cp-on-band-2)',
              borderRadius: 'var(--cp-r-bar)',
            }}
          />
        </div>
      )}
    </div>
  )
}
