import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, Ref } from 'react'
import Link from '../preview/AdminLink'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
interface ButtonAppearance {
  variant?: ButtonVariant
  brandStrong?: string
  brandOn?: string
  className?: string
  style?: CSSProperties
}

function appearance({ variant = 'secondary', brandStrong, brandOn, className = '', style }: ButtonAppearance) {
  return {
    className: `cp-focus cp-subheading cp-btn-${variant} inline-flex min-w-[44px] min-h-[44px] items-center justify-center rounded-[var(--cp-r-field)] px-5 py-2 transition-[opacity,background-color] disabled:opacity-50 motion-reduce:transition-none ${className}`,
    style: {
      background: variant === 'primary' ? brandStrong ?? 'var(--cp-ink)' : 'var(--cp-surface)',
      color: variant === 'primary' ? brandOn ?? '#FFFFFF' : variant === 'danger' ? 'var(--cp-error)' : 'var(--cp-ink)',
      border: variant === 'primary' ? '1px solid transparent' : `1px solid ${variant === 'danger' ? 'var(--cp-error-line)' : 'var(--cp-field-line)'}`,
      ...style,
    },
  }
}

export default function Button({ variant, brandStrong, brandOn, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & ButtonAppearance & { ref?: Ref<HTMLButtonElement> }) {
  return <button {...appearance({ variant, brandStrong, brandOn, className, style })} {...props} />
}

/** Navigation actions share the same three appearances and remain semantic links. */
export function ButtonLink({ variant, brandStrong, brandOn, className, style, ...props }: ComponentProps<typeof Link> & ButtonAppearance) {
  return <Link {...appearance({ variant, brandStrong, brandOn, className, style })} {...props} />
}
