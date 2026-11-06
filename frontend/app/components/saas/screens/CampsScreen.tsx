import DashboardCampsCard from '../data/DashboardCampsCard'
import { computeCampStats } from '../dashboardLogic'
import PageHeader from '../shell/PageHeader'
import { ButtonLink } from '../ui/Button'
import { ADMIN_PAGE } from '../ui/pageLayout'
import { IconPlus } from '../icons'
import type { OrganizationScreenProps } from './types'

/** Camps overview (sidebar "Angebote → Camps"): all camps with occupancy, grouped by state. */
export default function CampsScreen({ orgSlug, camps, registrationsByCamp }: OrganizationScreenProps) {
  const withStats = camps.map((camp, i) => computeCampStats(camp, registrationsByCamp[i] ?? []))
  const today = new Date().toISOString().slice(0, 10)
  const live = withStats.filter(c => c.camp.status === 'published' && c.camp.end_date >= today)
  const occupied = live.reduce((sum, c) => sum + c.registeredCount, 0)
  const capacity = live.reduce((sum, c) => sum + c.camp.capacity, 0)
  const waiting = withStats.reduce((sum, c) => sum + c.waitlistCount, 0)
  const drafts = withStats.filter(c => c.camp.status === 'draft').length

  return (
    <>
      <PageHeader
        title="Camps"
        subtitle="Feriencamps mit Anmeldung über deine Elternseite."
        action={<ButtonLink href={`/pilot/${orgSlug}/camps/new`} variant="primary"><IconPlus size={16} />Camp anlegen</ButtonLink>}
        metrics={[
          { label: 'Laufende Camps', value: String(live.length) },
          { label: 'Plätze belegt', value: capacity > 0 ? `${occupied}/${capacity}` : '–', bar: capacity > 0 ? occupied / capacity : undefined },
          { label: 'Warteliste', value: String(waiting) },
          { label: 'Entwürfe', value: String(drafts) },
        ]}
      />
      <main className={ADMIN_PAGE}>
        <DashboardCampsCard camps={withStats} orgSlug={orgSlug} action={null} />
      </main>
    </>
  )
}
