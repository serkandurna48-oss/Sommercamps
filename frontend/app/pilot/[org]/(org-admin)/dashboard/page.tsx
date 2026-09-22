import { redirect } from 'next/navigation'
import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import { buildTasks, computeCampStats, pickNextCamp } from '../../../../components/saas/dashboardLogic'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import TaskCard from '../../../../components/saas/tasks/TaskCard'
import TaskRow from '../../../../components/saas/tasks/TaskRow'
import CampRow from '../../../../components/saas/data/CampRow'
import EmptyState from '../../../../components/saas/state/EmptyState'
import { de, daysUntil } from '../../../../lib/i18n/de'
import { getAdminToken } from '../../../../lib/adminSession'
import { AdminAuthError, fetchCampsAdmin, fetchRegistrationsAdmin } from '../../../../lib/saasAdminApi'
import { fetchOrganization } from '../../../../lib/saasApi'

const ORG_TABS = [
  { label: 'Übersicht', hrefSuffix: 'dashboard' },
  { label: 'Zahlungen', hrefSuffix: 'zahlungen' },
  { label: 'Warteliste', hrefSuffix: 'warteliste' },
  { label: 'Aufgaben', hrefSuffix: 'aufgaben' },
  { label: 'Konfiguration', hrefSuffix: 'konfiguration' },
]

export default async function OrgDashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const token = await getAdminToken()
  if (!token) redirect(`/pilot/${orgSlug}/login`)

  const org = await fetchOrganization(orgSlug)
  if (!org) redirect(`/pilot/${orgSlug}/login`)

  let camps
  try {
    camps = await fetchCampsAdmin(orgSlug, token)
  } catch (err) {
    if (err instanceof AdminAuthError) redirect(`/pilot/${orgSlug}/login`)
    throw err
  }

  const registrationsByCamp = await Promise.all(
    camps.map(camp => fetchRegistrationsAdmin(orgSlug, camp.slug, token)),
  )

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const nextCamp = pickNextCamp(campsWithStats)
  const tasks = buildTasks(campsWithStats)
  const [firstTask, ...restTasks] = tasks

  const brand = computeBrandTokens(org.primary_color)
  const tabs = ORG_TABS.map(t => ({ label: t.label, href: `/pilot/${orgSlug}/${t.hrefSuffix}` }))

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
            ? [
                { label: 'Tage', value: String(Math.max(0, daysUntil(nextCamp.camp.start_date))) },
                {
                  label: de.dashboard.spotsLabel,
                  value: `${nextCamp.registeredCount}/${nextCamp.camp.capacity}`,
                  bar: nextCamp.camp.capacity > 0 ? nextCamp.registeredCount / nextCamp.camp.capacity : 0,
                  barColor: brand.brand,
                },
                { label: de.dashboard.openPaymentsLabel, value: String(nextCamp.openPaymentsCount) },
                { label: de.dashboard.waitlistLabel, value: String(nextCamp.waitlistCount) },
              ]
            : []
        }
        tabs={tabs}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-6 py-10">
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
          <h2 className="cp-title mb-4">{de.dashboard.allCamps}</h2>
          {campsWithStats.length === 0 ? (
            <EmptyState title={de.dashboard.noCamps} />
          ) : (
            <div className="rounded-[var(--cp-r-card)] border px-1" style={{ borderColor: 'var(--cp-line)', background: 'var(--cp-surface)' }}>
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
