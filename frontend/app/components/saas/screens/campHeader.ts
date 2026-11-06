import { computeMoneyStats } from '../commandCenterLogic'
import { computeCampStats } from '../dashboardLogic'
import { campTabs } from '../navTabs'
import type { PageHeaderProps } from '../shell/PageHeader'
import { de, formatDateRange, formatEuro } from '../../../lib/i18n/de'
import type { CampAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'

/** One header for every camp tab: same title, meta, KPI row and tab row, so switching tabs never shifts the page. */
export function campHeader(orgSlug: string, campSlug: string, camp: CampAdmin, registrations?: RegistrationAdmin[]): PageHeaderProps {
  const meta = [formatDateRange(camp.start_date, camp.end_date), camp.location].filter(Boolean).join(' · ')
  let metrics: PageHeaderProps['metrics']
  if (registrations) {
    const stats = computeCampStats(camp, registrations)
    const money = computeMoneyStats(camp, registrations)
    metrics = [
      { label: de.dashboard.spotsLabel, value: `${stats.registeredCount}/${camp.capacity}`, bar: camp.capacity > 0 ? stats.registeredCount / camp.capacity : 0 },
      { label: 'Eingegangen', value: formatEuro(money.collectedCents) },
      { label: 'Offen', value: formatEuro(money.openCents) },
      { label: de.dashboard.waitlistLabel, value: String(stats.waitlistCount) },
    ]
  }
  return {
    backHref: `/pilot/${orgSlug}/camps`,
    backLabel: 'Alle Camps',
    title: camp.title,
    subtitle: meta,
    metrics,
    tabs: campTabs(orgSlug, campSlug),
    tabsLabel: 'Camp-Bereiche',
  }
}
