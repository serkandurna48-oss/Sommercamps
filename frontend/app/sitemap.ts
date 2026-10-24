import type { MetadataRoute } from 'next'
import { getSiteUrl } from './pilot/[org]/socialMetadata'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl()
  // Der öffentliche Client saasApi.ts bietet keine Vereinsliste. Die Liste in
  // saasAdminApi.ts ist geschützt; Vereins- und Camp-URLs bleiben daher aus.
  return [{ url: new URL('/campspilot', siteUrl).href }]
}
