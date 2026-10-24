import type { Metadata } from 'next'
import { headers } from 'next/headers'
import type { OrganizationPublic } from '../../lib/saasApi'
import { getClubAssets } from './clubAssets'

export async function getSiteUrl(): Promise<URL> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return new URL(process.env.NEXT_PUBLIC_SITE_URL)

  // This worktree has no production site URL constant. Use the current origin.
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host')?.split(',')[0].trim()
    || requestHeaders.get('host')
  if (!host) throw new Error('Missing request host')
  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0].trim()
    || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https')
  return new URL(`${protocol === 'http' ? 'http' : 'https'}://${host}`)
}

export function clubDescription(org: OrganizationPublic): string {
  const text = org.intro_text?.trim()
  if (!text) return `Anmeldung zu den Fußballcamps von ${org.name}`
  if (text.length <= 155) return text

  let excerpt = text.slice(0, 155)
  // Keep the last word only if the next character is a word boundary.
  if (!/\s/.test(text[155])) excerpt = excerpt.replace(/\S+$/, '')
  return `${excerpt.trimEnd()}…`
}

export function clubMetadata(org: OrganizationPublic, siteUrl: URL): Metadata {
  const title = `Camps 2027 – ${org.name}`
  const description = clubDescription(org)
  const hero = org.hero_image_url || getClubAssets(org.slug)?.heroImage
  const imageUrl = new URL(hero || `/pilot/${encodeURIComponent(org.slug)}/opengraph-image`, siteUrl).href
  const images = [{
    url: imageUrl,
    alt: `Fußballcamps 2027 – ${org.name}`,
    ...(!hero && { width: 1200, height: 630 }),
  }]

  return {
    metadataBase: siteUrl,
    title,
    description,
    openGraph: { title, description, type: 'website', locale: 'de_DE', siteName: 'CampsPilot', images },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export const neutralMetadata: Metadata = {
  title: 'CampsPilot',
  description: 'Fußballcamps entdecken und anmelden.',
  openGraph: { title: 'CampsPilot', images: [] },
  twitter: { title: 'CampsPilot', images: [] },
}
