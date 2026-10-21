import type { ReactNode } from 'react'

/** Two mobile columns; an odd final tile fills the remaining row. */
export default function StatGrid({ children }: { children: ReactNode }) {
  return <div className="cp-stat-grid mb-8">{children}</div>
}
