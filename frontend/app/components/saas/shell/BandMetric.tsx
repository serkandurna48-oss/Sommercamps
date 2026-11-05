import CountUpNumber from '../CountUpNumber'

export interface BandMetricProps {
  label: string
  value: string
  /** Belegungsbalken, 0-1. Immer CampsPilot-Orange. */
  bar?: number
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

export default function BandMetric({ label, value, bar, size = 'band', numericValue }: BandMetricProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`cp-num ${SIZE_CLASS[size]}`} style={{ color: 'var(--cp-on-band)' }}>
        {numericValue !== undefined ? <CountUpNumber value={numericValue} /> : value}
      </span>
      <span className="cp-label" style={{ color: 'var(--cp-on-band-2)' }}>
        {label}
      </span>
      {typeof bar === 'number' && (
        <div className="mt-1 h-1 w-full max-w-24" style={{ background: 'var(--cp-band-line)', borderRadius: 'var(--cp-r-bar)' }}>
          <div
            className="h-full"
            style={{
              width: `${Math.max(0, Math.min(1, bar)) * 100}%`,
              background: 'var(--cp-accent-bar)',
              borderRadius: 'var(--cp-r-bar)',
            }}
          />
        </div>
      )}
    </div>
  )
}
