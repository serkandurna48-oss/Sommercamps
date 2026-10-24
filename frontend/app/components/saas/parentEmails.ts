import type { RegistrationAdmin } from '../../lib/saasAdminApi'

export function parentEmails(
  registrations: ReadonlyArray<Pick<RegistrationAdmin, 'status' | 'parent_email'>>,
  includeWaitlist = false,
): string[] {
  return [...new Set(registrations
    .filter(r => r.status !== 'cancelled' && (includeWaitlist || r.status !== 'waitlist'))
    .map(r => r.parent_email.trim().toLowerCase())
    .filter(Boolean))]
}
