import type { ParticipantFilter } from '../commandCenterLogic'
import type { ParticipantSort } from '../registrationDates'
import EmptyCampScreen from './EmptyCampScreen'
import { computeBrandTokens } from '../brandPipeline'
import PageHeader from '../shell/PageHeader'
import { ButtonLink } from '../ui/Button'
import ParticipantList from '../data/ParticipantList'
import { campHeader } from './campHeader'
import type { CampScreenProps } from './types'
import { ADMIN_PAGE } from '../ui/pageLayout'

export default function CampDetailScreen({ orgSlug, campSlug, org, camp, registrations, initialFilter = 'all', initialSort = 'newest' }: CampScreenProps & { initialFilter?: ParticipantFilter; initialSort?: ParticipantSort }) {
  if (!camp) return <EmptyCampScreen orgSlug={orgSlug} org={org} />

  const brand = computeBrandTokens(org.primary_color)

  return (
    <>
      <PageHeader
        {...campHeader(orgSlug, campSlug, camp, registrations)}
        action={<ButtonLink variant="secondary" href={`/pilot/${orgSlug}/camps/new?von=${encodeURIComponent(campSlug)}`}>Camp duplizieren</ButtonLink>}
      />

      <main className={ADMIN_PAGE}>
        <ParticipantList key={`${campSlug}-${initialFilter}-${initialSort}`} initialFilter={initialFilter} initialSort={initialSort} registrations={registrations} brandColor={brand.brand} orgSlug={orgSlug} orgName={org.name} orgLogoUrl={org.logo_url} campSlug={campSlug} camp={camp} questions={org.registration_questions ?? []} />
      </main>
    </>
  )
}
