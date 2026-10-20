import Image from 'next/image'
import type { OrganizationPublic } from '../../lib/saasApi'
import { orgShortCode } from '../../lib/parentFlowFormat'

export default function PublicFooter({ org }: { org: OrganizationPublic }) {
  const short = orgShortCode(org.name)
  return (
    <footer className="foot">
      <div className="foot-top">
        <div className="foot-left">
          <span className="foot-logo">
            {org.logo_url ? (
              <Image
                src={org.logo_url}
                alt={org.name}
                width={28}
                height={28}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : short}
          </span>
          <span className="foot-name">{org.name}</span>
          <a href={`mailto:${org.contact_email}`} className="foot-email">
            {org.contact_email}
          </a>
        </div>
        <nav className="foot-links" aria-label="Rechtliche Hinweise">
          <a href={`/pilot/${org.slug}/impressum`}>Impressum</a>
          <a href={`/pilot/${org.slug}/datenschutz`}>Datenschutz</a>
          <a href={`/pilot/${org.slug}/teilnahmebedingungen`}>Teilnahmebedingungen</a>
        </nav>
      </div>
      <span className="by">
        <svg width="23" height="16" viewBox="0 0 112 76" aria-hidden="true">
          <rect x="6" y="6" width="100" height="64" rx="10" fill="none" stroke="currentColor" strokeWidth="6" />
          <path d="M56 6V33M56 43V70" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="56" cy="38" r="15" fill="none" stroke="currentColor" strokeWidth="6" />
          <circle cx="56" cy="38" r="4.5" fill="#D4581F" />
        </svg>
        Anmeldung und Verwaltung über CampsPilot
      </span>
    </footer>
  )
}
