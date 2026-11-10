import { PLAN_CAMP_LIMIT_MESSAGE, type OrganizationAdmin } from '../../lib/saasAdminApi'

/** Starter: ein aktives Camp inklusive. Ist es belegt, ist jede weitere Camp-Anlage gesperrt (auch als Entwurf).
 * Liefert die Meldung oder null. Fehlende Angaben sperren nie; das letzte Wort hat der Server (409). */
export function campCreateBlockedMessage(org: Pick<OrganizationAdmin, 'plan' | 'active_camps'> | null | undefined): string | null {
  return org?.plan === 'starter' && (org.active_camps ?? 0) >= 1 ? PLAN_CAMP_LIMIT_MESSAGE : null
}
