import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { memberPriceText } from '../../../lib/trainingFormat'
import LegalShell from '../LegalShell'
import PublicLoadError from '../PublicLoadError'
import { getPublicOrganization, getPublicTrainingOffers } from '../publicData'
import { neutralTrainingMetadata, trainingListMetadata } from './trainingMetadata'
import './trainingPages.css'

type PageProps = { params: Promise<{ org: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { org: orgSlug } = await params
  try {
    const org = await getPublicOrganization(orgSlug)
    return org ? trainingListMetadata(org) : neutralTrainingMetadata
  } catch {
    return neutralTrainingMetadata
  }
}

/** Öffentliche Liste der veröffentlichten Trainingsangebote eines Vereins. */
export default async function TrainingOffersPage({ params }: PageProps) {
  const { org: orgSlug } = await params
  const [orgOutcome, offersOutcome] = await Promise.allSettled([
    getPublicOrganization(orgSlug),
    getPublicTrainingOffers(orgSlug),
  ])
  if (orgOutcome.status === 'rejected') return <PublicLoadError title="Training gerade nicht erreichbar" message="Die Trainingsangebote konnten nicht geladen werden." />
  const org = orgOutcome.value
  if (!org) notFound()
  if (offersOutcome.status === 'rejected') return <PublicLoadError org={org} title="Training gerade nicht erreichbar" message="Die Trainingsangebote konnten nicht geladen werden." />
  const offers = offersOutcome.value

  return (
    <LegalShell org={org}>
      <main className="tr-col" lang="de">
        <span className="legal-label">{org.name}</span>
        <h1 className="d1">Training buchen</h1>
        <p className="tr-lead">Wählen Sie ein Angebot und anschließend einen freien Termin.</p>
        {offers.length === 0 ? (
          <p className="tr-lead">Aktuell gibt es keine buchbaren Trainingsangebote. Bei Fragen wenden Sie sich an den Verein{org.contact_email ? <>: <a href={`mailto:${org.contact_email}`}>{org.contact_email}</a></> : '.'}</p>
        ) : (
          <ul className="tr-list">
            {offers.map(offer => (
              <li key={offer.slug}>
                <Link className="tr-card" href={`/pilot/${org.slug}/training/${offer.slug}`}>
                  <span className="d3">{offer.title}</span>
                  <span className="tr-meta">{offer.duration_minutes} Minuten{offer.location ? ` · ${offer.location}` : ''}</span>
                  {offer.description && <span className="tr-meta" style={{ whiteSpace: 'pre-line' }}>{offer.description}</span>}
                  <span className="tr-price">{memberPriceText(offer.price_member_cents, offer.price_nonmember_cents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </LegalShell>
  )
}
