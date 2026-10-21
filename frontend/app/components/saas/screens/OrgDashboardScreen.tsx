import TodayRegistrations from '../data/TodayRegistrations'
import { todayRegistrations } from '../registrationDates'
import Link from '../preview/AdminLink'
import { computeBrandTokens } from '../brandPipeline'
import { buildTasks, computeCampStats, pickNextCamp } from '../dashboardLogic'
import MatchdayBand from '../shell/MatchdayBand'
import TaskCard from '../tasks/TaskCard'
import TaskRow from '../tasks/TaskRow'
import CampRow from '../data/CampRow'
import EmptyState from '../state/EmptyState'
import { orgTabs } from '../navTabs'
import { de, daysUntil } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'

export default function OrgDashboardScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const nextCamp = pickNextCamp(campsWithStats)
  const tasks = buildTasks(campsWithStats)
  const [firstTask, ...restTasks] = tasks

  const brand = computeBrandTokens(org.primary_color)
  const tabs = orgTabs(orgSlug)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        eyebrow={nextCamp ? de.dashboard.nextCamp : undefined}
        title={nextCamp ? nextCamp.camp.title : de.dashboard.noUpcomingCamp}
        subtitle={
          nextCamp
            ? `${new Date(`${nextCamp.camp.start_date}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}–${new Date(`${nextCamp.camp.end_date}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: 'long' })}`
            : de.dashboard.noUpcomingCampHint
        }
        metrics={
          nextCamp
            ? (() => {
                const days = Math.max(0, daysUntil(nextCamp.camp.start_date))
                return [
                  {
                    label: de.dashboard.spotsLabel,
                    value: `${nextCamp.registeredCount}/${nextCamp.camp.capacity}`,
                    bar: nextCamp.camp.capacity > 0 ? nextCamp.registeredCount / nextCamp.camp.capacity : 0,
                    barColor: brand.brand,
                    hero: true,
                  },
                  { label: de.dashboard.openPaymentsLabel, value: String(nextCamp.openPaymentsCount), numericValue: nextCamp.openPaymentsCount },
                  { label: de.dashboard.waitlistLabel, value: String(nextCamp.waitlistCount), numericValue: nextCamp.waitlistCount },
                  { label: 'Tage bis Camp', value: String(days), numericValue: days },
                ]
              })()
            : []
        }
        tabs={tabs}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} />
        <section className="mb-12">
          <h2 className="cp-title mb-4">{de.dashboard.upNext}</h2>
          {camps.length === 0 ? (
            <div className="rounded-[var(--cp-r-card)] border p-6" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
              <h3 className="cp-heading">Dein erstes Camp vorbereiten</h3>
              <p className="cp-body mt-2">Lege dein erstes Camp an und bereite die Anmeldung für die Eltern vor.</p>
              <Link href={`/pilot/${orgSlug}/camps/new`} className="cp-focus cp-label mt-4 inline-flex min-h-[48px] min-w-[44px] items-center rounded-full px-5" style={{ background: brand.brandStrong, color: brand.brandOn }}>Camp anlegen</Link>
            </div>
          ) : firstTask ? (
            <div className="flex flex-col gap-3">
              <TaskCard task={firstTask} orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
              {restTasks.length > 0 && (
                <div className="rounded-[var(--cp-r-card)] border px-5" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
                  {restTasks.map(t => (
                    <TaskRow key={t.id} task={t} orgSlug={orgSlug} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState title={de.tasks.allDone} />
          )}
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="cp-title">{de.dashboard.allCamps}</h2>
            <Link
              href={`/pilot/${orgSlug}/camps/new`}
              className="cp-focus inline-flex min-h-[44px] min-w-[44px] items-center cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
              style={{ borderColor: 'var(--cp-field-line)', color: 'var(--cp-ink)' }}
            >
              + Camp anlegen
            </Link>
          </div>
          {campsWithStats.length === 0 ? (
            <EmptyState title={de.dashboard.noCamps} />
          ) : (
            <div className="cp-roster" style={{ borderLeft: `3px solid ${brand.brand}` }}>
              {campsWithStats.map(c => (
                <CampRow
                  key={c.camp.slug}
                  orgSlug={orgSlug}
                  camp={c.camp}
                  registeredCount={c.registeredCount}
                  brandColor={brand.brand}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  )
}
