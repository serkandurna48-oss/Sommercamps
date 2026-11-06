import TodayRegistrations from '../data/TodayRegistrations'
import { todayRegistrations } from '../registrationDates'
import PageHeader from '../shell/PageHeader'
import type { OrganizationScreenProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function NewRegistrationsScreen({ orgSlug, camps, registrationsByCamp }: OrganizationScreenProps) {
  return (
    <>
      <PageHeader
        title="Neue Anmeldungen"
        subtitle="Heute eingegangen, über alle Camps. Die vollständige Liste je Camp finden Sie unter Camps."
      />
      <main className={PAGE_READING}>
        <TodayRegistrations entries={todayRegistrations(camps, registrationsByCamp)} orgSlug={orgSlug} fullList />
      </main>
    </>
  )
}