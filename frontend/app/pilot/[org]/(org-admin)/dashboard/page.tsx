import Link from 'next/link'
import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import { buildTasks, computeCampStats, pickNextCamp } from '../../../../components/saas/dashboardLogic'
import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import TaskCard from '../../../../components/saas/tasks/TaskCard'
import TaskRow from '../../../../components/saas/tasks/TaskRow'
import CampRow from '../../../../components/saas/data/CampRow'
import EmptyState from '../../../../components/saas/state/EmptyState'
import { orgTabs } from '../../../../components/saas/navTabs'
import { de, daysUntil } from '../../../../lib/i18n/de'

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const nextCamp = pickNextCamp(campsWithStats)
  const tasks = buildTasks(campsWithStats)
  const [firstTask, ...restTasks] = tasks

  const brand = computeBrandTokens(org.primary_color)
  const tabs = orgTabs(orgSlug)

  return (
    <>
      <MatchdayBand
        variant="full"
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
                  { label: 'Tage', value: String(days), numericValue: days },
                  {
                    label: de.dashboard.spotsLabel,
                    value: `${nextCamp.registeredCount}/${nextCamp.camp.capacity}`,
                    bar: nextCamp.camp.capacity > 0 ? nextCamp.registeredCount / nextCamp.camp.capacity : 0,
                    barColor: brand.brand,
                  },
                  { label: de.dashboard.openPaymentsLabel, value: String(nextCamp.openPaymentsCount), numericValue: nextCamp.openPaymentsCount },
                  { label: de.dashboard.waitlistLabel, value: String(nextCamp.waitlistCount), numericValue: nextCamp.waitlistCount },
                ]
              })()
            : []
        }
        tabs={tabs}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <section className="mb-12">
          <h2 className="cp-title mb-4">{de.dashboard.upNext}</h2>
          {firstTask ? (
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
              className="cp-chip rounded-[var(--cp-r-chip)] border px-3 py-2"
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
