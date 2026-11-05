import Image from 'next/image'
import CampsPilotMark from '../brand/CampsPilotMark'
import { archivo } from '../fonts'
import '../tokens.css'
import './auth.css'

interface AuthShellProps {
  /** Club name, or "CampsPilot …" for product-level pages. */
  name?: string
  logoUrl?: string | null
  /** Initials shown when there is no logo. */
  initials?: string | null
  /** true for CampsPilot's own pages (platform, product sign-in): no club tile. */
  product?: boolean
  /** Club colour for the initials tile only; controls stay CampsPilot orange. */
  accent?: { strong?: string; on?: string }
  children: React.ReactNode
}

/**
 * Shared frame for every sign-in and password page: CampsPilot "Flutlicht"
 * ground (night surface, floodlight cone, faint chalk lines) with a light
 * card. The club stays recognisable through its logo or initials and name
 * at the top of the card.
 */
export default function AuthShell({ name, logoUrl, initials, product = false, accent, children }: AuthShellProps) {
  const tileStyle = !logoUrl && accent?.strong
    ? ({ '--auth-club': accent.strong, ...(accent.on ? { '--auth-club-on': accent.on } : {}) } as React.CSSProperties)
    : undefined
  return (
    <div className={`${archivo.variable} cp-scope cp-auth`}>
      <svg className="auth-pitch" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
        <rect x="80" y="380" width="1040" height="660" rx="24" />
        <line x1="600" y1="380" x2="600" y2="1040" />
        <circle cx="600" cy="700" r="120" />
      </svg>
      <div className="auth-column">
        <p className="auth-brand">
          <CampsPilotMark width={30} height={20} />
          <span>CampsPilot</span>
        </p>
        <main className="auth-card">
          {name && (product ? (
            <p className="cp-eyebrow auth-eyebrow">{name}</p>
          ) : (
            <div className="auth-id">
              <span className={`auth-logo${logoUrl ? ' has-image' : ''}`} style={tileStyle} aria-hidden="true">
                {logoUrl ? <Image src={logoUrl} alt="" width={40} height={40} unoptimized /> : initials}
              </span>
              <span className="auth-name">{name}</span>
            </div>
          ))}
          {children}
        </main>
        {!product && <p className="auth-foot">Anmeldung und Verwaltung über CampsPilot</p>}
      </div>
    </div>
  )
}
