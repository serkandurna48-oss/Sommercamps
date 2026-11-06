import { computeCampStats, buildTasks } from '../dashboardLogic'
import PageHeader from '../shell/PageHeader'
import TaskFilterList from '../tasks/TaskFilterList'
import { campHeader } from './campHeader'
import { de } from '../../../lib/i18n/de'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function CampTasksScreen({ orgSlug, campSlug, org, camp, registrations }: CampScreenProps) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const stats = computeCampStats(camp, registrations)
  const tasks = buildTasks([stats])

  return (
    <>
      <PageHeader {...campHeader(orgSlug, campSlug, camp, registrations)} />

      <main className={PAGE_READING}>
        <h2 className="sr-only">{de.tasksPage.heading}</h2>
        <TaskFilterList tasks={tasks} orgSlug={orgSlug} emptyLabel={de.tasksPage.emptyCamp} />
      </main>
    </>
  )
}
