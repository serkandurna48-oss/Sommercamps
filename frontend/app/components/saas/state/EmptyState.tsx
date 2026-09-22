export default function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div
      className="rounded-[var(--cp-r-card)] border border-dashed px-6 py-12 text-center"
      style={{ borderColor: 'var(--cp-line)' }}
    >
      <p className="cp-subheading" style={{ color: 'var(--cp-ink-2)' }}>
        {title}
      </p>
      {body && (
        <p className="cp-body mt-1.5" style={{ color: 'var(--cp-muted)' }}>
          {body}
        </p>
      )}
    </div>
  )
}
