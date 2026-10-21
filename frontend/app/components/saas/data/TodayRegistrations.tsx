import Link from '../preview/AdminLink'
import { registrationTime, type TodayEntry } from '../registrationDates'

export default function TodayRegistrations({ entries, orgSlug, fullList = false }: { entries: TodayEntry[]; orgSlug: string; fullList?: boolean }) {
  return (
    <section className="mb-8 rounded-[var(--cp-r-card)] border p-4 md:p-6" style={{ background: 'var(--cp-surface)', borderColor: 'var(--cp-line)' }} aria-labelledby="today-registrations">
      <h2 id="today-registrations" className="cp-heading">Heute neu: {entries.length} Anmeldungen</h2>
      {entries.length === 0 ? (
        <p className="cp-body mt-3">Heute noch keine neuen Anmeldungen</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {(fullList ? entries : entries.slice(0, 3)).map(({ registration, camp }) => (
            <li key={registration.registration_token} className="cp-body break-words">
              <Link className="inline-block min-h-[44px] py-2 underline" href={`/pilot/${orgSlug}/camps/${camp.slug}?sort=newest`}>
                {registration.child_first_name} {registration.child_last_name} · {camp.title} · <time dateTime={registration.created_at}>heute {registrationTime(registration.created_at)}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {!fullList && <Link className="cp-label mt-2 inline-flex min-h-[44px] items-center underline" href={`/pilot/${orgSlug}/anmeldungen`}>Alle neuen Anmeldungen</Link>}
    </section>
  )
}
