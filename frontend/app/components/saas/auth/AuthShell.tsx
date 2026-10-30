import Image from 'next/image'
import BrandMark from '../../marketing/BrandMark'
import { archivo } from '../fonts'
import '../tokens.css'
import './auth.css'

/** CampsPilot accent, used where no club colour applies (platform, CampsPilot sign-in). */
export const CAMPSPILOT_ACCENT = { strong: '#c24f1a', on: '#ffffff' }

interface AuthShellProps {
  /** Club name, or "CampsPilot" for product-level pages. */
  name?: string
  logoUrl?: string | null
  /** Initials shown when there is no logo. */
  initials?: string | null
  /** true for CampsPilot's own pages: shows the CampsPilot mark instead of club initials. */
  product?: boolean
  accent?: { strong?: string; on?: string }
  children: React.ReactNode
}

/** Shared frame for every sign-in and password page. */
export default function AuthShell({ name, logoUrl, initials, product = false, accent, children }: AuthShellProps) {
  const strong = accent?.strong ?? (product ? CAMPSPILOT_ACCENT.strong : undefined)
  const on = accent?.on ?? (product ? CAMPSPILOT_ACCENT.on : undefined)
  return (
    <div
      className={`${archivo.variable} cp-scope cp-auth`}
      style={{ ...(strong ? { '--auth-accent': strong } : {}), ...(on ? { '--auth-on': on } : {}) } as React.CSSProperties}
    >
      <main className="auth-card">
        {name && (
          <div className="auth-id">
            <span className={`auth-logo${logoUrl ? ' has-image' : ''}${product && !logoUrl ? ' is-mark' : ''}`} aria-hidden="true">
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={40} height={40} unoptimized />
              ) : product ? (
                <BrandMark width={26} height={18} />
              ) : (
                initials
              )}
            </span>
            <span className="auth-name">{name}</span>
          </div>
        )}
        {children}
      </main>
      {!product && (
        <p className="auth-foot">
          <BrandMark />
          Anmeldung und Verwaltung über CampsPilot
        </p>
      )}
    </div>
  )
}
