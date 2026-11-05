import type { TrainingPaymentGroup } from '../training/trainingPayments'
import type { CampAdmin, OrganizationAdmin, RegistrationAdmin } from '../../../lib/saasAdminApi'

export interface OrganizationIdentityProps {
  orgSlug: string
  org: OrganizationAdmin
}

export interface OrganizationScreenProps extends OrganizationIdentityProps {
  camps: CampAdmin[]
  registrationsByCamp: RegistrationAdmin[][]
}

export interface OrgPaymentsScreenProps extends OrganizationScreenProps {
  /** Trainingstermine mit Buchungen (Zahlungen), getrennt von den Camps. */
  trainingPayments?: TrainingPaymentGroup[]
}

export interface CampScreenProps extends OrganizationIdentityProps {
  campSlug: string
  camp: CampAdmin | undefined
  registrations: RegistrationAdmin[]
}
