import { computeBrandTokens } from '../../../../../../components/saas/brandPipeline'
import { computeCampStats, buildTasks } from '../../../../../../components/saas/dashboardLogic'
import { loadCampAdminData } from '../../../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../../../components/saas/shell/MatchdayBand'
import TaskFilterList from '../../../../../../components/saas/tasks/TaskFilterList'
import { campTabs } from '../../../../../../components/saas/navTabs'
import { de, formatDateRange } from '../../../../../../lib/i18n/de'

export default async function CampTasksPage({
  params,
}: {
  params: Promise<{ org: string; campSlug: string }>
}) {
  const { org: orgSlug, campSlug } = await params
  const { org, camp, registrations } = await loadCampAdminData(orgSlug, campSlug)

  const stats = computeCampStats(camp, registrations)
  const tasks = buildTasks([stats])
  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={camp.title}
        subtitle={formatDateRange(camp.start_date, camp.end_date)}
        metrics={[{ label: de.tasksPage.heading, value: String(tasks.length) }]}
        tabs={campTabs(orgSlug, campSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-6" style={{ color: 'var(--cp-ink)' }}>
          {de.tasksPage.heading}
        </h2>
        <TaskFilterList tasks={tasks} orgSlug={orgSlug} brandColor={brand.brand} emptyLabel={de.tasksPage.emptyCamp} />
      </main>
    </>
  )
}
