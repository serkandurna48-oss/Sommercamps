import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'
import LegalShell from '../LegalShell'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Teilnahmebedingungen – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function OrgTeilnahmebedingungenPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const entityName = org.legal_name ?? org.name

  return (
    <LegalShell org={org}>
      <main className="legal-col" lang="de">
        <span className="legal-label">{entityName}</span>
        <h1 className="legal-h1">Teilnahme&shy;bedingungen</h1>

        <nav className="legal-toc" aria-label="Inhaltsverzeichnis">
          <p className="legal-toc-label">Inhalt</p>
          <ol>
            <li><a href="#tb-1">Geltungsbereich</a></li>
            <li><a href="#tb-2">Anmeldung</a></li>
            <li><a href="#tb-3">Zahlung</a></li>
          </ol>
        </nav>

        <div className="legal-body">
          <section id="tb-1">
            <h2>1. Geltungsbereich</h2>
            <p>
              Diese Seite beschreibt den Ablauf für Anmeldungen zu Fußball-Feriencamps von{' '}
              {entityName} über das CampsPilot-Anmeldesystem.
            </p>
          </section>

          <section id="tb-2">
            <h2>2. Anmeldung</h2>
            <p>
              Die Anmeldung erfolgt ausschließlich über das Online-Formular. Nach Eingang der
              vollständigen Anmeldung wird eine Bestätigung per E-Mail verschickt. Die Teilnahme
              ist auf die angegebene Altersgruppe beschränkt.
            </p>
            <p>
              Plätze werden in der Reihenfolge der vollständig eingegangenen Anmeldungen vergeben.
              Bei ausgebuchten Camps besteht die Möglichkeit, sich auf die Warteliste setzen zu
              lassen.
            </p>
          </section>

          <section id="tb-3">
            <h2>3. Zahlung</h2>
            <p>
              Bei einem festen Platz stehen Betrag und Zahlungsdetails in der Bestätigungs-E-Mail;
              ist dort keine Bankverbindung angegeben, sendet {entityName} die Zahlungsdetails
              direkt. Auf der Warteliste ist noch keine Zahlung fällig.
            </p>
          </section>

          <p>
            Es gelten die Teilnahme-, Storno- und Haftungsbedingungen von {entityName}.{' '}
            Bei Fragen:{' '}
            <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
            {org.contact_phone ? ` oder ${org.contact_phone}` : ''}.
          </p>
        </div>
      </main>
    </LegalShell>
  )
}
