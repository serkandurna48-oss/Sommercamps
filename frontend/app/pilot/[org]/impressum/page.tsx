import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'
import LegalShell from '../LegalShell'

export async function generateMetadata({ params }: { params: Promise<{ org: string }> }): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await fetchOrganization(orgSlug)
    return { title: org ? `Impressum – ${org.name}` : 'CampsPilot' }
  } catch {
    return { title: 'CampsPilot' }
  }
}

export default async function OrgImpressumPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const org = await fetchOrganization(orgSlug)
  if (!org) notFound()

  const entityName = org.legal_name ?? org.name

  return (
    <LegalShell org={org}>
      <main className="legal-col" lang="de">
        <span className="legal-label">Angaben gemäß § 5 DDG</span>
        <h1 className="legal-h1">Impressum</h1>

        <div className="legal-body">
          <section>
            <h2>Anbieter</h2>
            <address>
              <p style={{ fontWeight: 600 }}>{entityName}</p>
              {org.legal_address ? (
                org.legal_address.split('\n').map((line, i) => <p key={i}>{line}</p>)
              ) : (
                <p style={{ fontStyle: 'italic', opacity: 0.6 }}>Anschrift noch nicht angegeben.</p>
              )}
            </address>
          </section>

          <section>
            <h2>Kontakt</h2>
            {org.contact_person_name && <p>Ansprechpartner: {org.contact_person_name}</p>}
            <p>
              E-Mail:{' '}
              <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a>
            </p>
            {org.contact_phone && <p>Telefon: {org.contact_phone}</p>}
          </section>

          {!org.legal_address && (
            <p className="legal-notice">
              Dieser Verein hat noch keine vollständige Anschrift für das Impressum hinterlegt.
              Vereinsadmin: unter „Konfiguration“ → „Anschrift (für Impressum/Datenschutz)“ ergänzen.
            </p>
          )}
        </div>
      </main>
    </LegalShell>
  )
}
