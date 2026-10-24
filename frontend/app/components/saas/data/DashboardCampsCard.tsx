import type { CSSProperties, ReactNode } from 'react'
import Link from '../preview/AdminLink'
import type { CampWithStats } from '../dashboardLogic'
import { campStatusLabel, de, formatDateRange } from '../../../lib/i18n/de'

function DashboardCampRow({ entry, orgSlug }: { entry: CampWithStats; orgSlug: string }) {
  const { camp, registeredCount, waitlistCount } = entry
  const draft = camp.status === 'draft'
  const ratio = camp.capacity > 0 ? registeredCount / camp.capacity : 0
  const status = ratio >= 1 ? de.dashboard.fullyBooked : ratio >= 0.9 ? de.dashboard.almostFull : null
  const occupied = de.dashboard.occupiedPlaces(registeredCount, camp.capacity)
  const href = `/pilot/${orgSlug}/camps/${camp.slug}`

  return (
    <li className="flex flex-col gap-4 border-t py-5 md:flex-row md:items-center" style={{ borderColor: 'var(--cp-line-2)' }}>
      <div className="min-w-0 flex-1 break-words">
        <h3 className="cp-subheading">{camp.title}</h3>
        <p className="cp-body mt-1" style={{ color: 'var(--cp-ink-2)' }}>
          {formatDateRange(camp.start_date, camp.end_date)}
        </p>
        <p className="cp-body" style={{ color: 'var(--cp-muted)' }}>{camp.location || de.dashboard.locationMissing}</p>
        {draft && <p className="cp-label mt-2">{de.dashboard.draftHint}</p>}
        {(camp.status === 'closed' || camp.status === 'archived') && <p className="cp-label mt-2">{campStatusLabel[camp.status]}</p>}
      </div>
      {!draft && (
        <div className="w-full min-w-0 flex-1">
          <p className="cp-label cp-num mb-2">{occupied}</p>
          <div
            className="h-1.5 w-full"
            style={{ background: 'var(--cp-line-2)', borderRadius: 'var(--cp-r-bar)' }}
            role="progressbar"
            aria-label={`${camp.title}: ${occupied}`}
            aria-valuemin={0}
            aria-valuenow={Math.min(registeredCount, camp.capacity)}
            aria-valuemax={camp.capacity}
            aria-valuetext={occupied}
          >
            <div className="h-full" style={{ width: `${Math.min(1, Math.max(0, ratio)) * 100}%`, background: 'var(--cp-brand)', borderRadius: 'var(--cp-r-bar)' }} />
          </div>
          {status && <p className="cp-label mt-2" style={{ color: 'var(--cp-ink-2)' }}>{status}</p>}
          {waitlistCount > 0 && <p className="cp-label mt-2" style={{ color: 'var(--cp-muted)' }}>{de.dashboard.waitingPlaces(waitlistCount)}</p>}
        </div>
      )}
      <Link className="cp-focus cp-label inline-flex min-h-11 shrink-0 items-center self-start underline md:self-center" href={draft ? `${href}/konfiguration` : href} aria-label={`${draft ? de.dashboard.publishCamp : de.dashboard.openCamp}: ${camp.title}`}>
        {draft ? de.dashboard.publishCamp : de.dashboard.openCamp}
      </Link>
    </li>
  )
}

export default function DashboardCampsCard({ camps, orgSlug, brandColor, action }: {
  camps: CampWithStats[]
  orgSlug: string
  brandColor: string
  action: ReactNode
}) {
  // Match the dashboard's existing date-only UTC comparison; a camp ending today is still current.
  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...camps].sort((a, b) => a.camp.start_date.localeCompare(b.camp.start_date))
  const published = sorted.filter(({ camp }) => camp.status === 'published')
  const current = published.filter(({ camp }) => camp.end_date >= today)
  const past = published.filter(({ camp }) => camp.end_date < today)
  const drafts = sorted.filter(({ camp }) => camp.status === 'draft')
  const other = sorted.filter(({ camp }) => camp.status === 'closed' || camp.status === 'archived')
  const rows = (entries: CampWithStats[]) => (
    <ul>{entries.map(entry => <DashboardCampRow key={entry.camp.slug} entry={entry} orgSlug={orgSlug} />)}</ul>
  )

  return (
    <section className="cp-card" aria-labelledby="dashboard-camps-title" style={{ '--cp-brand': brandColor } as CSSProperties}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="dashboard-camps-title" className="cp-title">{de.dashboard.yourCamps}</h2>
        {action}
      </div>
      {camps.length === 0 && <p className="cp-body">{de.dashboard.noCamps}</p>}
      {current.length > 0 && rows(current)}
      {past.length > 0 && (
        <details className="mt-4">
          <summary className="cp-focus cp-subheading cursor-pointer py-3">{de.dashboard.pastCamps(past.length)}</summary>
          {rows(past)}
        </details>
      )}
      {drafts.length > 0 && (
        <section className="mt-4" aria-labelledby="dashboard-drafts-title">
          <h3 id="dashboard-drafts-title" className="cp-subheading py-3">{de.dashboard.drafts}</h3>
          {rows(drafts)}
        </section>
      )}
      {other.length > 0 && (
        <details className="mt-4">
          <summary className="cp-focus cp-subheading cursor-pointer py-3">{de.dashboard.otherCamps(other.length)}</summary>
          {rows(other)}
        </details>
      )}
    </section>
  )
}
