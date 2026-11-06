import Link from '../preview/AdminLink'
import { formatDateRange, formatRelativeDateTime, paymentStatusLabel, registrationStatusLabel } from '../../../lib/i18n/de'
import { type TodayEntry } from '../registrationDates'
import StatusChip, { PAYMENT_STATUS_TONE, REGISTRATION_STATUS_TONE } from './StatusChip'
import { ButtonLink } from '../ui/Button'
import RowOverflow from '../ui/RowOverflow'

/** Dashboard card: the three latest arrivals as compact rows (same pattern as "Nächste Termine"). */
function TodayCompact({ entries, orgSlug, className }: { entries: TodayEntry[]; orgSlug: string; className: string }) {
  return (
    <section className={`${className} cp-card cp-card-list`} aria-labelledby="today-registrations">
      <div className="cp-card-head">
        <h2 id="today-registrations" className="cp-heading">Heute neu: {entries.length} Anmeldungen</h2>
        <Link href={`/pilot/${orgSlug}/anmeldungen`} prefetch={false} className="cp-focus cp-card-link" aria-label="Alle neuen Anmeldungen">Alle</Link>
      </div>
      {entries.length === 0 ? (
        <p className="cp-body cp-dash-pad" style={{ color: 'var(--cp-muted)' }}>Heute noch keine neuen Anmeldungen</p>
      ) : (
        <ul>
          {entries.slice(0, 3).map(({ registration, camp }) => (
            <li key={registration.registration_token}>
              <Link href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`} prefetch={false} className="cp-focus cp-dash-row cp-dash-link">
                <span className="min-w-0 flex-1">
                  <span className="cp-label block truncate" style={{ color: 'var(--cp-ink)' }}>{registration.child_first_name} {registration.child_last_name}</span>
                  <span className="cp-hint block truncate">{camp.title} · <time dateTime={registration.created_at}>{formatRelativeDateTime(registration.created_at)}</time></span>
                </span>
                <span className="shrink-0">
                  {registration.status === 'waitlist' || registration.status === 'cancelled'
                    ? <StatusChip tone={REGISTRATION_STATUS_TONE[registration.status]} label={registrationStatusLabel[registration.status]} />
                    : <StatusChip tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'} label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status} />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function TodayRegistrations({ entries, orgSlug, fullList = false, className = 'mb-8' }: { entries: TodayEntry[]; orgSlug: string; fullList?: boolean; className?: string }) {
  if (!fullList) return <TodayCompact entries={entries} orgSlug={orgSlug} className={className} />
  return (
    <section className={`${className} cp-card`} style={{ background: 'var(--cp-surface)', borderColor: 'var(--cp-line)' }} aria-labelledby="today-registrations">
      <h2 id="today-registrations" className="cp-heading">Heute neu: {entries.length} Anmeldungen</h2>
      {entries.length === 0 ? (
        <p className="cp-body mt-3">Heute noch keine neuen Anmeldungen</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map(({ registration, camp }) => (
            <li key={registration.registration_token} className="cp-body cp-today-row cp-mobile-card break-words">
              <Link className="cp-desktop-only inline-block min-h-[44px] py-2 underline" href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>
                {registration.child_first_name} {registration.child_last_name} · {camp.title} · <time dateTime={registration.created_at}>{formatRelativeDateTime(registration.created_at)}</time>
              </Link>
              <div className="cp-mobile-only cp-today-card">
                <strong>{registration.child_first_name} {registration.child_last_name}</strong>
                <p className="cp-camp-date">{camp.title} · {formatDateRange(camp.start_date, camp.end_date)}</p>
                <p>Eingang: <time dateTime={registration.created_at}>{formatRelativeDateTime(registration.created_at)}</time></p>
                <StatusChip tone={PAYMENT_STATUS_TONE[registration.payment_status] ?? 'neutral'} label={paymentStatusLabel[registration.payment_status] ?? registration.payment_status} />
                {(registration.status === 'waitlist' || registration.status === 'cancelled') && <StatusChip
                  tone={REGISTRATION_STATUS_TONE[registration.status]} label={registrationStatusLabel[registration.status]} />}
                <div className="cp-mobile-actions">
                  <ButtonLink href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>Anmeldungen ansehen</ButtonLink>
                  <RowOverflow label={`Weitere Aktionen für ${registration.child_first_name} ${registration.child_last_name}`}>
                    <ButtonLink href={`mailto:${registration.parent_email}`}>Eltern kontaktieren</ButtonLink>
                  </RowOverflow>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
