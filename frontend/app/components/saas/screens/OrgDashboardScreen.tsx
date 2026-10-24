import Link from '../preview/AdminLink'
import TodayRegistrations from '../data/TodayRegistrations'
import { todayRegistrations } from '../registrationDates'
import { ButtonLink } from '../ui/Button'
import { computeBrandTokens } from '../brandPipeline'
import { buildTasks, computeCampStats, pickNextCamp } from '../dashboardLogic'
import { computeOnboardingSteps, missingRequiredOrgFields } from '../onboardingSteps'
import MatchdayBand from '../shell/MatchdayBand'
import TaskCard from '../tasks/TaskCard'
import TaskRow from '../tasks/TaskRow'
import DashboardCampsCard from '../data/DashboardCampsCard'
import OnboardingCard from '../state/OnboardingCard'
import LaunchSuccessCard from '../state/LaunchSuccessCard'
import SuccessNote from '../state/SuccessNote'
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

  const { step3Done } = computeOnboardingSteps(org, camps)
  const showCard = !step3Done
  const missingFields = step3Done ? missingRequiredOrgFields(org) : []
  const publishedCamps = camps.filter(c => c.status === 'published')
  const totalRegistrations = registrationsByCamp.reduce((sum, r) => sum + r.length, 0)
  const showLaunchSuccess = publishedCamps.length === 1 && totalRegistrations === 0

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
        {!showCard && <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} />}

        {showCard ? (
          <section className="mb-12">
            <OnboardingCard orgSlug={orgSlug} org={org} camps={camps} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
          </section>
        ) : (
          <section className="mb-12">
            <h2 className="cp-title mb-4">{de.dashboard.upNext}</h2>
            {missingFields.length > 0 && (
              <div
                className="cp-body mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--cp-r-card)] border px-4 py-3"
                style={{ borderColor: 'var(--cp-pending-line)', background: 'var(--cp-surface)' }}
              >
                <span aria-hidden style={{ color: 'var(--cp-pending)' }}>!</span>
                <span>{de.onboarding.missingFieldsHint(missingFields)}</span>
                <Link href={`/pilot/${orgSlug}/konfiguration`} className="cp-focus min-h-[44px] inline-flex items-center underline">{de.onboarding.missingFieldsAction}</Link>
              </div>
            )}
            {firstTask ? (
              <div className="flex flex-col gap-4">
                <TaskCard task={firstTask} orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
                {restTasks.length > 0 && (
                  <div className="flex flex-col gap-4">
                    {restTasks.map(t => (
                      <TaskRow key={t.id} task={t} orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
                    ))}
                  </div>
                )}
              </div>
            ) : showLaunchSuccess ? (
              <LaunchSuccessCard orgSlug={orgSlug} brandStrong={brand.brandStrong} brandOn={brand.brandOn} />
            ) : (
              <div className="cp-card" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
                <SuccessNote>{de.onboarding.liveLabel}</SuccessNote>
                <p className="cp-body mt-2 break-all" style={{ color: 'var(--cp-ink-2)' }}>/pilot/{orgSlug}</p>
                <div className="mt-4">
                  <ButtonLink href={`/pilot/${orgSlug}`} variant="primary" brandStrong={brand.brandStrong} brandOn={brand.brandOn}>
                    {de.onboarding.liveOpen}
                  </ButtonLink>
                </div>
              </div>
            )}
          </section>
        )}

        <DashboardCampsCard camps={campsWithStats} orgSlug={orgSlug} brandColor={brand.brand} action={
            <ButtonLink
              href={`/pilot/${orgSlug}/camps/new`}
              variant={showCard ? 'secondary' : 'primary'} brandStrong={brand.brandStrong} brandOn={brand.brandOn}
            >
              + Camp anlegen
            </ButtonLink>
        } />
      </main>
    </>
  )
}
