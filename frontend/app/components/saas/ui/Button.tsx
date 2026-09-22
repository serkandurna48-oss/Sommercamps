import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** Für variant="primary": --cp-brand-strong/--cp-brand-on (Abschnitt 3.3). */
  brandStrong?: string
  brandOn?: string
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
  const base = 'cp-subheading inline-flex min-h-[44px] items-center justify-center rounded-[var(--cp-r-field)] px-5 transition-opacity disabled:opacity-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? { background: brandStrong ?? 'var(--cp-ink)', color: brandOn ?? '#FFFFFF', minHeight: '50px', outlineColor: brandStrong }
      : variant === 'secondary'
        ? { background: 'var(--cp-surface)', color: 'var(--cp-ink)', border: '1px solid var(--cp-field-line)' }
        : { background: 'transparent', color: 'var(--cp-ink-2)' }

  return (
    <button className={`${base} ${className}`} style={{ ...variantStyle, ...style }} {...props} />
  )
}
