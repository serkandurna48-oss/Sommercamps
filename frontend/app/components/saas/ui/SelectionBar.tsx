import type { ReactNode } from 'react'

/** Erscheint sobald count >= 1 (Abschnitt 4.3). Fixiert am unteren Rand auf
 * Mobile (Abschnitt 6), sonst unter der Liste. */
export default function SelectionBar({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 max-md:fixed max-md:right-0 max-md:bottom-0 max-md:left-0"
      style={{ background: 'var(--cp-surface)', borderColor: 'var(--cp-line)' }}
      role="status"
    >
      <span className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
        {count} ausgewählt
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
