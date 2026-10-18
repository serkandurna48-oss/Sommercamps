import CountUpNumber from '../CountUpNumber'
import type { StatusTone } from './StatusChip'

const TONE_COLOR: Record<Exclude<StatusTone, 'neutral'>, string> = {
  ok: 'var(--cp-ok)',
  pending: 'var(--cp-pending)',
  error: 'var(--cp-error)',
  info: 'var(--cp-info)',
}

const TONE_BG: Record<Exclude<StatusTone, 'neutral'>, string> = {
  ok: 'var(--cp-ok-bg)',
  pending: 'var(--cp-pending-bg)',
  error: 'var(--cp-error-bg)',
  info: 'var(--cp-info-bg)',
}

const TONE_LINE: Record<Exclude<StatusTone, 'neutral'>, string> = {
  ok: 'var(--cp-ok-line)',
  pending: 'var(--cp-pending-line)',
  error: 'var(--cp-error-line)',
  info: 'var(--cp-info-line)',
}

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
 *
 * `tone` (optional): hebt die Karte farblich hervor — z. B. `pending` für
 * offene Zahlungen, damit Jan sofort sieht, welche Kennzahl Handlungsbedarf
 * hat. Kein Ton = neutrale Darstellung (Standard).
 */
export default function StatCard({
  label,
  value,
  numericValue,
  wide = false,
  tone,
}: {
  label: string
  value: string
  numericValue?: number
  wide?: boolean
  tone?: Exclude<StatusTone, 'neutral'>
}) {
  const valueColor = tone ? TONE_COLOR[tone] : 'var(--cp-ink)'
  const borderColor = tone ? TONE_LINE[tone] : 'var(--cp-line)'
  const bg = tone ? TONE_BG[tone] : 'var(--cp-surface)'

  return (
    <div
      className={`rounded-[var(--cp-r-card)] border p-5${wide ? ' col-span-2 md:col-span-1 xl:col-span-2' : ''}`}
      style={{ borderColor, background: bg }}
    >
      {numericValue !== undefined ? (
        <CountUpNumber value={numericValue} className="cp-num cp-scoreboard" style={{ color: valueColor, whiteSpace: 'nowrap' }} />
      ) : (
        <p className="cp-num cp-scoreboard" style={{ color: valueColor, whiteSpace: 'nowrap' }}>
          {value}
        </p>
      )}
      <p className="cp-label mt-1" style={{ color: tone ? valueColor : 'var(--cp-muted)', opacity: tone ? 0.8 : 1 }}>
        {label}
      </p>
    </div>
  )
}
