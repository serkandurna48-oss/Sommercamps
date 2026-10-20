import type { CampAdmin, OrganizationAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'

export interface OrganizationIdentityProps {
  orgSlug: string
  org: OrganizationAdmin
}

export interface OrganizationScreenProps extends OrganizationIdentityProps {
  camps: CampAdmin[]
  registrationsByCamp: RegistrationAdmin[][]
}

export interface CampScreenProps extends OrganizationIdentityProps {
  campSlug: string
  camp: CampAdmin | undefined
  registrations: RegistrationAdmin[]
}
