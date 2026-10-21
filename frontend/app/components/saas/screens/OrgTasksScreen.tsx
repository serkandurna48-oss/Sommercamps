import { computeBrandTokens } from '../brandPipeline'
import { buildTasks, computeCampStats } from '../dashboardLogic'
import MatchdayBand from '../shell/MatchdayBand'
import TaskFilterList from '../tasks/TaskFilterList'
import { orgTabs } from '../navTabs'
import { de } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'

export default function OrgTasksScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {

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
        title={de.command.tasks}
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
