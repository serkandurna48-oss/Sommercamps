import type { Metadata } from 'next'
import type { CampPublic, OrganizationPublic } from '../../lib/saasApi'
import { pageMetadata, shortDescription } from '../../lib/seo'
import { getClubAssets } from './clubAssets'

export { getSiteUrl } from '../../lib/seo'

export function clubDescription(org: OrganizationPublic): string {
  return shortDescription(org.intro_text?.trim() || `Anmeldung zu den Fußballcamps von ${org.name}`)
}

export function clubMetadata(org: OrganizationPublic, siteUrl: URL, camp?: CampPublic): Metadata {
  const title = camp ? `${camp.title} – ${org.name} | Anmeldung` : `Fußballcamps – ${org.name} | Anmeldung`
  const description = camp
    ? camp.description?.trim() || `Informationen und Anmeldung zu ${camp.title} von ${org.name}.`
    : clubDescription(org)
  const path = `/pilot/${encodeURIComponent(org.slug)}`
  const image = camp?.image_url?.trim() || org.logo_url?.trim() || org.hero_image_url?.trim() || getClubAssets(org.slug)?.heroImage
  const metadata = pageMetadata(
    camp ? `${path}?camp=${encodeURIComponent(camp.slug)}` : path,
    title, description, image || `${path}/opengraph-image`, siteUrl,
  )
  if (!image) {
    const images = [{ url: new URL(`${path}/opengraph-image`, siteUrl).href, alt: title, width: 1200, height: 630 }]
    metadata.openGraph = { ...metadata.openGraph, images }
    metadata.twitter = { ...metadata.twitter, images }
  }
  metadata.robots = { index: true, follow: true }
  return metadata
}

export const neutralMetadata: Metadata = {
  title: 'CampsPilot',
  description: 'Fußballcamps entdecken und anmelden.',
  robots: { index: false },
  openGraph: { title: 'CampsPilot', description: 'Fußballcamps entdecken und anmelden.', locale: 'de_DE', type: 'website', images: [] },
  twitter: { title: 'CampsPilot', images: [] },
}
