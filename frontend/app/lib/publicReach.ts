/**
 * Whether parents can actually open a club's page.
 *
 * Mirrors the public API (backend_saas/app/tenancy.py resolve_tenant): a club
 * is served only when it is published, approved by CampsPilot and on an
 * active plan. Everything in the admin UI that says "erreichbar" or offers the
 * parent link must use this, not `site_published` alone (prod check 18.11.2026:
 * a published but unapproved club showed "live" while parents got a 404).
 */
export type PublicReachOrg = {
  site_published: boolean
  /** NOT NULL DEFAULT 'approved' in the DB; missing only in old fixtures. */
  review_status?: string | null
  plan_status?: string | null
}

export type PublicReachBlocker = 'unpublished' | 'not_approved' | 'inactive'

const ACTIVE_PLAN_STATUSES = new Set(['pilot', 'active'])

export function publicReachBlocker(org: PublicReachOrg): PublicReachBlocker | null {
  if (!org.site_published) return 'unpublished'
  if ((org.review_status ?? 'approved') !== 'approved') return 'not_approved'
  if (org.plan_status != null && !ACTIVE_PLAN_STATUSES.has(org.plan_status)) return 'inactive'
  return null
}

export function isPubliclyServed(org: PublicReachOrg): boolean {
  return publicReachBlocker(org) === null
}

/** Short reason for a published club that parents still cannot see. */
export function publicReachHint(blocker: PublicReachBlocker | null): string | null {
  if (blocker === 'not_approved') return 'Eltern sehen die Vereinsseite erst nach der Freigabe durch CampsPilot.'
  if (blocker === 'inactive') return 'Eltern sehen die Vereinsseite erst, wenn das Konto wieder aktiv ist.'
  return null
}
