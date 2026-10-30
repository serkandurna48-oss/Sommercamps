import Link from 'next/link'
import type { OrganizationAdmin } from '../../lib/saasAdminApi'
import { submittedOrganizations } from '../reviewChecklist'

export default function ReviewNavLink({ orgs }: { orgs: OrganizationAdmin[] }) {
  const count = submittedOrganizations(orgs).length
  return (
    <Link href="/platform#freigaben" prefetch={false}
      className="cp-focus cp-body inline-flex min-h-11 items-center gap-2"
      style={{ color: 'var(--cp-on-band)' }} aria-label={`Freigaben: ${count} warten auf Freigabe`}>
      Freigaben
      <span className="rounded-[var(--cp-r-chip)] px-2 py-1"
        style={{ color: 'var(--cp-pending)', background: 'var(--cp-pending-bg)' }}>{count}</span>
    </Link>
  )
}
