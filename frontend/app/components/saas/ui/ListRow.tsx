import type { ReactNode } from 'react'

/** Shared main / secondary / status / action slots, with a mobile action rail. */
export default function ListRow({ main, secondary, status, action, className = '' }: {
  main: ReactNode
  secondary?: ReactNode
  status?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return <div className={`cp-list-row ${className}`}>
    <div className="cp-row-main">{main}</div>
    <div className="cp-row-secondary">{secondary}</div>
    <div className="cp-row-status">{status}</div>
    <div className="cp-row-action">{action}</div>
  </div>
}
