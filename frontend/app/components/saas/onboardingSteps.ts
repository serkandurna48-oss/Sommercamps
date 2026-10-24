import type { CampAdmin, OrganizationAdmin } from '../../lib/saasAdminApi'

export interface OnboardingSteps {
  /** contact_email + legal_address + terms_text all non-empty */
  step1Done: boolean
  /** at least one camp exists */
  step2Done: boolean
  /**
   * site_published + at least one published camp.
   * When true, the onboarding card must not be rendered.
   */
  step3Done: boolean
}

export function computeOnboardingSteps(org: OrganizationAdmin, camps: CampAdmin[]): OnboardingSteps {
  const step1Done = !!org.contact_email?.trim() && !!org.legal_address?.trim() && !!org.terms_text?.trim()
  const step2Done = camps.length > 0
  const step3Done = org.site_published && camps.some(c => c.status === 'published')
  return { step1Done, step2Done, step3Done }
}

/**
 * Returns the first wizard step (1–4) that is not yet complete:
 *   1 Auftritt    – primary_color not set
 *   2 Rechtliches – contact_email / legal_address / terms_text missing
 *   3 Erstes Camp – no camp exists
 *   4 Prüfen      – all above done, waiting for review / approval
 */
export function computeWizardStep(org: OrganizationAdmin, camps: CampAdmin[]): 1 | 2 | 3 | 4 {
  if (!org.primary_color?.trim()) return 1
  const { step1Done, step2Done } = computeOnboardingSteps(org, camps)
  if (!step1Done) return 2
  if (!step2Done) return 3
  return 4
}

/** Required org fields that are currently empty (independent of step3Done). */
export function missingRequiredOrgFields(org: OrganizationAdmin): string[] {
  const missing: string[] = []
  if (!org.contact_email?.trim()) missing.push('Kontakt-E-Mail')
  if (!org.legal_address?.trim()) missing.push('Anschrift')
  if (!org.terms_text?.trim()) missing.push('Teilnahmebedingungen')
  return missing
}
