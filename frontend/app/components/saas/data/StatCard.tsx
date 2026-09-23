import CountUpNumber from '../CountUpNumber'

/**
 * `numericValue` (optional): wenn gesetzt, zählt die Zahl beim Einblenden
 * von 0 hoch (CountUpNumber) statt statisch dazustehen — nur für reine
 * Ganzzahlen sinnvoll (Warteliste-/Aufgaben-Anzahl), nicht für
 * zusammengesetzte Strings wie Geldbeträge oder "3/3"-Belegung, die
 * weiterhin nur `value` nutzen.
 */
export default function StatCard({ label, value, numericValue }: { label: string; value: string; numericValue?: number }) {
  return (
    <div className="rounded-[var(--cp-r-card)] border p-5" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
      {numericValue !== undefined ? (
        <CountUpNumber value={numericValue} className="cp-num cp-scoreboard" style={{ color: 'var(--cp-ink)' }} />
      ) : (
        <p className="cp-num cp-scoreboard" style={{ color: 'var(--cp-ink)' }}>
          {value}
        </p>
      )}
      <p className="cp-label mt-1" style={{ color: 'var(--cp-muted)' }}>
        {label}
      </p>
    </div>
  )
}
