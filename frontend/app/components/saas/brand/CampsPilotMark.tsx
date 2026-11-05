/**
 * CampsPilot mark (brand kit): a pitch seen from above. Frame and halfway
 * line take the surrounding text colour (currentColor), the centre circle
 * is always the CampsPilot orange. Minimum width 24 px.
 */
export default function CampsPilotMark({ width = 30, height = 20, className }: { width?: number; height?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 24" width={width} height={height} aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="34" height="22" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="18" y1="1" x2="18" y2="23" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="12" r="5" fill="none" style={{ stroke: 'var(--cp-accent)' }} strokeWidth="2.4" />
    </svg>
  )
}

/** Mark plus wordmark "CampsPilot" (Archivo 800, width 112 %). */
export function CampsPilotLockup({ className = '' }: { className?: string }) {
  return (
    <span className={`cp-lockup ${className}`}>
      <CampsPilotMark />
      CampsPilot
    </span>
  )
}
