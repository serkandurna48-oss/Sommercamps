import { computeBrandTokens } from '../brandPipeline'
import { computeCampStats, buildTasks } from '../dashboardLogic'
import MatchdayBand from '../shell/MatchdayBand'
import TaskFilterList from '../tasks/TaskFilterList'
import { campTabs } from '../navTabs'
import { de, formatDateRange } from '../../../lib/i18n/de'

import EmptyCampScreen from './EmptyCampScreen'
import type { CampScreenProps } from './types'

export default function CampTasksScreen({ orgSlug, campSlug, org, camp, registrations }: CampScreenProps) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

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
        backToCamps
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
