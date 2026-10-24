import type { MetadataRoute } from 'next'
import { getSiteUrl } from './pilot/[org]/socialMetadata'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/platform',
        // (org-admin) ist eine Routengruppe, kein Bestandteil öffentlicher URLs.
        '/pilot/*/anmeldungen',
        '/pilot/*/aufgaben',
        '/pilot/*/camps',
        '/pilot/*/dashboard',
        '/pilot/*/einrichtung',
        '/pilot/*/export',
        '/pilot/*/hilfe',
        '/pilot/*/konfiguration',
        '/pilot/*/warteliste',
        '/pilot/*/zahlungen',
        '/pilot/*/login',
        '/dev',
        '/api',
      ],
    },
    sitemap: new URL('/sitemap.xml', siteUrl).href,
  }
}
