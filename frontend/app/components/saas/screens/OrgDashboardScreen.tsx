import TodayRegistrations from '../data/TodayRegistrations'
import { todayRegistrations } from '../registrationDates'
import { ButtonLink } from '../ui/Button'
import { computeBrandTokens } from '../brandPipeline'
import { buildTasks, computeCampStats, pickNextCamp } from '../dashboardLogic'
import MatchdayBand from '../shell/MatchdayBand'
import TaskCard from '../tasks/TaskCard'
import TaskRow from '../tasks/TaskRow'
import CampRow from '../data/CampRow'
import EmptyState from '../state/EmptyState'
import { orgTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'
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
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={nextCamp ? nextCamp.camp.title : de.dashboard.noUpcomingCamp}
        subtitle={
          nextCamp
            ? formatDateRange(nextCamp.camp.start_date, nextCamp.camp.end_date)
            : de.dashboard.noUpcomingCampHint
        }
        metrics={
          nextCamp
            ? (() => {
                return [
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
        <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} />
        <section className="mb-12">
          <h2 className="cp-title mb-4">{de.dashboard.upNext}</h2>
          {camps.length === 0 ? (
            <div className="rounded-[var(--cp-r-card)] border p-6" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
              <h3 className="cp-heading">Dein erstes Camp vorbereiten</h3>
              <p className="cp-body mt-2">Lege dein erstes Camp an und bereite die Anmeldung für die Eltern vor.</p>
              <ButtonLink href={`/pilot/${orgSlug}/camps/new`} variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn} className="mt-4">Camp anlegen</ButtonLink>
            </div>
          ) : firstTask ? (
            <div className="flex flex-col gap-3">
              <TaskCard task={firstTask} orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
              {restTasks.length > 0 && (
                <div className="flex flex-col gap-3">
                  {restTasks.map(t => (
                    <TaskRow key={t.id} task={t} orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
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
            <ButtonLink
              href={`/pilot/${orgSlug}/camps/new`}
              variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}
            >
              + Camp anlegen
            </ButtonLink>
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
