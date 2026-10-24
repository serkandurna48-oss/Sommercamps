import type { Metadata } from 'next'

export function getSiteUrl(): URL {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://campspilot.de')
}

export function canonicalUrl(path: string, siteUrl = getSiteUrl()): string {
  const url = new URL(path, siteUrl)
  url.hash = ''
  return url.href
}

/** Reserve one character for the ellipsis and never split a word. */
export function shortDescription(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 155) return normalized
  let excerpt = normalized.slice(0, 154)
  if (normalized[154] !== ' ') excerpt = excerpt.replace(/\S+$/, '')
  return `${excerpt.trimEnd()}…`
}

export function pageMetadata(path: string, title: string, text: string, image?: string, siteUrl = getSiteUrl()): Metadata {
  const description = shortDescription(text)
  const url = canonicalUrl(path, siteUrl)
  const images = image ? [{ url: new URL(image, siteUrl).href, alt: title }] : []
  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, locale: 'de_DE', type: 'website', siteName: 'CampsPilot', images },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}
