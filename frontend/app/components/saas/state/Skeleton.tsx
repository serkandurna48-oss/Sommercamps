/** Kein Puls/Shimmer-Loop — "nichts pulsiert" ist eine der vier
 * Motion-Verbote (Abschnitt 7). Ruhige, flache Platzhalterfläche. */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-[var(--cp-r-chip)] ${className}`} style={{ background: 'var(--cp-line-2)' }} aria-hidden="true" />
}
