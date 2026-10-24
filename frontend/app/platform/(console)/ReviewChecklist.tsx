import type { ReviewItem } from '../reviewChecklist'

export default function ReviewChecklist({ items }: { items: ReviewItem[] }) {
  const missing = items.filter(item => !item.done)
  return (
    <div>
      <p className="cp-chip" style={{ color: 'var(--cp-ink-2)' }}>
        {items.length - missing.length}/{items.length} Prüfpunkte vollständig
      </p>
      {missing.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Fehlende Angaben">
          {missing.map(item => (
            <li key={item.id} className="cp-chip rounded-[var(--cp-r-chip)] border px-2 py-1"
              style={{ color: 'var(--cp-error)', background: 'var(--cp-error-bg)', borderColor: 'var(--cp-error-line)' }}>
              Fehlt: {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
