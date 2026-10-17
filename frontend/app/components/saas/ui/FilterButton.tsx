export default function FilterButton({
  label,
  count,
  active,
  brandColor,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  brandColor: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cp-label inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[var(--cp-r-field)] border px-4 whitespace-nowrap transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        color: active ? brandColor : 'var(--cp-ink-2)',
        borderColor: active ? brandColor : 'var(--cp-field-line)',
        background: active ? 'color-mix(in oklab, ' + brandColor + ' 8%, white)' : 'var(--cp-surface)',
        outlineColor: brandColor,
      }}
    >
      {label}
      <span className="cp-num">{count}</span>
    </button>
  )
}
