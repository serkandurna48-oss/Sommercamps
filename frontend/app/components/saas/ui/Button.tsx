import type { ButtonHTMLAttributes, ComponentProps, CSSProperties, Ref } from 'react'
import Link from '../preview/AdminLink'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
interface ButtonAppearance {
  variant?: ButtonVariant
  className?: string
  style?: CSSProperties
}

/** Admin controls always use the CampsPilot accent, never the club colour.
 * Colours, height and type live in tokens.css (.cp-btn*), so hover, focus and the band variant work without inline styles. */
function appearance({ variant = 'secondary', className = '', style }: ButtonAppearance) {
  return {
    className: `cp-focus cp-btn cp-btn-${variant} inline-flex min-h-[44px] min-w-[44px] max-md:min-h-[48px] items-center justify-center disabled:opacity-50 motion-reduce:transition-none ${className}`,
    style,
  }
}

export default function Button({ variant, className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & ButtonAppearance & { ref?: Ref<HTMLButtonElement> }) {
  return <button {...appearance({ variant, className, style })} {...props} />
}

/** Navigation actions share the same three appearances and remain semantic links. */
export function ButtonLink({ variant, className, style, ...props }: ComponentProps<typeof Link> & ButtonAppearance) {
  return <Link {...appearance({ variant, className, style })} {...props} />
}
