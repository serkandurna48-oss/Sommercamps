export default function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--cp-r-card)] border p-5" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
      <p className="cp-num cp-title" style={{ color: 'var(--cp-ink)' }}>
        {value}
      </p>
      <p className="cp-label mt-1" style={{ color: 'var(--cp-muted)' }}>
        {label}
      </p>
    </div>
  )
}
