import { computeBrandTokens } from '../brandPipeline'

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
  const { brandStrong } = computeBrandTokens(brandColor)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cp-focus min-w-[44px] cp-label inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-[var(--cp-r-field)] border px-4 whitespace-nowrap transition-colors motion-reduce:transition-none"
      style={{
        color: active ? brandStrong : 'var(--cp-ink-2)',
        borderColor: active ? brandStrong : 'var(--cp-field-line)',
        background: 'var(--cp-surface)',
      }}
    >
      {label}
      <span className="cp-num">{count}</span>
    </button>
  )
}
