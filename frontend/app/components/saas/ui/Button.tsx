import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'quiet-danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** Für variant="primary": --cp-brand-strong/--cp-brand-on (Abschnitt 3.3). */
  brandStrong?: string
  brandOn?: string
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'cp-btn-primary',
  secondary: 'cp-btn-secondary',
  quiet: 'cp-btn-quiet',
  'quiet-danger': 'cp-btn-quiet-danger',
}

/** Mindestens 50-54px Höhe (primary), 44x44 Tapfläche (Abschnitt 5). */
export default function Button({
  variant = 'secondary',
  brandStrong,
  brandOn,
  className = '',
  style,
  ...props
}: ButtonProps) {
  const base =
    'cp-focus cp-subheading inline-flex min-w-[44px] min-h-[44px] items-center justify-center rounded-[var(--cp-r-field)] px-5 transition-[opacity,background-color] disabled:opacity-50 motion-reduce:transition-none'

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: brandStrong ?? 'var(--cp-ink)', color: brandOn ?? '#FFFFFF', minHeight: '50px' }
      : variant === 'secondary'
        ? { background: 'var(--cp-surface)', color: 'var(--cp-ink)', border: '1px solid var(--cp-field-line)' }
        : variant === 'quiet-danger'
          ? { background: 'transparent', color: 'var(--cp-error)' }
          : { background: 'transparent', color: 'var(--cp-ink-2)' }

  return (
    <button
      className={`${base} ${VARIANT_CLASS[variant]} ${className}`}
      style={{ ...variantStyle, ...style }}
      {...props}
    />
  )
}
