import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getValidAccessToken } from '../../lib/supabaseServer'
import { fetchCampsAdmin, fetchOrganizationsAdmin, fetchPlatformStats, type OrganizationAdmin } from '../../lib/saasAdminApi'
import { submittedOrganizations } from '../reviewChecklist'
import OrganizationList from './OrganizationList'
import StatsOverview from './StatsOverview'
import SubmittedOrgsSection from './SubmittedOrgsSection'

async function loadReviewData(organizations: OrganizationAdmin[], token: string) {
  const submitted = submittedOrganizations(organizations)
  const campsByOrg = Object.fromEntries(await Promise.all(submitted.map(async org => [
    org.slug, await fetchCampsAdmin(org.slug, token),
  ])))
  // Serialize one server timestamp so the first client render matches the HTML.
  return { submitted, campsByOrg, loadedAt: Date.now() }
}

export default async function PlatformPage() {
  const token = await getValidAccessToken()
  if (!token) redirect('/platform/login')

  const [organizations, stats] = await Promise.all([fetchOrganizationsAdmin(token), fetchPlatformStats(token)])
  const { submitted, campsByOrg, loadedAt } = await loadReviewData(organizations, token)

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
      <StatsOverview stats={stats} />
      <SubmittedOrgsSection orgs={submitted} campsByOrg={campsByOrg} loadedAt={loadedAt} />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="cp-title" style={{ color: 'var(--cp-ink)' }}>
            Vereine
          </h1>
          <p className="cp-body mt-1" style={{ color: 'var(--cp-muted)' }}>
            {organizations.length === 0
              ? 'Noch kein Verein angelegt.'
              : organizations.length === 1
                ? '1 Verein auf CampsPilot.'
                : `${organizations.length} Vereine auf CampsPilot.`}
          </p>
        </div>
        <Link
          href="/platform/new"
          className="cp-subheading inline-flex min-h-[50px] items-center justify-center rounded-[var(--cp-r-field)] px-5"
          style={{ background: 'var(--cp-ink)', color: '#FFFFFF' }}
        >
          + Neuen Verein anlegen
        </Link>
      </div>

      <OrganizationList organizations={organizations} />
    </main>
  )
}
