import { computeBrandTokens } from '../../../../components/saas/brandPipeline'
import { buildTasks, computeCampStats } from '../../../../components/saas/dashboardLogic'
import { loadOrgAdminData } from '../../../../components/saas/orgAdminData'
import MatchdayBand from '../../../../components/saas/shell/MatchdayBand'
import TaskFilterList from '../../../../components/saas/tasks/TaskFilterList'
import { orgTabs } from '../../../../components/saas/navTabs'
import { de } from '../../../../lib/i18n/de'

export default async function OrgTasksPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params
  const { org, camps, registrationsByCamp } = await loadOrgAdminData(orgSlug)

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const tasks = buildTasks(campsWithStats)
  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand
        variant="compact"
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={org.name}
        metrics={[{ label: de.tasksPage.heading, value: String(tasks.length) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className="mx-auto max-w-[920px] px-4 py-10 pb-24 md:px-8 md:pb-10 xl:px-6">
        <h2 className="cp-title mb-1" style={{ color: 'var(--cp-ink)' }}>
          {de.tasksPage.heading}
        </h2>
        <p className="cp-body mb-6" style={{ color: 'var(--cp-muted)' }}>
          {de.tasksPage.subtitleOrg}
        </p>
        <TaskFilterList tasks={tasks} orgSlug={orgSlug} brandColor={brand.brand} emptyLabel={de.tasksPage.emptyOrg} />
      </main>
    </>
  )
}
