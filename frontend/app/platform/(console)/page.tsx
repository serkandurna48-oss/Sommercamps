import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAdminToken } from '../../lib/adminSession'
import { fetchOrganizationsAdmin } from '../../lib/saasAdminApi'
import OrganizationList from './OrganizationList'

export default async function PlatformPage() {
  const token = await getAdminToken()
  if (!token) redirect('/platform/login')

  const organizations = await fetchOrganizationsAdmin(token)

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
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
