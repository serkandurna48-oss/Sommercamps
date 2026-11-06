import Button from './Button'

export default function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cp-focus min-w-[44px] cp-label inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[var(--cp-r-field)] border px-4 whitespace-nowrap transition-colors motion-reduce:transition-none"
      style={{
        color: active ? 'var(--cp-accent-ink)' : 'var(--cp-ink-2)',
        borderColor: active ? 'var(--cp-accent-ink)' : 'var(--cp-line)',
        background: active ? 'var(--cp-accent-soft)' : 'var(--cp-surface)',
      }}
    >
      {label}
      <span className="cp-num">{count}</span>
    </Button>
  )
}
