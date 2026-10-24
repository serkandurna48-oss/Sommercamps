import type { MetadataRoute } from 'next'
import { canonicalUrl } from './lib/seo'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Der öffentliche Client saasApi.ts bietet keine Vereinsliste. Die Liste in
  // saasAdminApi.ts ist geschützt; Vereins- und Camp-URLs bleiben daher aus.
  // Legal placeholders and the registration form remain noindex.
  return [{ url: canonicalUrl('/campspilot') }]
}
