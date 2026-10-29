import { getSiteUrl } from '../../../lib/seo'

/**
 * Origin for links in auth mails (password reset). Each deployment must link back
 * to itself: Staging previews to the preview, Production to the production domain.
 * Order: Vercel system variables, then NEXT_PUBLIC_SITE_URL, then the SEO default.
 */
export function authRedirectOrigin(env: Record<string, string | undefined> = process.env): string {
  // On Vercel the deployment itself decides: a Staging preview must never send
  // reset links to Production (different Supabase project), even if an SEO
  // canonical NEXT_PUBLIC_SITE_URL is set for all environments.
  if (env.VERCEL_ENV) {
    const host = env.VERCEL_ENV === 'production'
      ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      : env.VERCEL_BRANCH_URL?.trim() || env.VERCEL_URL?.trim()
    if (host && /^[a-z0-9.-]+$/i.test(host)) return `https://${host}`
  }
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return new URL(explicit).origin
  return getSiteUrl().origin
}
