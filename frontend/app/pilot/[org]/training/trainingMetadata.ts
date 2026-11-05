import type { Metadata } from 'next'
import type { OrganizationPublic, TrainingOfferPublic } from '../../../lib/saasApi'
import { pageMetadata, shortDescription } from '../../../lib/seo'
import { memberPriceText } from '../../../lib/trainingFormat'
import { getSiteUrl } from '../socialMetadata'

/** Link-Vorschau für geteilte Trainingslinks; bewusst ohne eigenes OG-Bild (später). */
function build(path: string, title: string, text: string): Metadata {
  const metadata = pageMetadata(path, title, text, undefined, getSiteUrl())
  metadata.robots = { index: false, follow: true }
  return metadata
}

export function trainingListMetadata(org: Pick<OrganizationPublic, 'slug' | 'name'>): Metadata {
  return build(
    `/pilot/${encodeURIComponent(org.slug)}/training`,
    `Training buchen – ${org.name}`,
    `Einzel- und Gruppentraining bei ${org.name}: Termin auswählen und online buchen.`,
  )
}

export function trainingOfferMetadata(
  org: Pick<OrganizationPublic, 'slug' | 'name'>,
  offer: Pick<TrainingOfferPublic, 'slug' | 'title' | 'description' | 'price_member_cents' | 'price_nonmember_cents'>,
): Metadata {
  const text = offer.description?.trim()
    || `${offer.title} bei ${org.name}. ${memberPriceText(offer.price_member_cents, offer.price_nonmember_cents)}.`
  return build(
    `/pilot/${encodeURIComponent(org.slug)}/training/${encodeURIComponent(offer.slug)}`,
    `${offer.title} – ${org.name} | Buchung`,
    shortDescription(text),
  )
}

export const neutralTrainingMetadata: Metadata = {
  title: 'CampsPilot',
  description: 'Training buchen.',
  robots: { index: false },
  openGraph: { title: 'CampsPilot', description: 'Training buchen.', locale: 'de_DE', type: 'website', images: [] },
  twitter: { title: 'CampsPilot', images: [] },
}
