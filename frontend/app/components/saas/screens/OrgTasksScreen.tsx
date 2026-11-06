import { buildTasks, computeCampStats } from '../dashboardLogic'
import PageHeader from '../shell/PageHeader'
import TaskFilterList from '../tasks/TaskFilterList'
import { de } from '../../../lib/i18n/de'
import type { OrganizationScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function OrgTasksScreen({ orgSlug, camps, registrationsByCamp }: OrganizationScreenProps) {

  const campsWithStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i]))
  const tasks = buildTasks(campsWithStats)

  return (
    <>
      <PageHeader
        title={de.command.tasks}
        subtitle={de.tasksPage.subtitleOrg}
        metrics={[{ label: de.tasksPage.heading, value: String(tasks.length) }]}
      />

      <main className={PAGE_READING}>
        <TaskFilterList tasks={tasks} orgSlug={orgSlug} emptyLabel={de.tasksPage.emptyOrg} />
      </main>
    </>
  )
}
