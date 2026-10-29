import { getSiteUrl } from '../../../lib/seo'

/**
 * Origin for links in auth mails (password reset). Each deployment must link back
 * to itself: Staging previews to the preview, Production to the production domain.
 * Order: explicit NEXT_PUBLIC_SITE_URL, then Vercel system variables, then the SEO default.
 */
export function authRedirectOrigin(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return new URL(explicit).origin
  const host = env.VERCEL_ENV === 'production'
    ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    : env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim()
  if (host && /^[a-z0-9.-]+$/i.test(host)) return `https://${host}`
  return getSiteUrl().origin
}
