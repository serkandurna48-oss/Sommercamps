import { computeBrandTokens } from '../brandPipeline'
import { buildTasks, computeCampStats } from '../dashboardLogic'
import MatchdayBand from '../shell/MatchdayBand'
import TaskFilterList from '../tasks/TaskFilterList'
import { orgTabs } from '../navTabs'
import { de } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function OrgTasksScreen({ orgSlug, org, camps, registrationsByCamp }: OrganizationScreenProps) {

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const tasks = buildTasks(campsWithStats)
  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <MatchdayBand backHref={`/pilot/${orgSlug}/dashboard`}
        orgSlug={orgSlug}
        orgName={org.name}
        orgLogoUrl={org.logo_url}
        title={de.command.tasks}
        subtitle={de.tasksPage.subtitleOrg}
        metrics={[{ label: de.tasksPage.heading, value: String(tasks.length) }]}
        tabs={orgTabs(orgSlug)}
        brandColor={brand.brand}
      />

      <main className={PAGE_READING}>
        <TaskFilterList tasks={tasks} orgSlug={orgSlug} emptyLabel={de.tasksPage.emptyOrg} />
      </main>
    </>
  )
}
