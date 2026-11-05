import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, Ref } from 'react'
import Link from '../preview/AdminLink'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
interface ButtonAppearance {
  variant?: ButtonVariant
  /** @deprecated Admin controls use the CampsPilot orange (tokens.css), not the club colour. Ignored. */
  brandStrong?: string
  /** @deprecated See brandStrong. Ignored. */
  brandOn?: string
  className?: string
  style?: CSSProperties
}

/** Colours, height and type live in tokens.css (.cp-btn*), so hover, focus and the band variant work without inline styles. */
function appearance({ variant = 'secondary', className = '', style }: ButtonAppearance) {
  return {
    className: `cp-focus cp-btn cp-btn-${variant} inline-flex min-h-[44px] min-w-[44px] max-md:min-h-[48px] items-center justify-center disabled:opacity-50 motion-reduce:transition-none ${className}`,
    style,
  }
}

export default function Button({ variant, brandStrong, brandOn, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & ButtonAppearance & { ref?: Ref<HTMLButtonElement> }) {
  void brandStrong
  void brandOn
  return <button {...appearance({ variant, className, style })} {...props} />
}

/** Navigation actions share the same three appearances and remain semantic links. */
export function ButtonLink({ variant, brandStrong, brandOn, className, style, ...props }: ComponentProps<typeof Link> & ButtonAppearance) {
  void brandStrong
  void brandOn
  return <Link {...appearance({ variant, className, style })} {...props} />
}
