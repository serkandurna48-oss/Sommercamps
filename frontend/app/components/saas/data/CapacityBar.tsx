/**
 * Die einzige Stelle, an der Belegung gerendert wird (Abschnitt 5). Der
 * Balken ist der CampsPilot-Fortschrittsbalken (Orange-Verlauf, Pill),
 * unabhängig davon, ob voll/fast voll — keine Status-, sondern eine
 * Marken-Fläche. Die Vereinsfarbe gehört nur an das Logo im Band.
 */
export default function CapacityBar({
  filled,
  total,
}: {
  filled: number
  total: number
  /** @deprecated The bar uses the CampsPilot orange. Ignored. */
  brandColor?: string
}) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, filled / total)) : 0
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="cp-num cp-subheading" style={{ color: 'var(--cp-ink)' }}>
          {filled}/{total}
        </span>
        <span className="cp-chip" style={{ color: 'var(--cp-muted)' }}>
          belegt
        </span>
      </div>
      <div
        className="h-1.5 w-full"
        style={{ background: 'var(--cp-surface-sunken)', borderRadius: 'var(--cp-r-bar)' }}
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={total}
      >
        <div
          className="h-full"
          style={{ width: `${ratio * 100}%`, background: 'var(--cp-accent-bar)', borderRadius: 'var(--cp-r-bar)' }}
        />
      </div>
    </div>
  )
}
