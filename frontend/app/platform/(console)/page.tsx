import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAdminToken } from '../../lib/adminSession'
import { fetchOrganizationsAdmin, type OrganizationAdmin } from '../../lib/saasAdminApi'

const PLAN_STATUS_LABEL: Record<string, string> = {
  pilot: 'Pilot',
  active: 'Aktiv',
  suspended: 'Pausiert',
  cancelled: 'Gekündigt',
}

const PLAN_STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  pilot: { bg: 'var(--cp-warn-bg, #FDF3E0)', fg: 'var(--cp-warn, #92620A)' },
  active: { bg: 'var(--cp-success-bg, #E3F3E9)', fg: 'var(--cp-success, #1C6B45)' },
  suspended: { bg: 'var(--cp-error-bg)', fg: 'var(--cp-error)' },
  cancelled: { bg: 'var(--cp-line)', fg: 'var(--cp-muted)' },
}

function PlanStatusChip({ status }: { status: string }) {
  const tone = PLAN_STATUS_TONE[status] ?? PLAN_STATUS_TONE.cancelled
  return (
    <span className="cp-chip rounded-[var(--cp-r-chip)] px-2 py-1" style={{ background: tone.bg, color: tone.fg }}>
      {PLAN_STATUS_LABEL[status] ?? status}
    </span>
  )
}

function OrganizationRow({ org }: { org: OrganizationAdmin }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-6"
      style={{ borderColor: 'var(--cp-line)' }}
    >
      <div className="min-w-0">
        <p className="cp-subheading truncate" style={{ color: 'var(--cp-ink)' }}>
          {org.name}
        </p>
        <p className="cp-chip truncate" style={{ color: 'var(--cp-muted)' }}>
          /pilot/{org.slug} · {org.contact_email} · {org.camp_count ?? 0}{' '}
          {org.camp_count === 1 ? 'Camp' : 'Camps'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <PlanStatusChip status={org.plan_status} />
        <Link
          href={`/pilot/${org.slug}/dashboard`}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
        >
          Verwaltung öffnen
        </Link>
        <Link
          href={`/pilot/${org.slug}`}
          className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
          style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-muted)' }}
        >
          Öffentliche Seite
        </Link>
      </div>
    </div>
  )
}

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

      <div className="rounded-[var(--cp-r-card)] border" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
        {organizations.length === 0 ? (
          <p className="cp-body px-4 py-8 text-center" style={{ color: 'var(--cp-muted)' }}>
            Noch keine Vereine — leg den ersten über &bdquo;Neuen Verein anlegen&ldquo; an.
          </p>
        ) : (
          organizations.map(org => <OrganizationRow key={org.slug} org={org} />)
        )}
      </div>
    </main>
  )
}
