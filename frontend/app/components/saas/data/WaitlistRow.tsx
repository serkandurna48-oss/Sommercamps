import { daysSince, de } from '../../../lib/i18n/de'
import type { RegistrationAdmin } from '../../../lib/saasAdminApi'
import { birthYear } from '../commandCenterLogic'

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function WaitlistRow({ registration, position }: { registration: RegistrationAdmin; position: number }) {
  const days = daysSince(registration.created_at)
  return (
    <div
      className="cp-roster-row flex flex-col gap-1.5 border-t px-5 py-3.5 md:flex-row md:items-center md:justify-between md:gap-4"
      style={{ borderColor: 'var(--cp-line-2)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="cp-num cp-label flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
          style={{ background: 'var(--cp-pending-bg)', color: 'var(--cp-pending)', borderColor: 'var(--cp-pending-line)' }}
          aria-label={de.waitlistPage.position(position)}
        >
          {position}
        </span>
        <div className="min-w-0">
          <p className="cp-subheading" style={{ color: 'var(--cp-ink)' }}>
            {registration.child_first_name} {registration.child_last_name}
            <span className="cp-num ml-1.5" style={{ color: 'var(--cp-muted)' }}>
              ({birthYear(registration.child_birth_date)})
            </span>
          </p>
          <p className="cp-chip mt-0.5 truncate" style={{ color: 'var(--cp-muted)' }}>
            {registration.parent_first_name} {registration.parent_last_name} · {registration.parent_email}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-start gap-0.5 pl-10 md:items-end md:pl-0">
        <p className="cp-chip shrink-0" style={{ color: 'var(--cp-pending)' }}>
          {de.waitlistPage.waitingSince(days)}
        </p>
        <p className="cp-chip shrink-0" style={{ color: 'var(--cp-muted)' }}>
          Angemeldet am {formatShortDate(registration.created_at)}
        </p>
      </div>
    </div>
  )
}
