/** Leerzustand mit dem Platz-Motiv (Rasen, Kalklinien, ein Hütchen in Orange) — reine Illustration. */
export default function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="cp-empty">
      <svg className="cp-empty-art" viewBox="0 0 72 48" width="72" height="48" aria-hidden="true" focusable="false">
        <rect className="pitch" x="0" y="0" width="72" height="48" rx="8" />
        <rect className="chalk" x="6" y="6" width="60" height="36" rx="3" />
        <line className="chalk" x1="36" y1="6" x2="36" y2="42" />
        <circle className="chalk" cx="36" cy="24" r="8" />
        <circle className="spot" cx="36" cy="24" r="2.5" />
      </svg>
      <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
        {title}
      </p>
      {body && (
        <p className="cp-body mt-1.5 max-w-[52ch]" style={{ color: 'var(--cp-muted)' }}>
          {body}
        </p>
      )}
    </div>
  )
}
