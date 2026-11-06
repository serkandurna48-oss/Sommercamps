import PageHeader from '../shell/PageHeader'
import EmptyState from '../state/EmptyState'
import type { OrganizationIdentityProps } from './types'
import { PAGE_READING } from '../ui/pageLayout'

export default function EmptyCampScreen({ orgSlug }: OrganizationIdentityProps) {
  return (
    <>
      <PageHeader
        backHref={`/pilot/${orgSlug}/camps`}
        backLabel="Alle Camps"
        title="Kein Camp vorhanden"
      />
      <main className={PAGE_READING}>
        <EmptyState title="Noch keine Camps angelegt" />
      </main>
    </>
  )
}
