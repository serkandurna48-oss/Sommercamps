export default function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="cp-confirm-pop cp-body rounded-[var(--cp-r-chip)] border px-3 py-2 motion-reduce:animate-none"
      style={{ color: 'var(--cp-ok)', background: 'var(--cp-ok-bg)', borderColor: 'var(--cp-ok-line)' }}
      role="status"
    >
      {children}
    </p>
  )
}
