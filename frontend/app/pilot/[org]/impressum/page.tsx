import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { fetchOrganization } from '../../../lib/saasApi'

/**
 * MVP-Oberflächenauftrag, Blocker "Impressum/Datenschutz sind hart auf KSV
 * Baunatal verdrahtet": bis hierhin verlinkte JEDER Verein auf der SaaS-
 * Plattform (ParentFlow.tsx) auf die globalen, mit KSV-Rechtsdaten
 * codierten Seiten /impressum und /datenschutz (die bleiben unverändert —
 * sie gehören zum separaten, alten `backend/`-System, siehe root
 * CLAUDE.md). Diese Seite hier ist neu und pro Verein: zeigt AUSSCHLIESS-
 * LICH echte Felder dieses Vereins (organizations.legal_address/
 * legal_name/contact_person_name/contact_email/contact_phone). Fehlt ein
 * Feld, erscheint ein ehrlicher Hinweis — NIE ein Fallback auf einen
 * anderen Verein oder erfundener Text (siehe docs/saas/legal-data-needed.md
 * für das, was der jeweilige Verein noch liefern muss).
 */
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
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link href={`/pilot/${orgSlug}`} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
            ← Zurück zu {org.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Impressum</h1>
        <p className="mb-10 text-sm text-gray-500">Angaben gemäß § 5 TMG</p>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Anbieter</h2>
            <address className="not-italic">
              <p className="font-medium">{entityName}</p>
              {org.legal_address ? (
                org.legal_address.split('\n').map((line, i) => <p key={i}>{line}</p>)
              ) : (
                <p className="italic text-gray-400">Anschrift noch nicht angegeben.</p>
              )}
            </address>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Kontakt</h2>
            {org.contact_person_name && <p>Ansprechpartner: {org.contact_person_name}</p>}
            <p>
              E-Mail:{' '}
              <a href={`mailto:${org.contact_email}`} className="underline hover:text-gray-900">
                {org.contact_email}
              </a>
            </p>
            {org.contact_phone && <p>Telefon: {org.contact_phone}</p>}
          </section>

          {!org.legal_address && (
            <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Dieser Verein hat noch keine vollständige Anschrift für das Impressum hinterlegt.
              Vereinsadmin: unter „Konfiguration&rdquo; → „Anschrift (für Impressum/Datenschutz)&rdquo; ergänzen.
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
