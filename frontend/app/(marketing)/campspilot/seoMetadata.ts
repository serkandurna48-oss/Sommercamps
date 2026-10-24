import type { Metadata } from 'next'
import { getSiteUrl } from '../../pilot/[org]/socialMetadata'

export async function marketingMetadata(
  path: string,
  title: string,
  description: string,
  index = false,
): Promise<Metadata> {
  const siteUrl = await getSiteUrl()
  const url = new URL(path, siteUrl).href

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: { canonical: url },
    robots: { index, follow: true },
    openGraph: { title, description, url, type: 'website', locale: 'de_DE', siteName: 'CampsPilot' },
  }
}
