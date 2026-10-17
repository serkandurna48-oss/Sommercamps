import CountUpNumber from '../CountUpNumber'

/**
 * `numericValue` (optional): wenn gesetzt, zählt die Zahl beim Einblenden
 * von 0 hoch (CountUpNumber) statt statisch dazustehen — nur für reine
 * Ganzzahlen sinnvoll (Warteliste-/Aufgaben-Anzahl), nicht für
 * zusammengesetzte Strings wie Geldbeträge oder "3/3"-Belegung, die
 * weiterhin nur `value` nutzen.
 *
 * `wide` (optional): belegt unter 768px beide Spalten. Ein Geldbetrag ist in
 * der Scoreboard-Schrift ~169px breit und wegen des geschützten Leerzeichens
 * vor dem € nicht umbrechbar — in einer halben Spalte (129px bei 390px) schob
 * er die ganze Seite seitlich heraus. Nur für Werte setzen, die lang werden
 * können, nicht für Zähler.
 */
export default function StatCard({ label, value, numericValue, wide = false }: { label: string; value: string; numericValue?: number; wide?: boolean }) {
  return (
    <div className={`rounded-[var(--cp-r-card)] border p-5${wide ? ' col-span-2 md:col-span-1' : ''}`} style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
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
