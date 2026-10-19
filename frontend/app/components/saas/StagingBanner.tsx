// Shown on /pilot/* and /platform/* when NEXT_PUBLIC_APP_ENV=staging.
// Embedded at build time — no client-side JS needed, no layout shift.
export default function StagingBanner() {
  if (process.env.NEXT_PUBLIC_APP_ENV !== 'staging') return null
  return (
    <div
      style={{
        background: '#f59e0b',
        color: '#1c1917',
        textAlign: 'center',
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.04em',
        padding: '4px 16px',
      }}
    >
      STAGING – Testumgebung
    </div>
  )
}
